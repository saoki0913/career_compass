"""ES review router."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, AsyncGenerator, Any, Awaitable, Callable
import json
import asyncio
import re
import time
from urllib.parse import urlparse

from app.config import settings
from app.utils.secure_logger import get_logger
from app.utils.llm import (
    call_llm_text_with_error,
    call_llm_with_error,
    sanitize_es_content,
    detect_es_injection_risk,
    sanitize_prompt_input,
    resolve_feature_model_metadata,
)
from app.utils.qwen_es_review import (
    call_qwen_es_review_json_with_error,
    call_qwen_es_review_text_with_error,
    is_qwen_es_review_enabled,
    resolve_qwen_es_review_model_name,
)
from app.utils.vector_store import (
    get_enhanced_context_for_review_with_sources,
    get_context_for_source_urls_with_sources,
    has_company_rag,
    get_company_rag_status,
    get_dynamic_context_length,
)
from app.utils.content_types import content_type_label

logger = get_logger(__name__)
from app.utils.telemetry import (
    record_parse_failure,
    record_rag_context,
)
from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    build_template_fallback_rewrite_prompt,
    build_template_improvement_prompt,
    build_template_length_fix_prompt,
    build_template_rewrite_prompt,
    get_company_honorific,
    get_template_company_grounding_policy,
    get_template_rag_profile,
)
from app.prompts.qwen_es_templates import (
    build_qwen_template_rewrite_prompt,
)
from app.prompts.reference_es import (
    build_reference_quality_block,
    detect_reference_text_overlap,
    load_reference_examples,
)

router = APIRouter(prefix="/api/es", tags=["es-review"])

ReviewJSONCaller = Callable[..., Awaitable[Any]]
ReviewTextCaller = Callable[..., Awaitable[Any]]

REWRITE_MAX_ATTEMPTS = 5
FALLBACK_REWRITE_ATTEMPTS = 1
LENGTH_FIX_REWRITE_ATTEMPTS = 1
IMPROVEMENT_MAX_TOKENS = 800
PROMPT_USER_FACT_LIMIT = 8
COMPANY_EVIDENCE_CARD_LIMIT = 5
SHORT_ANSWER_CHAR_MAX = 220
SOFT_MIN_SHORTFALL_LIMIT = 20
LENGTH_FIX_DELTA_LIMIT = 25
NON_CLAUDE_LENGTH_FIX_DELTA_LIMIT = 45
NON_CLAUDE_TIGHT_LENGTH_TEMPLATES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
    "role_course_reason",
}
SSE_KEEPALIVE_INTERVAL_SECONDS = 15.0
IMPROVEMENT_PARSE_RETRY_INSTRUCTIONS = (
    "必ず有効なJSONだけを返してください。"
    "コードブロック、前置き、後書きは禁止です。"
    "top3 は 1 件以上 3 件以下で、各要素は category / issue / suggestion の3キーのみ。"
    "category は 12 文字以内、issue と suggestion は各 60 文字以内、改行は禁止です。"
)
GENERIC_REWRITE_VALIDATION_ERROR = "条件を満たす改善案を生成できませんでした。再実行してください。"
GENERIC_INPUT_VALIDATION_ERROR = "入力内容を確認して再実行してください。"
QWEN_REVIEW_VARIANT = "qwen3-beta"
ROLE_SENSITIVE_TEMPLATES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "self_pr",
    "post_join_goals",
    "role_course_reason",
}
ROLE_SUPPORTIVE_CONTENT_TYPES = {
    "new_grad_recruitment",
    "employee_interviews",
    "corporate_site",
}
ROLE_PROGRAM_EVIDENCE_THEMES = {
    "役割理解",
    "インターン機会",
    "現場期待",
}
COMPANY_DIRECTION_EVIDENCE_THEMES = {
    "企業理解",
    "事業理解",
    "価値観",
    "将来接続",
    "採用方針",
    "成長領域",
    "成長機会",
}
SUPPORTING_PROMPT_FACT_SOURCES = {
    "gakuchika_summary",
    "document_section",
    "gakuchika_raw_material",
}
GENERIC_ROLE_PATTERNS = (
    r"^総合職$",
    r"^総合職[ABCD]?$",
    r"^総合コース$",
    r"^オープンコース$",
    r"^open\s*course$",
    r"^open$",
    r"^global\s*staff$",
)


# Template-based review types (must be defined before ReviewRequest)
class TemplateRequest(BaseModel):
    """Request for template-based ES review."""

    template_type: str  # Template ID from TEMPLATE_DEFS
    company_name: Optional[str] = None
    industry: Optional[str] = None
    question: str  # ES question text
    answer: str  # User's answer
    char_min: Optional[int] = None
    char_max: Optional[int] = None
    intern_name: Optional[str] = None  # Intern program name (for intern templates)
    role_name: Optional[str] = (
        None  # Role/course name (for role_course_reason template)
    )


class TemplateVariant(BaseModel):
    """A single variant in template review."""

    text: str
    char_count: int
    pros: list[str]
    cons: list[str]
    keywords_used: list[str]
    keyword_sources: list[str]


class TemplateSource(BaseModel):
    """Source reference for template keywords."""

    source_id: str
    source_url: str
    content_type: str
    content_type_label: Optional[str] = None
    title: Optional[str] = None
    domain: Optional[str] = None
    excerpt: Optional[str] = None


class RoleContext(BaseModel):
    primary_role: Optional[str] = None
    role_candidates: list[str] = []
    source: str = "none"


class ProfileContext(BaseModel):
    university: Optional[str] = None
    faculty: Optional[str] = None
    graduation_year: Optional[int] = None
    target_industries: list[str] = Field(default_factory=list)
    target_job_types: list[str] = Field(default_factory=list)


class GakuchikaContextItem(BaseModel):
    title: str
    source_status: str = "structured_summary"
    strengths: list[dict[str, Any] | str] = Field(default_factory=list)
    action_text: Optional[str] = None
    result_text: Optional[str] = None
    numbers: list[str] = Field(default_factory=list)
    content_excerpt: Optional[str] = None
    fact_spans: list[str] = Field(default_factory=list)


class DocumentSectionContext(BaseModel):
    title: str
    content: str


class DocumentContext(BaseModel):
    other_sections: list[DocumentSectionContext] = Field(default_factory=list)


class ReviewMeta(BaseModel):
    llm_provider: str = "claude"
    llm_model: Optional[str] = None
    review_variant: str = "standard"
    grounding_mode: str = "none"
    primary_role: Optional[str] = None
    role_source: Optional[str] = None
    triggered_enrichment: bool = False
    enrichment_completed: bool = False
    enrichment_sources_added: int = 0
    reference_es_count: int = 0
    reference_es_mode: str = "quality_profile_and_overlap_guard"
    reference_quality_profile_used: bool = False
    reference_outline_used: bool = False
    company_grounding_policy: str = "assistive"
    company_evidence_count: int = 0
    evidence_coverage_level: str = "none"
    weak_evidence_notice: bool = False
    injection_risk: Optional[str] = None
    user_context_sources: list[str] = Field(default_factory=list)
    hallucination_guard_mode: str = "strict"
    fallback_to_generic: bool = False
    improvement_timeout_fallback: bool = False
    timeout_stage: Optional[str] = None
    timeout_recovered: bool = False
    rewrite_generation_mode: str = "normal"
    length_policy: str = "strict"
    length_shortfall: int = 0
    length_fix_attempted: bool = False
    length_fix_result: str = "not_needed"


class TemplateReview(BaseModel):
    """Template-based review result."""

    template_type: str
    variants: list[TemplateVariant]
    keyword_sources: list[TemplateSource]


class ReviewRequest(BaseModel):
    content: str
    section_id: Optional[str] = None
    has_company_rag: bool = False  # Whether company RAG data is available
    company_id: Optional[str] = None  # Company ID for RAG context lookup
    section_title: Optional[str] = None  # Question title for section review
    section_char_limit: Optional[int] = None  # Character limit for section
    template_request: Optional[TemplateRequest] = None
    role_context: Optional[RoleContext] = None
    retrieval_query: Optional[str] = None
    profile_context: Optional[ProfileContext] = None
    gakuchika_context: list[GakuchikaContextItem] = Field(default_factory=list)
    document_context: Optional[DocumentContext] = None
    llm_model: Optional[str] = None
    prestream_enrichment_attempted: bool = False
    prestream_enrichment_completed: bool = False
    prestream_enrichment_sources_added: int = 0
    prestream_source_urls: list[str] = Field(default_factory=list)
    user_provided_corporate_urls: list[str] = Field(default_factory=list)


class Issue(BaseModel):
    category: str  # 評価カテゴリ
    issue: str  # 問題点の説明
    suggestion: str  # 改善提案
    issue_id: Optional[str] = None
    required_action: Optional[str] = None
    must_appear: Optional[str] = None
    priority_rank: Optional[int] = None
    why_now: Optional[str] = None  # 今この改善を優先すべき理由
    difficulty: Optional[str] = None  # easy | medium | hard


class ReviewResponse(BaseModel):
    top3: list[Issue]
    rewrites: list[str]
    template_review: Optional[TemplateReview] = None
    review_meta: Optional[ReviewMeta] = None


class CompanyReviewStatusResponse(BaseModel):
    status: str
    ready_for_es_review: bool
    reason: str
    total_chunks: int
    strategic_chunks: int
    last_updated: Optional[str] = None


def _get_company_grounding_policy(template_type: str) -> str:
    return get_template_company_grounding_policy(template_type)


def _company_grounding_is_required(template_type: str) -> bool:
    return _get_company_grounding_policy(template_type) == "required"


def _company_grounding_is_assistive(template_type: str) -> bool:
    return _get_company_grounding_policy(template_type) == "assistive"


def _iter_string_leaves(field_name: str, value: Any) -> list[tuple[str, str]]:
    if value is None:
        return []
    if isinstance(value, str):
        return [(field_name, value)]
    if isinstance(value, list):
        leaves: list[tuple[str, str]] = []
        for index, item in enumerate(value):
            leaves.extend(_iter_string_leaves(f"{field_name}[{index}]", item))
        return leaves
    if isinstance(value, dict):
        leaves: list[tuple[str, str]] = []
        for key, item in value.items():
            leaves.extend(_iter_string_leaves(f"{field_name}.{key}", item))
        return leaves
    return []


def _collect_injection_scan_targets(request: ReviewRequest) -> list[tuple[str, str]]:
    targets: list[tuple[str, str]] = [("content", request.content)]

    if request.section_title:
        targets.append(("section_title", request.section_title))
    if request.retrieval_query:
        targets.append(("retrieval_query", request.retrieval_query))

    template_request = request.template_request
    if template_request:
        targets.extend(
            [
                ("template.company_name", template_request.company_name or ""),
                ("template.industry", template_request.industry or ""),
                ("template.question", template_request.question),
                ("template.answer", template_request.answer),
                ("template.intern_name", template_request.intern_name or ""),
                ("template.role_name", template_request.role_name or ""),
            ]
        )

    role_context = request.role_context
    if role_context:
        targets.append(("role_context.primary_role", role_context.primary_role or ""))
        for index, candidate in enumerate(role_context.role_candidates):
            targets.append((f"role_context.role_candidates[{index}]", candidate))

    profile_context = request.profile_context
    if profile_context:
        targets.extend(
            [
                ("profile.university", profile_context.university or ""),
                ("profile.faculty", profile_context.faculty or ""),
            ]
        )
        for index, industry in enumerate(profile_context.target_industries):
            targets.append((f"profile.target_industries[{index}]", industry))
        for index, job_type in enumerate(profile_context.target_job_types):
            targets.append((f"profile.target_job_types[{index}]", job_type))

    for index, item in enumerate(request.gakuchika_context):
        targets.extend(
            [
                (f"gakuchika[{index}].title", item.title),
                (f"gakuchika[{index}].action_text", item.action_text or ""),
                (f"gakuchika[{index}].result_text", item.result_text or ""),
                (f"gakuchika[{index}].content_excerpt", item.content_excerpt or ""),
            ]
        )
        for fact_index, fact_span in enumerate(item.fact_spans):
            targets.append((f"gakuchika[{index}].fact_spans[{fact_index}]", fact_span))
        for leaf_name, leaf_value in _iter_string_leaves(
            f"gakuchika[{index}].strengths", item.strengths
        ):
            targets.append((leaf_name, leaf_value))

    document_context = request.document_context
    if document_context:
        for index, section in enumerate(document_context.other_sections):
            targets.extend(
                [
                    (f"document_context.other_sections[{index}].title", section.title),
                    (f"document_context.other_sections[{index}].content", section.content),
                ]
            )

    return [(field_name, value) for field_name, value in targets if value]


def _detect_request_injection_risk(request: ReviewRequest) -> tuple[str, list[str]]:
    risk_priority = {"none": 0, "medium": 1, "high": 2}
    detected_risk = "none"
    detected_reasons: list[str] = []

    for field_name, value in _collect_injection_scan_targets(request):
        field_risk, field_reasons = detect_es_injection_risk(value)
        if risk_priority[field_risk] > risk_priority[detected_risk]:
            detected_risk = field_risk
        for reason in field_reasons:
            tagged_reason = f"{field_name}:{reason}"
            if tagged_reason not in detected_reasons:
                detected_reasons.append(tagged_reason)

    return detected_risk, detected_reasons


def _sanitize_nested_prompt_value(value: Any, *, max_length: int = 500) -> Any:
    if isinstance(value, str):
        return sanitize_prompt_input(value, max_length=max_length).strip()
    if isinstance(value, list):
        return [
            _sanitize_nested_prompt_value(item, max_length=max_length)
            for item in value
        ]
    if isinstance(value, dict):
        return {
            key: _sanitize_nested_prompt_value(item, max_length=max_length)
            for key, item in value.items()
        }
    return value


def _sanitize_optional_prompt_text(
    value: Optional[str], *, max_length: int = 500
) -> Optional[str]:
    if value is None:
        return None
    sanitized = sanitize_prompt_input(value, max_length=max_length).strip()
    return sanitized or None


def _sanitize_review_request(request: ReviewRequest) -> None:
    request.content = sanitize_es_content(request.content, max_length=5000)
    request.section_title = _sanitize_optional_prompt_text(
        request.section_title, max_length=300
    )
    request.retrieval_query = _sanitize_optional_prompt_text(
        request.retrieval_query, max_length=600
    )

    template_request = request.template_request
    if template_request:
        template_request.company_name = _sanitize_optional_prompt_text(
            template_request.company_name, max_length=200
        )
        template_request.industry = _sanitize_optional_prompt_text(
            template_request.industry, max_length=100
        )
        template_request.question = sanitize_prompt_input(
            template_request.question, max_length=300
        ).strip()
        template_request.answer = sanitize_es_content(
            template_request.answer, max_length=5000
        )
        template_request.intern_name = _sanitize_optional_prompt_text(
            template_request.intern_name, max_length=200
        )
        template_request.role_name = _sanitize_optional_prompt_text(
            template_request.role_name, max_length=200
        )

    role_context = request.role_context
    if role_context:
        role_context.primary_role = _sanitize_optional_prompt_text(
            role_context.primary_role, max_length=200
        )
        role_context.role_candidates = [
            candidate
            for candidate in (
                _sanitize_optional_prompt_text(candidate, max_length=200)
                for candidate in role_context.role_candidates
            )
            if candidate
        ]

    profile_context = request.profile_context
    if profile_context:
        profile_context.university = _sanitize_optional_prompt_text(
            profile_context.university, max_length=200
        )
        profile_context.faculty = _sanitize_optional_prompt_text(
            profile_context.faculty, max_length=200
        )
        profile_context.target_industries = [
            industry
            for industry in (
                _sanitize_optional_prompt_text(item, max_length=100)
                for item in profile_context.target_industries
            )
            if industry
        ]
        profile_context.target_job_types = [
            job_type
            for job_type in (
                _sanitize_optional_prompt_text(item, max_length=100)
                for item in profile_context.target_job_types
            )
            if job_type
        ]

    for item in request.gakuchika_context:
        item.title = sanitize_prompt_input(item.title, max_length=200).strip()
        item.action_text = _sanitize_optional_prompt_text(item.action_text, max_length=400)
        item.result_text = _sanitize_optional_prompt_text(item.result_text, max_length=400)
        item.content_excerpt = _sanitize_optional_prompt_text(
            item.content_excerpt, max_length=800
        )
        item.fact_spans = [
            fact_span
            for fact_span in (
                _sanitize_optional_prompt_text(value, max_length=200)
                for value in item.fact_spans
            )
            if fact_span
        ]
        item.strengths = _sanitize_nested_prompt_value(item.strengths, max_length=200)

    document_context = request.document_context
    if document_context:
        for section in document_context.other_sections:
            section.title = sanitize_prompt_input(section.title, max_length=200).strip()
            section.content = sanitize_prompt_input(
                section.content, max_length=800
            ).strip()


SEMANTIC_COMPRESSION_RULES: list[tuple[str, str]] = [
    (r"ということ", "こと"),
    (r"することができる", "できる"),
    (r"することが可能", "できる"),
    (r"ことによって", "ことで"),
    (r"と考えている", "と考える"),
    (r"と考え、", "と考え"),
    (r"非常に", ""),
    (r"大変", ""),
    (r"そのため、", ""),
    (r"一方で、", ""),
    (r"加えて、", ""),
    (r"大きな価値", "価値"),
    (r"新たな価値", "価値"),
    (r"具体的には、", ""),
    (r"その中で、", ""),
    (r"また、", ""),
    (r"さらに、", ""),
    (r"そこで、", ""),
    (r"私自身", "私"),
    (r"私は", ""),
    (r"私が", ""),
    (r"ことができた", "できた"),
    (r"ことができる", "できる"),
    (r"させていただく", "する"),
    (r"であると考える", "と考える"),
    (r"につながると考える", "につながる"),
]


def _normalize_repaired_text(text: str) -> str:
    """Remove wrapper artifacts while preserving the body text."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()
    if cleaned.startswith('"') and cleaned.endswith('"'):
        cleaned = cleaned[1:-1].strip()
    return cleaned


def _derive_char_min(char_max: Optional[int]) -> Optional[int]:
    if not char_max:
        return None
    return max(0, char_max - 10)


def _is_qwen_review_variant(review_variant: str | None) -> bool:
    return (review_variant or "").strip() == QWEN_REVIEW_VARIANT


def _start_qwen_timeout_budget(review_variant: str) -> float | None:
    if not _is_qwen_review_variant(review_variant):
        return None
    return time.monotonic() + max(1, settings.qwen_es_review_total_budget_seconds)


def _remaining_qwen_timeout_budget_seconds(deadline: float | None) -> int | None:
    if deadline is None:
        return None
    remaining = int(deadline - time.monotonic())
    return max(0, remaining)


def _qwen_stage_timeout_seconds(stage: str, deadline: float | None) -> int | None:
    if deadline is None:
        return None
    stage_defaults = {
        "improvement": settings.qwen_es_review_timeout_improvement_seconds,
        "rewrite": settings.qwen_es_review_timeout_rewrite_seconds,
        "compact_rewrite": settings.qwen_es_review_timeout_compact_rewrite_seconds,
        "length_fix": settings.qwen_es_review_timeout_length_fix_seconds,
    }
    configured = stage_defaults.get(stage, settings.qwen_es_review_timeout_seconds)
    remaining = _remaining_qwen_timeout_budget_seconds(deadline)
    if remaining is None:
        return None
    if remaining <= 0:
        return 0
    return max(1, min(configured, remaining))


def _qwen_timeout_kwargs(timeout_seconds: int | None) -> dict[str, Any]:
    if timeout_seconds is None or timeout_seconds <= 0:
        return {}
    return {"timeout_seconds": timeout_seconds}


def _describe_retry_reason(reason: str) -> str:
    if not reason:
        return "不明な理由で再試行します。"
    if "タイムアウト" in reason:
        return f"{reason} より短い構成で再試行します。"
    if reason.startswith("改善案が空でした"):
        return "改善案が空だったため、再試行します。"
    if reason.startswith("文字数制約を満たしていません"):
        return f"{reason} 再試行します。"
    if "です・ます調" in reason:
        return "文体が「だ・である調」に揃っていなかったため、再試行します。"
    if "参考ES" in reason:
        return "参考ESとの表現類似が高かったため、別表現で再試行します。"
    if "整合性" in reason:
        return f"{reason} 未解消の改善ポイントを反映するため再試行します。"
    if "ユーザー事実" in reason:
        return "ユーザーが書いていない具体経験が混ざったため、安全な内容に修正して再試行します。"
    if "未来志向" in reason:
        return f"{reason} 設問の主軸に戻して再試行します。"
    if "志望理由の軸" in reason:
        return "なぜこの会社かが弱かったため、志望理由を先頭で明示して再試行します。"
    if "職種・コース" in reason:
        return "なぜその職種・コースかが弱かったため、役割の理由を先頭で明示して再試行します。"
    if "断片的" in reason:
        return "断片的な本文になったため、1本の文章として再試行します。"
    if "過去経験の説明が長すぎます" in reason:
        return "過去経験が長すぎたため、根拠を短くして再試行します。"
    return f"{reason} 再試行します。"


def _describe_rag_reason(reason: str) -> str:
    mapping = {
        "ok": "企業RAGを利用できます",
        "context_short": "企業RAG本文が短すぎるため利用しません",
        "sources_missing": "企業RAG本文はありますが出典情報が不足しています",
        "rag_unavailable": "企業RAGが利用できません",
        "no_context": "企業RAGの本文が取得できませんでした",
    }
    return mapping.get(reason, reason)


def _extract_domain(url: str) -> str:
    if not url:
        return ""
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def _split_fact_spans(text: str, max_items: int = 4) -> list[str]:
    if not text:
        return []
    parts = re.split(r"(?<=[。！？!?])|\n+", text)
    facts: list[str] = []
    for part in parts:
        normalized = re.sub(r"\s+", " ", part).strip()
        if len(normalized) < 10:
            continue
        snippet = normalized[:120]
        if snippet not in facts:
            facts.append(snippet)
        if len(facts) >= max_items:
            break
    return facts


def _append_user_fact(
    facts: list[dict[str, str]],
    seen: set[tuple[str, str]],
    *,
    source: str,
    text: str,
    usage: str,
) -> None:
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if len(normalized) < 6:
        return
    key = (source, normalized)
    if key in seen:
        return
    seen.add(key)
    facts.append(
        {
            "source": source,
            "text": normalized[:140],
            "usage": usage,
        }
    )


def _build_allowed_user_facts(request: ReviewRequest) -> list[dict[str, str]]:
    facts: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for span in _split_fact_spans(request.content, max_items=6):
        _append_user_fact(
            facts,
            seen,
            source="current_answer",
            text=span,
            usage="具体的経験・役割・成果・数字に使ってよい",
        )

    if request.document_context:
        for section in request.document_context.other_sections[:4]:
            title = re.sub(r"\s+", " ", section.title or "").strip()
            for span in _split_fact_spans(section.content, max_items=3):
                _append_user_fact(
                    facts,
                    seen,
                    source="document_section",
                    text=f"{title}: {span}" if title else span,
                    usage="同一ES内で既に書かれている事実として使ってよい",
                )

    for gakuchika in request.gakuchika_context[:4]:
        if gakuchika.source_status == "structured_summary":
            if gakuchika.action_text:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_summary",
                    text=f"{gakuchika.title}: {gakuchika.action_text}",
                    usage="行動・役割として使ってよい",
                )
            if gakuchika.result_text:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_summary",
                    text=f"{gakuchika.title}: {gakuchika.result_text}",
                    usage="成果・学びとして使ってよい",
                )
            for number in gakuchika.numbers[:3]:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_summary",
                    text=f"{gakuchika.title}: {number}",
                    usage="明示された数値として使ってよい",
                )
            for strength in gakuchika.strengths[:3]:
                if isinstance(strength, str):
                    text = strength
                else:
                    title = str(strength.get("title") or "").strip()
                    description = str(strength.get("description") or "").strip()
                    text = " - ".join(part for part in [title, description] if part)
                if text:
                    _append_user_fact(
                        facts,
                        seen,
                        source="gakuchika_summary",
                        text=f"{gakuchika.title}: {text}",
                        usage="要約済みの強み・学びとして使ってよい",
                    )
        else:
            for span in gakuchika.fact_spans[:4]:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_raw_material",
                    text=f"{gakuchika.title}: {span}",
                    usage="明示文面の範囲だけを使ってよい。強みや成果の推定は禁止",
                )
            if gakuchika.content_excerpt:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_raw_material",
                    text=f"{gakuchika.title}: {gakuchika.content_excerpt}",
                    usage="原文要約ではなく素材断片としてのみ参照できる",
                )

    profile = request.profile_context
    if profile:
        if profile.university:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"大学: {profile.university}",
                usage="背景情報として使ってよい。経験創作には使わない",
            )
        if profile.faculty:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"学部学科: {profile.faculty}",
                usage="背景情報として使ってよい。経験創作には使わない",
            )
        for job_type in profile.target_job_types[:4]:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"志望職種: {job_type}",
                usage="志向情報として使ってよい。経験創作には使わない",
            )
        for industry in profile.target_industries[:4]:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"志望業界: {industry}",
                usage="志向情報として使ってよい。経験創作には使わない",
            )

    return facts


def _is_short_answer_mode(char_max: Optional[int]) -> bool:
    return bool(char_max and char_max <= SHORT_ANSWER_CHAR_MAX)


QWEN_FUTURE_FOCUS_TEMPLATES = {"post_join_goals", "intern_goals"}
QWEN_SHORT_ANSWER_SEMANTIC_TEMPLATES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
    "role_course_reason",
}
QWEN_FUTURE_MARKERS = (
    "したい",
    "携わりたい",
    "挑戦したい",
    "実現したい",
    "貢献したい",
    "身につけたい",
    "獲得したい",
    "磨きたい",
    "深めたい",
    "広げたい",
    "高めたい",
    "担いたい",
)
QWEN_DETAIL_MARKERS = (
    "チーム",
    "メンバー",
    "エラー",
    "マニュアル",
    "資料",
    "共有",
    "期限内",
    "完遂",
    "向上",
    "改善",
    "達成",
    "リリース",
    "短期間",
    "再発防止",
)


def _trim_qwen_initial_prompt_user_facts(
    prompt_user_facts: list[dict[str, str]],
    *,
    char_max: int | None,
) -> list[dict[str, str]]:
    return prompt_user_facts[: (3 if _is_short_answer_mode(char_max) else 4)]


def _trim_qwen_initial_company_evidence_cards(
    company_evidence_cards: list[dict[str, str]],
    *,
    template_type: str,
) -> list[dict[str, str]]:
    _ = template_type
    return company_evidence_cards[:1]


def _should_use_qwen_reference_outline(char_max: int | None) -> bool:
    _ = char_max
    return False


def _split_candidate_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


def _contains_any_marker(text: str, markers: tuple[str, ...]) -> bool:
    return any(marker in (text or "") for marker in markers)


def _is_qwen_detail_heavy_sentence(sentence: str) -> bool:
    if not sentence:
        return False
    if _contains_any_marker(sentence, QWEN_FUTURE_MARKERS):
        return False
    if _contains_any_marker(sentence, QWEN_DETAIL_MARKERS):
        return True
    return bool(re.search(r"\d+(?:[%％]|人|名|件|社|年|週間|週|日|か月|ヶ月|カ月|倍)", sentence))


def _should_apply_qwen_semantic_validation(
    *,
    review_variant: str,
    template_type: str,
    char_max: int | None,
) -> bool:
    return (
        _is_qwen_review_variant(review_variant)
        and _is_short_answer_mode(char_max)
        and template_type in QWEN_SHORT_ANSWER_SEMANTIC_TEMPLATES
    )


def _validate_qwen_short_answer_semantics(
    text: str,
    *,
    template_type: str,
    company_name: str | None,
    role_name: str | None,
) -> tuple[str | None, str | None]:
    normalized = (text or "").strip()
    if not normalized:
        return "empty", "改善案が空でした。本文を必ず返してください。"
    if normalized[-1] not in "。！？!?":
        return "fragment", "本文が断片的です。文を最後まで言い切ってください。"
    if "\n" in normalized and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", normalized):
        return "bulletish_or_listlike", "本文が列挙的です。1本のES本文にしてください。"

    sentences = _split_candidate_sentences(normalized)
    if not sentences:
        return "fragment", "本文が断片的です。文を最後まで言い切ってください。"
    first_sentence = sentences[0]

    if template_type in QWEN_FUTURE_FOCUS_TEMPLATES:
        if not _contains_any_marker(first_sentence, QWEN_FUTURE_MARKERS):
            return "future_focus", "未来志向が弱いです。1文目で入社後・参加後にやりたいことを言い切ってください。"
        detail_sentences = [sentence for sentence in sentences if _is_qwen_detail_heavy_sentence(sentence)]
        future_sentences = [
            sentence for sentence in sentences if _contains_any_marker(sentence, QWEN_FUTURE_MARKERS)
        ]
        detail_chars = sum(len(sentence) for sentence in detail_sentences)
        future_chars = sum(len(sentence) for sentence in future_sentences)
        if detail_sentences and (len(detail_sentences) >= 2 or detail_chars >= max(future_chars, 1)):
            return "evidence_overweight", "過去経験の説明が長すぎます。根拠経験は短くし、入社後・参加後の話を中心にしてください。"

    if template_type == "company_motivation":
        has_company_anchor = bool(
            (company_name and company_name in first_sentence)
            or "貴社" in first_sentence
            or "志望" in first_sentence
            or "惹" in first_sentence
            or "魅力" in first_sentence
        )
        if not has_company_anchor:
            return "motivation_focus", "志望理由の軸が弱いです。1文目でなぜこの会社かを明示してください。"

    if template_type == "role_course_reason":
        has_role_anchor = bool(
            (role_name and role_name in first_sentence)
            or re.search(r"職種|コース|業務|役割", first_sentence)
        )
        if not has_role_anchor:
            return "role_focus", "職種・コースへの答えが弱いです。1文目でなぜその職種・コースかを明示してください。"

    return None, None


def _extract_prompt_terms(*texts: str, max_terms: int = 18) -> list[str]:
    stop_terms = {
        "について",
        "ください",
        "理由",
        "説明",
        "選んだ",
        "選択",
        "エントリー",
        "インターンシップ",
        "インターン",
        "会社",
        "企業",
        "貴社",
        "自分",
        "こと",
        "ため",
        "です",
        "ます",
    }
    terms: list[str] = []
    for text in texts:
        for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9.+/-]{1,}|[一-龠々ぁ-んァ-ヴー]{2,14}", text or ""):
            normalized = token.strip()
            if (
                len(normalized) < 2
                or normalized in stop_terms
                or normalized.lower() in stop_terms
                or normalized in terms
            ):
                continue
            terms.append(normalized)
            if len(terms) >= max_terms:
                return terms
    return terms


def _is_generic_role_label(role_name: str | None) -> bool:
    normalized = re.sub(r"\s+", " ", (role_name or "")).strip().lower()
    if not normalized:
        return False
    return any(re.fullmatch(pattern, normalized, re.IGNORECASE) for pattern in GENERIC_ROLE_PATTERNS)


def _extract_question_focus_signals(
    *,
    template_type: str,
    question: str,
    answer: str | None = None,
) -> dict[str, list[str]]:
    text = " ".join([template_type, question or "", answer or ""])
    signals: list[tuple[str, list[str]]] = []
    if re.search(r"事業|ビジネス|領域|商材|手掛け|手がけ|注力|投資|事業領域|社会課題", text):
        signals.append(("事業理解", ["事業", "ビジネス", "成長領域", "注力分野", "社会課題"]))
    if re.search(r"経験|スキル|学び|学ぶ|獲得|成長|若手|挑戦|鍛え|磨き", text):
        signals.append(("成長機会", ["経験", "スキル", "成長", "若手", "挑戦"]))
    if re.search(r"価値観|人物|社風|文化|求める|大切|重視|理念|使命|風土", text):
        signals.append(("価値観", ["価値観", "求める人物像", "社員", "理念", "風土"]))
    if re.search(r"入社後|将来|キャリア|実現|やりたい|挑みたい|貢献|担いたい", text):
        signals.append(("将来接続", ["入社後", "将来", "キャリア", "挑戦", "貢献"]))
    if re.search(r"職種|コース|業務|仕事内容|役割|担当|部署|キャリアコース", text):
        signals.append(("役割理解", ["職種", "業務", "仕事内容", "役割", "担当"]))
    if re.search(r"インターン|プログラム|workshop|ワークショップ|就業|就労体験|現場体験|実務", text, re.IGNORECASE):
        signals.append(("インターン機会", ["インターン", "プログラム", "実務", "現場", "社員"]))

    default_by_template = {
        "post_join_goals": [
            ("事業理解", ["事業", "成長領域", "注力分野"]),
            ("成長機会", ["経験", "スキル", "若手"]),
            ("将来接続", ["入社後", "キャリア", "挑戦"]),
        ],
        "company_motivation": [
            ("事業理解", ["事業", "方向性", "注力分野"]),
            ("価値観", ["価値観", "人物像", "社員"]),
            ("将来接続", ["入社後", "貢献", "挑戦"]),
        ],
        "role_course_reason": [
            ("役割理解", ["職種", "業務", "仕事内容", "役割"]),
            ("成長機会", ["経験", "スキル", "挑戦"]),
            ("価値観", ["価値観", "社員"]),
        ],
        "intern_reason": [
            ("インターン機会", ["インターン", "プログラム", "実務", "現場"]),
            ("成長機会", ["学び", "スキル", "経験"]),
            ("役割理解", ["業務", "仕事内容", "役割"]),
        ],
        "intern_goals": [
            ("インターン機会", ["インターン", "プログラム", "実務", "現場"]),
            ("成長機会", ["学び", "スキル", "経験"]),
            ("将来接続", ["将来", "貢献", "挑戦"]),
        ],
        "self_pr": [
            ("成長機会", ["経験", "スキル", "強み"]),
            ("価値観", ["価値観", "人物像", "社員"]),
        ],
    }
    if not signals:
        signals = default_by_template.get(
            template_type,
            [("企業理解", ["事業", "価値観", "社員"])],
        )
    elif template_type in default_by_template:
        existing_themes = {theme for theme, _ in signals}
        for theme, terms in default_by_template[template_type]:
            if theme not in existing_themes:
                signals.append((theme, terms))

    themes: list[str] = []
    query_terms: list[str] = []
    for theme, terms in signals:
        if theme not in themes:
            themes.append(theme)
        for term in terms:
            if term not in query_terms:
                query_terms.append(term)
    return {"themes": themes[:6], "query_terms": query_terms[:10]}


def _question_has_assistive_company_signal(
    *,
    template_type: str,
    question: str,
) -> bool:
    text = " ".join([template_type, question or ""])
    if template_type == "self_pr":
        return bool(re.search(r"強み|自己PR|自己ＰＲ|活か|発揮|貢献", text))
    if template_type == "work_values":
        return bool(re.search(r"価値観|大切|重視|働く|姿勢", text))
    if template_type == "gakuchika":
        return bool(re.search(r"学び|強み|活か|仕事|貢献|将来|価値観", text))
    if template_type == "basic":
        return bool(re.search(r"強み|価値観|活か|志望|理由|将来|入社後", text))
    return False


def _count_term_overlap(text: str, terms: list[str]) -> int:
    haystack = text or ""
    return sum(1 for term in terms if term and term in haystack)


def _select_prompt_user_facts(
    allowed_user_facts: list[dict[str, str]],
    *,
    template_type: str | None = None,
    question: str,
    answer: str,
    role_name: str | None,
    intern_name: str | None,
    company_name: str | None,
    max_items: int = PROMPT_USER_FACT_LIMIT,
) -> list[dict[str, str]]:
    if not allowed_user_facts:
        return []

    anchor_terms = _extract_prompt_terms(
        question,
        answer,
        role_name or "",
        intern_name or "",
        company_name or "",
    )
    if template_type:
        focus_signals = _extract_question_focus_signals(
            template_type=template_type,
            question=question,
            answer=answer,
        )
        for term in focus_signals["query_terms"]:
            if term not in anchor_terms:
                anchor_terms.append(term)
    source_weights = {
        "current_answer": 10,
        "gakuchika_summary": 8,
        "document_section": 7,
        "gakuchika_raw_material": 6,
        "profile": 3,
    }
    source_caps = {
        "current_answer": 3,
        "gakuchika_summary": 2,
        "document_section": 2,
        "gakuchika_raw_material": 2,
        "profile": 2,
    }
    if role_name or company_name:
        source_caps["profile"] = 1

    scored: list[dict[str, Any]] = []
    for index, fact in enumerate(allowed_user_facts):
        text = str(fact.get("text") or "").strip()
        if not text:
            continue
        source = str(fact.get("source") or "unknown")
        overlap = _count_term_overlap(text, anchor_terms)
        score = source_weights.get(source, 1) + overlap * 3
        if source == "profile" and overlap == 0:
            score -= 1
        scored.append(
            {
                "score": score,
                "index": index,
                "fact": fact,
                "source": source,
                "overlap": overlap,
            }
        )

    ranked = sorted(scored, key=lambda item: (-int(item["score"]), int(item["index"])))

    selected: list[dict[str, str]] = []
    per_source_counts: dict[str, int] = {}

    def add_entry(entry: dict[str, Any]) -> bool:
        fact = entry["fact"]
        source = str(entry["source"] or "unknown")
        if per_source_counts.get(source, 0) >= source_caps.get(source, 2):
            return False
        if fact in selected:
            return False
        selected.append(fact)
        per_source_counts[source] = per_source_counts.get(source, 0) + 1
        return True

    primary_answer = next(
        (entry for entry in ranked if entry["source"] == "current_answer"),
        None,
    )
    if primary_answer:
        add_entry(primary_answer)

    support_fact = next(
        (
            entry
            for entry in ranked
            if entry["source"] in SUPPORTING_PROMPT_FACT_SOURCES
        ),
        None,
    )
    if support_fact:
        add_entry(support_fact)

    if role_name or company_name:
        profile_fact = next(
            (
                entry
                for entry in ranked
                if entry["source"] == "profile" and int(entry["overlap"]) > 0
            ),
            None,
        )
        if profile_fact:
            add_entry(profile_fact)

    for entry in ranked:
        if len(selected) >= max_items:
            break
        add_entry(entry)

    return selected or allowed_user_facts[:max_items]


def _infer_company_evidence_theme(
    *,
    template_type: str,
    content_type: str,
    text: str,
    role_terms: list[str],
    intern_name: str | None,
    generic_role_mode: bool = False,
    question_focus_themes: Optional[list[str]] = None,
) -> str:
    focus_themes = set(question_focus_themes or [])
    if intern_name and intern_name in text:
        return "インターン機会"
    if re.search(r"インターン|internship|program", text, re.IGNORECASE):
        return "インターン機会"
    if role_terms and any(term in text for term in role_terms):
        return "役割理解"
    if "インターン機会" in focus_themes and content_type == "new_grad_recruitment":
        return "インターン機会"
    if (
        "インターン機会" in focus_themes
        and content_type == "corporate_site"
        and re.search(r"インターン|program|実務", text, re.IGNORECASE)
    ):
        return "インターン機会"
    if "事業理解" in focus_themes and content_type in {"corporate_site", "ir_materials", "midterm_plan"}:
        return "事業理解"
    if "成長機会" in focus_themes and content_type in {"new_grad_recruitment", "employee_interviews"}:
        return "成長機会"
    if "価値観" in focus_themes and content_type in {"new_grad_recruitment", "employee_interviews", "corporate_site"}:
        return "価値観"
    if "将来接続" in focus_themes and content_type in {"midterm_plan", "ir_materials", "corporate_site"}:
        return "将来接続"
    if "役割理解" in focus_themes and content_type in {"employee_interviews", "new_grad_recruitment", "corporate_site"}:
        return "役割理解"
    if generic_role_mode and "成長機会" in focus_themes and content_type in {"corporate_site", "ir_materials"}:
        return "成長機会"
    if content_type == "employee_interviews":
        return "現場期待"
    if content_type == "new_grad_recruitment":
        return "採用方針"
    if content_type in {"ir_materials", "midterm_plan"}:
        return "成長領域"
    if template_type == "company_motivation":
        return "企業理解"
    if template_type == "post_join_goals":
        return "将来接続"
    return "企業理解"


def _score_company_evidence_source(
    source: dict,
    *,
    template_type: str,
    question: str,
    answer: str,
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    generic_role_mode: bool = False,
    question_focus_terms: Optional[list[str]] = None,
    user_priority_urls: Optional[set[str]] = None,
    current_run_priority_urls: Optional[set[str]] = None,
) -> int:
    content_type = str(source.get("content_type") or "")
    source_url = str(source.get("source_url") or "")
    haystack = " ".join(
        str(source.get(key) or "")
        for key in ("title", "excerpt", "heading", "heading_path", "source_url")
    )
    role_terms = _tokenize_role_terms(role_name)
    query_terms = _extract_prompt_terms(
        question,
        answer,
        role_name or "",
        intern_name or "",
    )
    focus_terms = [term for term in (question_focus_terms or []) if term]

    score = {
        "new_grad_recruitment": 10,
        "employee_interviews": 9,
        "corporate_site": 7,
        "midterm_plan": 6,
        "ir_materials": 6,
        "press_release": 4,
    }.get(content_type, 3)
    score += _count_term_overlap(haystack, role_terms) * 4
    score += _count_term_overlap(haystack, query_terms) * 2
    score += _count_term_overlap(haystack, focus_terms) * (4 if generic_role_mode else 2)

    if grounding_mode == "role_grounded" and content_type in ROLE_SUPPORTIVE_CONTENT_TYPES:
        score += 3
    if generic_role_mode and content_type in {"new_grad_recruitment", "employee_interviews", "corporate_site", "ir_materials", "midterm_plan"}:
        score += 3
    if intern_name and intern_name in haystack:
        score += 5
    if template_type == "intern_reason" and re.search(r"インターン|program|workshop", haystack, re.IGNORECASE):
        score += 5
    if template_type == "role_course_reason" and role_terms and any(term in haystack for term in role_terms):
        score += 4
    if template_type == "post_join_goals" and content_type in {"midterm_plan", "ir_materials"}:
        score += 3
    if source.get("title"):
        score += 1
    if source.get("excerpt"):
        score += 1
    if source_url and user_priority_urls and source_url in user_priority_urls:
        score += 8
    elif source_url and current_run_priority_urls and source_url in current_run_priority_urls:
        score += 5
    return score


def _build_company_evidence_cards(
    rag_sources: list[dict],
    *,
    template_type: str,
    question: str,
    answer: str,
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    max_items: int = COMPANY_EVIDENCE_CARD_LIMIT,
    user_priority_urls: Optional[set[str]] = None,
    current_run_priority_urls: Optional[set[str]] = None,
) -> list[dict[str, str]]:
    company_grounding = _get_company_grounding_policy(template_type)
    if not rag_sources:
        return []

    generic_role_mode = _is_generic_role_label(role_name)
    focus_signals = _extract_question_focus_signals(
        template_type=template_type,
        question=question,
        answer=answer,
    )
    ranked: list[tuple[int, int, dict]] = []
    for index, source in enumerate(rag_sources):
        score = _score_company_evidence_source(
            source,
            template_type=template_type,
            question=question,
            answer=answer,
            role_name=role_name,
            intern_name=intern_name,
            grounding_mode=grounding_mode,
            generic_role_mode=generic_role_mode,
            question_focus_terms=focus_signals["query_terms"],
            user_priority_urls=user_priority_urls,
            current_run_priority_urls=current_run_priority_urls,
        )
        ranked.append((-score, index, source))

    role_terms = _tokenize_role_terms(role_name)
    candidates: list[dict[str, str]] = []
    seen_claims: set[str] = set()
    for _, _, source in sorted(ranked):
        content_type = str(source.get("content_type") or "")
        title = sanitize_prompt_input(
            str(source.get("title") or source.get("heading") or ""), max_length=72
        ).strip()
        excerpt = sanitize_prompt_input(
            str(source.get("excerpt") or ""), max_length=120
        ).strip()
        claim = title if len(title) >= 8 else excerpt or title
        if len(claim) < 8:
            continue
        theme = _infer_company_evidence_theme(
            template_type=template_type,
            content_type=content_type,
            text=" ".join([title, excerpt]),
            role_terms=role_terms,
            intern_name=intern_name,
            generic_role_mode=generic_role_mode,
            question_focus_themes=focus_signals["themes"],
        )
        if claim in seen_claims:
            continue
        seen_claims.add(claim)
        candidates.append(
            {
                "theme": theme,
                "claim": claim,
                "excerpt": excerpt,
                "source_url": str(source.get("source_url") or ""),
                "content_type": content_type,
                "title": title,
            }
        )

    effective_max_items = min(max_items, 1 if company_grounding == "assistive" else 4)

    cards: list[dict[str, str]] = []
    seen_themes: set[str] = set()
    per_theme_counts: dict[str, int] = {}
    theme_target = 1 if company_grounding == "assistive" else (4 if generic_role_mode else 3)

    def append_candidate(candidate: dict[str, str]) -> bool:
        theme = candidate["theme"]
        if candidate in cards:
            return False
        cards.append(candidate)
        seen_themes.add(theme)
        per_theme_counts[theme] = per_theme_counts.get(theme, 0) + 1
        return True

    if company_grounding == "required":
        for theme_group in (ROLE_PROGRAM_EVIDENCE_THEMES, COMPANY_DIRECTION_EVIDENCE_THEMES):
            for candidate in candidates:
                if candidate["theme"] not in theme_group:
                    continue
                if append_candidate(candidate):
                    break

    for candidate in candidates:
        theme = candidate["theme"]
        if theme in seen_themes:
            continue
        append_candidate(candidate)
        if len(cards) >= min(theme_target, effective_max_items):
            break

    for candidate in candidates:
        if len(cards) >= effective_max_items:
            break
        if candidate in cards:
            continue
        theme = candidate["theme"]
        if company_grounding == "assistive":
            break
        if generic_role_mode and per_theme_counts.get(theme, 0) >= 1:
            continue
        if not generic_role_mode and per_theme_counts.get(theme, 0) >= 2:
            continue
        append_candidate(candidate)

    return cards


def _assess_company_evidence_coverage(
    *,
    template_type: str,
    role_name: str | None,
    company_rag_available: bool,
    company_evidence_cards: Optional[list[dict[str, str]]],
    grounding_mode: str,
) -> tuple[str, bool]:
    cards = company_evidence_cards or []
    company_grounding = _get_company_grounding_policy(template_type)
    if not company_rag_available or not cards:
        return "none", company_grounding == "required"

    generic_role_mode = _is_generic_role_label(role_name)
    theme_count = len(
        {
            str(card.get("theme") or "").strip()
            for card in cards
            if str(card.get("theme") or "").strip()
        }
    )
    card_count = len(cards)
    themes = {
        str(card.get("theme") or "").strip()
        for card in cards
        if str(card.get("theme") or "").strip()
    }

    if company_grounding == "assistive":
        if grounding_mode == "role_grounded" and themes & {"役割理解", "現場期待", "インターン機会"}:
            return "strong", False
        if themes & {"価値観", "現場期待", "役割理解", "採用方針", "成長機会", "インターン機会"}:
            return "partial", False
        return "weak", False

    if grounding_mode == "role_grounded" and theme_count >= 2 and card_count >= 2:
        return "strong", False

    if generic_role_mode:
        if theme_count >= 3 and card_count >= 3:
            return "strong", False
        if theme_count >= 2 and card_count >= 2:
            return "partial", False
        return "weak", True

    if theme_count >= 2 and card_count >= 2:
        return "strong", False
    if theme_count >= 1 and card_count >= 1:
        return "partial", False
    return "weak", True


def _collect_user_context_sources(request: ReviewRequest) -> list[str]:
    sources: list[str] = ["current_answer"]
    if request.document_context and request.document_context.other_sections:
        sources.append("document_sections")
    if request.gakuchika_context:
        if any(item.source_status == "raw_material" for item in request.gakuchika_context):
            sources.append("gakuchika_raw_material")
        if any(item.source_status == "structured_summary" for item in request.gakuchika_context):
            sources.append("gakuchika_summary")
    if request.profile_context:
        sources.append("profile")
    return sources


def _tokenize_role_terms(role_name: str | None) -> list[str]:
    if not role_name:
        return []
    tokens = re.findall(r"[A-Za-z0-9]+|[一-龠々ぁ-んァ-ヴー]{2,8}", role_name)
    cleaned = []
    for token in tokens:
        stripped = token.strip()
        if len(stripped) >= 2 and stripped not in cleaned:
            cleaned.append(stripped)
    if role_name not in cleaned:
        cleaned.insert(0, role_name)
    return cleaned[:6]


def _build_role_rag_boosts(template_type: str, role_name: str | None) -> dict[str, float] | None:
    if template_type not in ROLE_SENSITIVE_TEMPLATES:
        return None
    boosts = {
        "new_grad_recruitment": 1.26,
        "employee_interviews": 1.22,
        "corporate_site": 1.14,
        "ir_materials": 0.92,
        "midterm_plan": 0.96,
        "press_release": 0.98,
    }
    if role_name:
        boosts["new_grad_recruitment"] = 1.34
        boosts["employee_interviews"] = 1.28
    return boosts


def _evaluate_grounding_mode(
    template_type: str,
    rag_context: str,
    rag_sources: list[dict],
    role_name: str | None,
    company_rag_available: bool,
) -> str:
    if not company_rag_available or not rag_context:
        return "none"
    if template_type not in ROLE_SENSITIVE_TEMPLATES:
        return "company_general"

    role_terms = _tokenize_role_terms(role_name)
    role_support_count = 0
    supportive_types: set[str] = set()
    for source in rag_sources:
        content_type = str(source.get("content_type") or "")
        if content_type in ROLE_SUPPORTIVE_CONTENT_TYPES:
            supportive_types.add(content_type)
        haystack = " ".join(
            str(source.get(key) or "")
            for key in ("title", "excerpt", "source_url", "heading", "heading_path")
        )
        if any(term and term in haystack for term in role_terms):
            role_support_count += 1

    if role_terms and role_support_count >= 1 and len(supportive_types) >= 2:
        return "role_grounded"
    return "company_general"


def _build_review_meta(
    request: ReviewRequest,
    *,
    llm_provider: str = "claude",
    llm_model: str | None = None,
    review_variant: str = "standard",
    grounding_mode: str,
    triggered_enrichment: bool,
    enrichment_completed: bool = False,
    enrichment_sources_added: int = 0,
    injection_risk: str | None,
    fallback_to_generic: bool = False,
    improvement_timeout_fallback: bool = False,
    timeout_stage: str | None = None,
    timeout_recovered: bool = False,
    rewrite_generation_mode: str = "normal",
    reference_es_count: int = 0,
    reference_quality_profile_used: bool = False,
    reference_outline_used: bool = False,
    company_grounding_policy: str = "assistive",
    company_evidence_count: int = 0,
    evidence_coverage_level: str = "none",
    weak_evidence_notice: bool = False,
    length_policy: str = "strict",
    length_shortfall: int = 0,
    length_fix_attempted: bool = False,
    length_fix_result: str = "not_needed",
) -> ReviewMeta:
    template_request = request.template_request
    role_context = request.role_context or RoleContext()
    return ReviewMeta(
        llm_provider=llm_provider,
        llm_model=llm_model,
        review_variant=review_variant,
        grounding_mode=grounding_mode,
        primary_role=role_context.primary_role or (template_request.role_name if template_request else None),
        role_source=role_context.source,
        triggered_enrichment=triggered_enrichment,
        enrichment_completed=enrichment_completed,
        enrichment_sources_added=enrichment_sources_added,
        reference_es_count=reference_es_count,
        reference_es_mode="quality_profile_and_overlap_guard",
        reference_quality_profile_used=reference_quality_profile_used,
        reference_outline_used=reference_outline_used,
        company_grounding_policy=company_grounding_policy,
        company_evidence_count=company_evidence_count,
        evidence_coverage_level=evidence_coverage_level,
        weak_evidence_notice=weak_evidence_notice,
        injection_risk=injection_risk,
        user_context_sources=_collect_user_context_sources(request),
        hallucination_guard_mode="strict",
        fallback_to_generic=fallback_to_generic,
        improvement_timeout_fallback=improvement_timeout_fallback,
        timeout_stage=timeout_stage,
        timeout_recovered=timeout_recovered,
        rewrite_generation_mode=rewrite_generation_mode,
        length_policy=length_policy,
        length_shortfall=length_shortfall,
        length_fix_attempted=length_fix_attempted,
        length_fix_result=length_fix_result,
    )


def _is_within_char_limits(
    text: str,
    char_min: Optional[int],
    char_max: Optional[int],
) -> tuple[bool, str]:
    """Validate text against configured min/max character limits."""
    length = len(text or "")
    if char_min and length < char_min:
        return False, f"under_min:{length}<{char_min}"
    if char_max and length > char_max:
        return False, f"over_max:{length}>{char_max}"
    return True, "ok"


def _char_limit_distance(
    text: str,
    *,
    char_min: Optional[int],
    char_max: Optional[int],
) -> int:
    length = len(text or "")
    if char_min and length < char_min:
        return char_min - length
    if char_max and length > char_max:
        return length - char_max
    return 0


def _should_attempt_semantic_compression(current_len: int, char_max: Optional[int]) -> bool:
    """Semantic compression is for moderate overflow with safe repair room."""
    if not char_max or current_len <= char_max:
        return False
    excess = current_len - char_max
    return excess <= max(90, int(char_max * 0.22))


def _apply_semantic_compression_rules(text: str, char_max: int) -> str:
    compressed = text
    for pattern, replacement in SEMANTIC_COMPRESSION_RULES:
        updated = re.sub(pattern, replacement, compressed)
        updated = re.sub(r"、{2,}", "、", updated)
        updated = re.sub(r"\s+", "", updated)
        updated = re.sub(r"。{2,}", "。", updated)
        if len(updated) < len(compressed):
            compressed = updated
        if len(compressed) <= char_max:
            break
    return compressed.strip()


def _split_japanese_sentences(text: str) -> list[str]:
    sentences = [s.strip() for s in re.split(r"(?<=[。！？])", text) if s.strip()]
    return sentences or [text.strip()]


def _sentence_priority(sentence: str, index: int, total: int) -> int:
    score = 0
    if index == 0:
        score += 10
    if index == total - 1:
        score += 4
    if re.search(r"志望|理由|魅力|選ぶ|選択", sentence):
        score += 6
    if re.search(r"研究|経験|インターン|開発|取り組|学ん", sentence):
        score += 5
    if re.search(r"活か|貢献|実現|価値|推進|将来|キャリア", sentence):
        score += 5
    if re.search(r"\d", sentence):
        score += 3
    if len(sentence) <= 14:
        score -= 1
    return score


def _prune_low_priority_sentences(text: str, char_max: int) -> str | None:
    sentences = _split_japanese_sentences(text)
    if len(sentences) < 3:
        return None

    working = sentences[:]
    while len("".join(working)) > char_max and len(working) > 2:
        candidates: list[tuple[int, int]] = []
        for idx, sentence in enumerate(working):
            if idx == 0:
                continue
            priority = _sentence_priority(sentence, idx, len(working))
            candidates.append((priority, idx))
        if not candidates:
            break
        _, remove_idx = min(candidates)
        trial = working[:remove_idx] + working[remove_idx + 1 :]
        trial_text = "".join(trial)
        if trial_text == "".join(working):
            break
        working = trial

    result = "".join(working).strip()
    if len(result) <= char_max and result.endswith(("。", "！", "？")):
        return result
    return None


def _trim_to_safe_boundary(
    text: str,
    *,
    char_min: int | None,
    char_max: int,
) -> str | None:
    if len(text) <= char_max:
        return text

    boundary_candidates: list[int] = []
    for token in ("。", "！", "？"):
        index = text.rfind(token, 0, char_max + 1)
        if index >= 0:
            boundary_candidates.append(index + 1)
    for token in ("、", "，", ","):
        index = text.rfind(token, 0, char_max + 1)
        if index >= 0:
            boundary_candidates.append(index)

    for cut_index in sorted(set(boundary_candidates), reverse=True):
        trimmed = text[:cut_index].rstrip("、，, ")
        if not trimmed:
            continue
        if not trimmed.endswith(("。", "！", "？")):
            trimmed += "。"
        if char_min and len(trimmed) < char_min:
            continue
        if len(trimmed) <= char_max:
            return trimmed
    return None


def deterministic_compress_variant(variant: dict, char_max: int) -> dict | None:
    """Compress over-limit text with rule-based shortening, never hard-cutting."""
    text = variant.get("text", "").strip()
    if len(text) <= char_max:
        result = dict(variant)
        result["char_count"] = len(text)
        return result

    compressed = _apply_semantic_compression_rules(text, char_max)
    if len(compressed) > char_max:
        pruned = _prune_low_priority_sentences(compressed, char_max)
        if pruned:
            compressed = pruned
    if len(compressed) > char_max:
        trimmed = _trim_to_safe_boundary(compressed, char_min=None, char_max=char_max)
        if trimmed:
            compressed = trimmed

    if len(compressed) > char_max or not compressed.endswith(("。", "！", "？")):
        return None

    result = dict(variant)
    result["text"] = compressed
    result["char_count"] = len(compressed)
    return result


DIFFICULTY_LEVELS = {"easy", "medium", "hard"}
REQUIRED_ACTIONS = {
    "結論明示",
    "職種接続",
    "企業接続",
    "具体例追加",
    "将来像明示",
    "論理接続",
    "深掘り準備",
}


def _normalize_difficulty(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = value.strip().lower()
    mapping = {
        "easy": "easy",
        "medium": "medium",
        "hard": "hard",
        "簡単": "easy",
        "易しい": "easy",
        "中": "medium",
        "普通": "medium",
        "難しい": "hard",
        "難": "hard",
    }
    return mapping.get(
        normalized, normalized if normalized in DIFFICULTY_LEVELS else None
    )


def _normalize_required_action(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = value.strip()
    aliases = {
        "結論を明示": "結論明示",
        "職種適合": "職種接続",
        "職種接続": "職種接続",
        "企業理解": "企業接続",
        "企業接続": "企業接続",
        "具体化": "具体例追加",
        "具体例": "具体例追加",
        "将来像": "将来像明示",
        "論理性": "論理接続",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in REQUIRED_ACTIONS else None


def _normalize_issue_id(value: Optional[str], index: int) -> str:
    raw = (value or "").strip().upper()
    if re.fullmatch(r"ISSUE-\d+", raw):
        return raw
    return f"ISSUE-{index + 1}"


def _infer_required_action(
    *,
    item: dict,
    index: int,
    role_name: str | None,
    company_rag_available: bool,
) -> str:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("category", "issue", "suggestion", "required_action")
    )
    if re.search(r"結論|冒頭|言い切", text):
        return "結論明示"
    if role_name and (role_name in text or re.search(r"職種|コース|適性", text)):
        return "職種接続"
    if re.search(r"将来|入社後|活躍|キャリア", text):
        return "将来像明示"
    if company_rag_available and re.search(r"企業|事業|価値観|文化|方向性|貴社|志望度", text):
        return "企業接続"
    if re.search(r"論理|つなが|接続|一貫|理由が弱", text):
        return "論理接続"
    if re.search(r"具体|根拠|成果|経験|数値|エピソード", text):
        return "具体例追加"
    if re.search(r"深掘|面接", text):
        return "深掘り準備"

    if index == 0:
        return "結論明示"
    if role_name and index == 1:
        return "職種接続"
    if company_rag_available and index == 2:
        return "企業接続"
    return "具体例追加"


def _default_difficulty(required_action: str) -> str:
    if required_action == "結論明示":
        return "easy"
    if required_action in {"企業接続", "職種接続"}:
        return "medium"
    return "medium"


def _parse_issues(
    items: list[dict],
    max_items: int,
    *,
    role_name: str | None,
    company_rag_available: bool,
) -> list[Issue]:
    issues: list[Issue] = []
    for index, item in enumerate(items[:max_items]):
        category = str(item.get("category") or "").strip()
        issue = str(item.get("issue") or "").strip()
        suggestion = str(item.get("suggestion") or "").strip()
        if not category or not issue or not suggestion:
            continue
        required_action = (
            _normalize_required_action(item.get("required_action"))
            or _infer_required_action(
                item=item,
                index=index,
                role_name=role_name,
                company_rag_available=company_rag_available,
            )
        )
        issues.append(
            Issue(
                category=category,
                issue=issue,
                suggestion=suggestion,
                issue_id=_normalize_issue_id(item.get("issue_id"), index),
                required_action=required_action,
                must_appear=(item.get("must_appear") or "").strip()
                or _default_must_appear(required_action, role_name),
                priority_rank=index + 1,
                why_now=(item.get("why_now") or "").strip() or None,
                difficulty=_normalize_difficulty(item.get("difficulty")) or _default_difficulty(required_action),
            )
        )
    return issues


def _evaluate_template_rag_availability(
    rag_context: str, rag_sources: list[dict], min_context_length: int
) -> tuple[bool, str]:
    """
    Evaluate template RAG availability.

    Returns:
        tuple[available, reason]
        reason: "ok" | "context_short" | "sources_missing_but_continue"
    """
    context_len = len(rag_context) if rag_context else 0
    if context_len < max(0, min_context_length):
        return False, "context_short"
    if not rag_sources:
        return True, "sources_missing_but_continue"
    return True, "ok"


def evaluate_company_review_status(company_id: str) -> CompanyReviewStatusResponse:
    rag_status = get_company_rag_status(company_id)
    strategic_chunks = (
        rag_status.get("new_grad_recruitment_chunks", 0)
        + rag_status.get("midcareer_recruitment_chunks", 0)
        + rag_status.get("corporate_site_chunks", 0)
        + rag_status.get("ir_materials_chunks", 0)
        + rag_status.get("employee_interviews_chunks", 0)
        + rag_status.get("ceo_message_chunks", 0)
        + rag_status.get("midterm_plan_chunks", 0)
        + rag_status.get("press_release_chunks", 0)
        + rag_status.get("csr_sustainability_chunks", 0)
    )
    total_chunks = int(rag_status.get("total_chunks", 0) or 0)
    ready = bool(rag_status.get("has_rag")) and total_chunks >= 3 and strategic_chunks >= 2
    if ready:
        reason = "ok"
    elif total_chunks == 0:
        reason = "rag_missing"
    elif strategic_chunks == 0:
        reason = "no_strategic_chunks"
    elif strategic_chunks < 2:
        reason = "insufficient_strategic_chunks"
    else:
        reason = "insufficient_total_chunks"
    return CompanyReviewStatusResponse(
        status="ready_for_es_review" if ready else "company_fetched_but_not_ready",
        ready_for_es_review=ready,
        reason=reason,
        total_chunks=total_chunks,
        strategic_chunks=strategic_chunks,
        last_updated=rag_status.get("last_updated"),
    )


def _queue_progress_event(
    progress_queue: "asyncio.Queue | None",
    step: str,
    progress: int,
    label: str,
    sub_label: Optional[str] = None,
) -> None:
    if progress_queue is None:
        return
    try:
        progress_queue.put_nowait(
            (
                "progress",
                {
                    "step": step,
                    "progress": progress,
                    "label": label,
                    "subLabel": sub_label,
                },
            )
        )
    except asyncio.QueueFull:
        pass


def _queue_stream_event(
    progress_queue: "asyncio.Queue | None",
    event_type: str,
    event_data: dict,
) -> None:
    if progress_queue is None:
        return
    try:
        progress_queue.put_nowait((event_type, event_data))
    except asyncio.QueueFull:
        pass


async def _stream_final_rewrite(
    progress_queue: "asyncio.Queue | None",
    text: str,
    chunk_size: int = 20,
) -> None:
    if progress_queue is None or not text:
        return
    for start in range(0, len(text), chunk_size):
        try:
            progress_queue.put_nowait(
                (
                    "string_chunk",
                    {
                        "path": "streaming_rewrite",
                        "text": text[start : start + chunk_size],
                    },
                )
            )
        except asyncio.QueueFull:
            await asyncio.sleep(0.01)
            continue
        await asyncio.sleep(0.015)


async def _stream_improvement_points(
    progress_queue: "asyncio.Queue | None",
    issues: list[Issue],
    *,
    start_index: int = 0,
    progress_start: int = 86,
) -> None:
    if progress_queue is None or not issues:
        return

    for index, issue in enumerate(issues):
        _queue_progress_event(
            progress_queue,
            step="finalize",
            progress=min(95, progress_start + index * 3),
            label="改善ポイントを表示中...",
            sub_label=f"{start_index + index + 1}件目を追加しています",
        )
        _queue_stream_event(
            progress_queue,
            "array_item_complete",
            {
                "path": f"top3.{start_index + index}",
                "value": issue.model_dump(),
            },
        )
        await asyncio.sleep(0.04)


async def _stream_source_links(
    progress_queue: "asyncio.Queue | None",
    sources: list[TemplateSource],
) -> None:
    if progress_queue is None or not sources:
        return

    for index, source in enumerate(sources):
        _queue_progress_event(
            progress_queue,
            step="sources",
            progress=min(99, 95 + index * 2),
            label="出典リンクを表示中...",
            sub_label=f"{index + 1}件目を追加しています",
        )
        _queue_stream_event(
            progress_queue,
            "array_item_complete",
            {
                "path": f"keyword_sources.{index}",
                "value": source.model_dump(),
            },
        )
        await asyncio.sleep(0.04)


def _validate_reference_distance(
    template_type: str,
    company_name: Optional[str],
    char_max: Optional[int],
    variants: list[dict],
) -> tuple[bool, Optional[str]]:
    for index, variant in enumerate(variants, 1):
        candidate_text = (variant.get("text") or "").strip()
        if not candidate_text:
            continue
        is_overlap, reason = detect_reference_text_overlap(
            candidate_text,
            template_type,
            char_max=char_max,
            company_name=company_name,
        )
        if is_overlap:
            detail = reason or "reference_overlap"
            return (
                False,
                f"参考ESとの類似が高すぎます。本文や語句を流用せず、品質だけを保った別表現に全面的に書き換えてください。({detail}, pattern={index})",
            )
    return True, None


def _build_keyword_sources(rag_sources: list[dict]) -> list[TemplateSource]:
    return [
        TemplateSource(
            source_id=src.get("source_id", ""),
            source_url=src.get("source_url", ""),
            content_type=src.get("content_type", ""),
            content_type_label=src.get("content_type_label")
            or content_type_label(src.get("content_type", "")),
            title=src.get("title"),
            domain=src.get("domain") or _extract_domain(src.get("source_url", "")),
            excerpt=src.get("excerpt"),
        )
        for src in rag_sources
    ]


def _build_template_review_response(
    template_type: str,
    rewrite_text: str,
    rag_sources: list[dict],
) -> TemplateReview:
    keyword_sources = _build_keyword_sources(rag_sources)
    return TemplateReview(
        template_type=template_type,
        variants=[
            TemplateVariant(
                text=rewrite_text,
                char_count=len(rewrite_text),
                pros=[],
                cons=[],
                keywords_used=[],
                keyword_sources=[],
            )
        ],
        keyword_sources=keyword_sources,
    )


def _build_deterministic_expansion(
    text: str,
    *,
    template_type: str,
    char_min: int,
    char_max: int | None,
    issues: list[Issue],
    role_name: str | None,
    grounding_mode: str,
    company_evidence_cards: Optional[list[dict]] = None,
    use_non_claude_length_control: bool = False,
) -> str | None:
    deficit = char_min - len(text)
    max_deficit = (
        NON_CLAUDE_LENGTH_FIX_DELTA_LIMIT
        if use_non_claude_length_control
        else (24 if _is_short_answer_mode(char_max) else 12)
    )
    if deficit <= 0 or deficit > max_deficit:
        return None
    company_grounding = _get_company_grounding_policy(template_type)

    suffixes = [
        "この軸は一貫している。",
        "この思いは強い。",
        "その意義は大きい。",
        "と考える。",
        "と捉える。",
    ]
    if role_name:
        suffixes.insert(0, f"{role_name}で生かしたい。")
    if company_grounding == "required" and grounding_mode in {"role_grounded", "company_general"}:
        suffixes.insert(0, "企業との接点もある。")
    if template_type == "intern_reason":
        suffixes[:0] = [
            "実務に近い環境で学びたい。",
            "貴社でその解像度を高めたい。",
        ]
    elif template_type == "intern_goals":
        suffixes[:0] = [
            "現場でその理解を深めたい。",
            "実務の中で学びを広げたい。",
        ]
    elif template_type == "role_course_reason":
        suffixes[:0] = [
            f"{role_name or 'この職種'}でその強みを磨きたい。",
            "役割理解も深めたい。",
        ]
    elif template_type == "company_motivation":
        suffixes[:0] = [
            "貴社でその価値を形にしたい。",
            "この接点を貴社で深めたい。",
        ]
    elif template_type == "post_join_goals":
        suffixes[:0] = [
            "入社後は実務で磨きたい。",
            "その力を貴社で高めたい。",
        ]
    if company_grounding == "required" and company_evidence_cards:
        theme_suffix_map = {
            "インターン機会": "実務に近い環境で学びたい。",
            "役割理解": f"{role_name or 'その役割'}への理解も深めたい。",
            "現場期待": "現場で価値発揮したい。",
            "成長領域": "その領域で価値を出したい。",
            "企業理解": "貴社の方向性とも重なる。",
            "採用方針": "その姿勢に共感している。",
            "将来接続": "将来像との接点も強い。",
        }
        for card in company_evidence_cards[:2]:
            theme = str(card.get("theme") or "")
            if theme in theme_suffix_map:
                suffixes.append(theme_suffix_map[theme])
    for issue in issues:
        if issue.must_appear and issue.must_appear not in text:
            suffixes.append(f"{issue.must_appear}を意識する。")

    base = text[:-1] if text.endswith("。") else text
    best_candidate = ""
    best_distance: int | None = None

    def _remember(candidate_text: str) -> str | None:
        nonlocal best_candidate, best_distance
        if char_max and len(candidate_text) > char_max:
            return None
        distance = _char_limit_distance(
            candidate_text,
            char_min=char_min,
            char_max=char_max,
        )
        if best_distance is None or distance < best_distance:
            best_candidate = candidate_text
            best_distance = distance
        within_limits, _ = _is_within_char_limits(candidate_text, char_min, char_max)
        if within_limits:
            return candidate_text
        if len(candidate_text) >= char_min - 2 and (not char_max or len(candidate_text) <= char_max):
            return candidate_text
        return None

    assembled = base
    seen_suffixes: set[str] = set()
    for suffix in suffixes:
        snippet = suffix.strip().rstrip("。")
        if not snippet or snippet in seen_suffixes:
            continue
        seen_suffixes.add(snippet)
        assembled = f"{assembled}{snippet}"
        if not assembled.endswith("。"):
            assembled += "。"
        resolved = _remember(assembled)
        if resolved:
            return resolved

    return best_candidate or None


def _fit_rewrite_text_deterministically(
    text: str,
    *,
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    issues: list[Issue],
    role_name: str | None,
    grounding_mode: str,
    company_evidence_cards: Optional[list[dict]] = None,
    use_non_claude_length_control: bool = False,
) -> str | None:
    normalized = _normalize_repaired_text(text)
    if not normalized:
        return None

    within_limits, _ = _is_within_char_limits(normalized, char_min, char_max)
    if within_limits:
        return normalized

    if char_max and len(normalized) > char_max and _should_attempt_semantic_compression(len(normalized), char_max):
        compressed_variant = deterministic_compress_variant({"text": normalized}, char_max)
        if compressed_variant:
            compressed_text = str(compressed_variant.get("text") or "").strip()
            compressed_ok, _ = _is_within_char_limits(compressed_text, char_min, char_max)
            if compressed_ok:
                return compressed_text
            normalized = compressed_text

    if char_max and len(normalized) > char_max:
        safely_trimmed = _trim_to_safe_boundary(
            normalized,
            char_min=char_min,
            char_max=char_max,
        )
        if safely_trimmed:
            trimmed_ok, _ = _is_within_char_limits(safely_trimmed, char_min, char_max)
            if trimmed_ok:
                return safely_trimmed

    if char_min and len(normalized) < char_min:
        expanded = _build_deterministic_expansion(
            normalized,
            template_type=template_type,
            char_min=char_min,
            char_max=char_max,
            issues=issues,
            role_name=role_name,
            grounding_mode=grounding_mode,
            company_evidence_cards=company_evidence_cards,
            use_non_claude_length_control=use_non_claude_length_control,
        )
        if expanded:
            expanded_ok, _ = _is_within_char_limits(expanded, char_min, char_max)
            if expanded_ok:
                return expanded

    return None


def _default_must_appear(required_action: str | None, role_name: str | None) -> str:
    mapping = {
        "結論明示": "結論を冒頭で言い切る",
        "職種接続": f"{role_name or '職種'}で活きる経験を示す",
        "企業接続": "企業との接点を一つ示す",
        "具体例追加": "役割か行動か成果を具体化する",
        "将来像明示": "入社後の価値発揮を述べる",
        "論理接続": "志望理由と経験をつなぐ",
        "深掘り準備": "根拠を補足できる状態にする",
    }
    return mapping.get(required_action or "", "不足点を本文で解消する")


def _fallback_improvement_points(
    question: str,
    original_answer: str,
    company_rag_available: bool,
    template_type: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
) -> list[Issue]:
    company_grounding = _get_company_grounding_policy(template_type or "basic")
    assistive_company_signal = bool(template_type) and _question_has_assistive_company_signal(
        template_type=template_type,
        question=question,
    )
    effective_company_rag_available = company_rag_available
    issues = [
        Issue(
            issue_id="ISSUE-1",
            category="結論の明確さ",
            issue="設問の冒頭で何を伝えるかが曖昧になりやすい。",
            suggestion="冒頭1文で設問への答えを言い切り、その後に根拠を続ける構成にする。",
            required_action="結論明示",
            must_appear="設問への答えを冒頭で言い切る",
            priority_rank=1,
            why_now="最初の一文が弱いと、その後の具体例が読まれにくくなるため。",
            difficulty="easy",
        )
    ]
    role_issue = (
        Issue(
            issue_id="ISSUE-ROLE",
            category="職種適合",
            issue=f"{role_name}を選ぶ理由が、経験や適性に結びついていない。",
            suggestion=f"{role_name}で活きる経験・関心・強みを1つに絞り、なぜその職種でなければならないかを明示する。",
            required_action="職種接続",
            must_appear=f"{role_name}で活きる経験か関心を示す",
            priority_rank=2,
            why_now="職種選択理由が曖昧だと、企業固有の志望度より前に適性で疑問を持たれやすいため。",
            difficulty="medium",
        )
        if role_name
        else None
    )
    company_issue = (
        Issue(
            issue_id="ISSUE-3",
            category="企業接続",
            issue=(
                "企業理解を示す要素が弱いと一般論に見えやすい。"
                if grounding_mode != "company_general"
                else "企業の方向性との接点が薄く、企業に合わせた理由が伝わりにくい。"
            ),
            suggestion=(
                "事業・職種・働き方のうち最も自分と接点のある要素を1つだけ明示して接続を強める。"
                if grounding_mode != "company_general"
                else "企業の方向性や価値観との接点を1点だけ示し、断定しすぎずに接続する。"
            ),
            required_action="企業接続",
            must_appear="企業の方向性との接点を一つ示す",
            priority_rank=3,
            why_now="企業に合わせた志望度を示せると通過率への影響が大きいため。",
            difficulty="medium",
        )
        if effective_company_rag_available
        and (
            company_grounding == "required"
            or (company_grounding == "assistive" and assistive_company_signal)
        )
        else None
    )
    specificity_issue = Issue(
        issue_id="ISSUE-2",
        category="具体性",
        issue="経験や志望理由の根拠が抽象的だと説得力が落ちる。",
        suggestion="役割、行動、成果、学びのうち不足している要素を1つ追加して具体化する。",
        required_action="具体例追加",
        must_appear="役割か行動か成果を一つ具体化する",
        priority_rank=2,
        why_now="改善案の説得力は具体例の密度で大きく変わるため。",
        difficulty="medium",
    )

    if role_issue:
        issues.append(role_issue)
    if company_issue:
        issues.append(company_issue)
    if len(issues) < 3:
        issues.append(specificity_issue)
    if len(issues) < 3:
        issues.append(
            Issue(
                issue_id="ISSUE-3",
                category="深掘り準備",
                issue="改善案としてはまとまっていても、面接で根拠を追加で聞かれる余地が残る。",
                suggestion="なぜその経験が今の志望や価値観につながるのかを口頭で補足できるよう整理しておく。",
                required_action="深掘り準備",
                must_appear="志望理由の根拠を補足できる状態にする",
                priority_rank=3,
                why_now="ES通過後の深掘りにそのまま備えられるため。",
                difficulty="easy",
            )
        )
    _ = (question, original_answer, template_type)
    return issues[:3]


def _merge_rag_sources(existing: list[dict], additional: list[dict]) -> list[dict]:
    merged: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for source in [*existing, *additional]:
        key = (
            str(source.get("source_url") or ""),
            str(source.get("title") or source.get("heading") or ""),
            str(source.get("excerpt") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(source)
    return merged


def _select_rewrite_prompt_context(
    *,
    template_type: str,
    char_max: int | None,
    attempt: int,
    simplified_mode: bool,
    timeout_compact_mode: bool = False,
    review_variant: str = "standard",
    prompt_user_facts: list[dict[str, str]],
    company_evidence_cards: list[dict[str, str]],
    improvement_payload: list[dict[str, Any]],
    reference_quality_block: str,
    evidence_coverage_level: str,
) -> dict[str, Any]:
    company_grounding = _get_company_grounding_policy(template_type)
    short_answer_mode = _is_short_answer_mode(char_max)
    is_qwen_review = _is_qwen_review_variant(review_variant)
    compact_mode = timeout_compact_mode or simplified_mode or attempt >= (1 if is_qwen_review else 2)

    if is_qwen_review:
        if timeout_compact_mode:
            fact_limit = 2 if short_answer_mode else 3
            card_limit = 0 if company_grounding == "assistive" and evidence_coverage_level == "none" else min(1, len(company_evidence_cards))
            return {
                "prompt_user_facts": prompt_user_facts[:fact_limit],
                "company_evidence_cards": company_evidence_cards[:card_limit],
                "improvement_payload": [],
                "reference_quality_block": "",
            }
        fact_limit = 3 if short_answer_mode else 4
        card_limit = 0 if company_grounding == "assistive" and evidence_coverage_level == "none" else min(1, len(company_evidence_cards))
        return {
            "prompt_user_facts": prompt_user_facts[:fact_limit],
            "company_evidence_cards": company_evidence_cards[:card_limit],
            "improvement_payload": [],
            "reference_quality_block": "",
        }

    if short_answer_mode:
        fact_limit = 4
    elif simplified_mode:
        fact_limit = 5
    elif compact_mode:
        fact_limit = 6
    else:
        fact_limit = PROMPT_USER_FACT_LIMIT

    issue_limit = 2 if compact_mode else 3
    if company_grounding == "assistive":
        if evidence_coverage_level == "none":
            card_limit = 0
        elif evidence_coverage_level == "weak":
            card_limit = 0 if compact_mode else 1
        else:
            card_limit = 1
    elif simplified_mode or short_answer_mode:
        card_limit = 1
    elif evidence_coverage_level in {"weak", "partial"}:
        card_limit = 2
    elif company_grounding == "required" and not compact_mode:
        card_limit = 4
    elif compact_mode:
        card_limit = 2
    else:
        card_limit = 3

    include_reference_quality = (
        bool(reference_quality_block)
        and not short_answer_mode
        and not simplified_mode
        and (char_max is None or char_max >= 260)
        and attempt == 0
    )
    return {
        "prompt_user_facts": prompt_user_facts[:fact_limit],
        "company_evidence_cards": company_evidence_cards[:card_limit],
        "improvement_payload": improvement_payload[:issue_limit],
        "reference_quality_block": reference_quality_block if include_reference_quality else "",
    }


def _build_role_focused_second_pass_query(
    template_request: TemplateRequest,
    primary_role: str | None,
) -> str:
    generic_role_mode = _is_generic_role_label(primary_role or template_request.role_name)
    focus_signals = _extract_question_focus_signals(
        template_type=template_request.template_type,
        question=template_request.question,
        answer=template_request.answer,
    )
    query_parts: list[str] = [template_request.company_name or ""]

    focus_terms = focus_signals["query_terms"][:6]

    if template_request.template_type in {"intern_reason", "intern_goals"}:
        query_parts.extend(
            [
                template_request.intern_name or "",
                primary_role or "",
                "インターン",
                "プログラム",
                "実務",
                "社員",
            ]
        )
        query_parts.extend(focus_terms)
    elif generic_role_mode:
        query_parts.extend(focus_signals["query_terms"][:8])
        query_parts.extend(["社員", "若手", "事業"])
    elif template_request.template_type == "role_course_reason":
        query_parts.extend([primary_role or "", "職種", "業務", "仕事内容", "社員"])
        query_parts.extend(focus_terms[:4])
    elif template_request.template_type in {"company_motivation", "post_join_goals", "self_pr"}:
        query_parts.extend([primary_role or "", "事業", "価値観", "社員", "若手"])
        query_parts.extend(focus_terms[:5])
    else:
        query_parts.extend([primary_role or "", template_request.question])
        query_parts.extend(focus_terms[:4])

    deduped: list[str] = []
    for part in query_parts:
        normalized = re.sub(r"\s+", " ", part or "").strip()
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return " / ".join(deduped)


def _build_second_pass_content_type_boosts(
    template_request: TemplateRequest,
    primary_role: str | None,
) -> dict[str, float]:
    generic_role_mode = _is_generic_role_label(primary_role or template_request.role_name)
    focus_signals = _extract_question_focus_signals(
        template_type=template_request.template_type,
        question=template_request.question,
        answer=template_request.answer,
    )
    boosts = {
        "new_grad_recruitment": 1.42,
        "employee_interviews": 1.38,
        "corporate_site": 1.24,
        "press_release": 0.92,
        "ir_materials": 0.86,
        "midterm_plan": 0.92,
    }
    if template_request.template_type == "role_course_reason":
        boosts["new_grad_recruitment"] = 1.5
        boosts["employee_interviews"] = 1.48
        boosts["corporate_site"] = 1.3
    if template_request.template_type in {"intern_reason", "intern_goals"}:
        boosts["new_grad_recruitment"] = 1.52
        boosts["employee_interviews"] = 1.46
        boosts["corporate_site"] = 1.28
        boosts["ir_materials"] = 0.8
        boosts["midterm_plan"] = 0.82
    if template_request.template_type == "company_motivation":
        boosts["corporate_site"] = max(boosts["corporate_site"], 1.3)
        boosts["employee_interviews"] = max(boosts["employee_interviews"], 1.42)
    if template_request.template_type == "post_join_goals":
        boosts["midterm_plan"] = max(boosts["midterm_plan"], 1.18)
        boosts["ir_materials"] = max(boosts["ir_materials"], 1.16)
    if not generic_role_mode:
        return boosts

    if "事業理解" in focus_signals["themes"]:
        boosts["corporate_site"] = max(boosts["corporate_site"], 1.34)
        boosts["ir_materials"] = max(boosts["ir_materials"], 1.22)
        boosts["midterm_plan"] = max(boosts["midterm_plan"], 1.18)
    if "成長機会" in focus_signals["themes"]:
        boosts["new_grad_recruitment"] = max(boosts["new_grad_recruitment"], 1.46)
        boosts["employee_interviews"] = max(boosts["employee_interviews"], 1.44)
    if "価値観" in focus_signals["themes"]:
        boosts["corporate_site"] = max(boosts["corporate_site"], 1.32)
        boosts["employee_interviews"] = max(boosts["employee_interviews"], 1.42)
    return boosts


def _should_run_role_focused_second_pass(
    *,
    template_request: TemplateRequest,
    primary_role: str | None,
    company_rag_available: bool,
    grounding_mode: str,
    company_evidence_cards: list[dict[str, str]],
    evidence_coverage_level: str,
    assistive_company_signal: bool,
) -> bool:
    if not company_rag_available:
        return False
    if not (primary_role or template_request.intern_name or template_request.question):
        return False

    if _company_grounding_is_assistive(template_request.template_type):
        return (
            grounding_mode == "company_general"
            and assistive_company_signal
            and evidence_coverage_level == "weak"
        )

    if grounding_mode not in {"company_general", "role_grounded"}:
        return False

    if evidence_coverage_level not in {"weak", "partial"}:
        return False

    role_anchor_count = sum(
        1
        for card in company_evidence_cards
        if str(card.get("theme") or "") in ROLE_PROGRAM_EVIDENCE_THEMES
    )
    company_anchor_count = sum(
        1
        for card in company_evidence_cards
        if str(card.get("theme") or "") in COMPANY_DIRECTION_EVIDENCE_THEMES
    )
    return role_anchor_count == 0 or company_anchor_count == 0 or evidence_coverage_level == "weak"


def _merge_with_fallback_issues(
    primary: list[Issue],
    fallback: list[Issue],
    *,
    max_items: int = 3,
) -> list[Issue]:
    merged: list[Issue] = []
    seen: set[tuple[str, str]] = set()
    for issue in [*primary, *fallback]:
        key = (issue.category.strip(), issue.issue.strip())
        if not issue.category or not issue.issue or key in seen:
            continue
        seen.add(key)
        merged.append(issue)
        if len(merged) >= max_items:
            break
    return merged


def _format_target_char_hint(
    char_min: int | None,
    char_max: int | None,
) -> str:
    if char_min and char_max:
        gap = 6 if char_max <= SHORT_ANSWER_CHAR_MAX else 8
        target_lower = max(char_min, char_max - gap)
        target_upper = max(target_lower, char_max - 2)
        return f"{target_lower}〜{target_upper}字"
    if char_max:
        gap = 6 if char_max <= SHORT_ANSWER_CHAR_MAX else 8
        return f"{max(0, char_max - gap)}〜{max(0, char_max - 2)}字"
    if char_min:
        return f"{char_min}字以上"
    return "指定文字数付近"


def _retry_hint_from_code(
    code: str,
    *,
    char_min: int | None,
    char_max: int | None,
    current_length: int | None = None,
    length_control_mode: str = "default",
) -> str:
    target_hint = _format_target_char_hint(char_min, char_max)
    shortfall = max(0, (char_min or 0) - (current_length or 0)) if char_min and current_length else 0
    if code == "under_min":
        if length_control_mode == "under_min_recovery":
            if shortfall >= 30:
                return (
                    f"新事実を足さず、経験→職種→企業接点をつなぐ1文を補い、"
                    f"{target_hint} を狙う"
                )
            return f"最後に役割や企業との接点を補う1文を足し、{target_hint} を狙う"
        if length_control_mode == "tight_length":
            return f"短くまとめすぎず、根拠経験と企業接点を残して {target_hint} を狙う"
    mapping = {
        "empty": "改善案本文を必ず1件だけ返す",
        "under_min": f"内容を薄めず {target_hint} を狙う",
        "over_max": f"冗長語を削り {target_hint} に収める",
        "style": "です・ます調を使わず、だ・である調に統一する",
        "overlap": "参考ESの言い回しを避け、別表現で書く",
        "future_focus": "1文目で入社後・参加後にやりたいことを言い切る",
        "motivation_focus": "1文目でなぜこの会社かを言い切る",
        "role_focus": "1文目でなぜその職種・コースかを言い切る",
        "fragment": "本文を断片で終わらせず、最後まで言い切る",
        "bulletish_or_listlike": "箇条書きや列挙ではなく、1本の本文にする",
        "evidence_overweight": "過去経験は短くし、設問の主軸を本文の中心に置く",
        "generic": "条件を満たす安全な改善案を返す",
    }
    return mapping.get(code, mapping["generic"])


def _uses_non_claude_tight_length_control(
    *,
    template_type: str,
    char_min: int | None,
    char_max: int | None,
    llm_provider: str,
    review_variant: str,
) -> bool:
    if llm_provider == "claude" or _is_qwen_review_variant(review_variant):
        return False
    if template_type not in NON_CLAUDE_TIGHT_LENGTH_TEMPLATES:
        return False
    return bool(char_min and char_max and 300 <= char_max <= 500)


def _resolve_rewrite_length_control_mode(
    *,
    use_non_claude_length_control: bool,
    attempt: int,
    retry_code: str,
) -> str:
    if not use_non_claude_length_control:
        return "default"
    if retry_code == "under_min" and attempt >= 2:
        return "under_min_recovery"
    return "tight_length"


def _soft_min_shortfall(
    text: str,
    *,
    char_min: int | None,
    char_max: int | None,
) -> int:
    if not char_min or not char_max or not _is_short_answer_mode(char_max):
        return 0
    shortfall = char_min - len(text)
    if shortfall <= 0 or shortfall > SOFT_MIN_SHORTFALL_LIMIT:
        return 0
    return shortfall


def _should_attempt_length_fix(
    text: str,
    *,
    char_min: int | None,
    char_max: int | None,
    use_non_claude_length_control: bool = False,
) -> bool:
    normalized = _normalize_repaired_text(text)
    if not normalized:
        return False
    if char_max and len(normalized) > char_max:
        limit = (
            NON_CLAUDE_LENGTH_FIX_DELTA_LIMIT
            if use_non_claude_length_control
            else LENGTH_FIX_DELTA_LIMIT
        )
        return (len(normalized) - char_max) <= limit
    if char_min and len(normalized) < char_min:
        limit = (
            NON_CLAUDE_LENGTH_FIX_DELTA_LIMIT
            if use_non_claude_length_control
            else LENGTH_FIX_DELTA_LIMIT
        )
        return (char_min - len(normalized)) <= limit
    return False


def _rewrite_max_tokens(
    char_max: int | None,
    *,
    length_fix_mode: bool = False,
    timeout_compact_mode: bool = False,
    review_variant: str = "standard",
) -> int:
    if _is_qwen_review_variant(review_variant):
        if timeout_compact_mode:
            return min(240, max(120, int((char_max or 220) * 0.72)))
        if length_fix_mode:
            return min(220, max(120, int((char_max or 220) * 0.6)))
        if _is_short_answer_mode(char_max):
            return min(260, max(150, int((char_max or 200) * 1.0)))
        return min(420, max(180, int((char_max or 400) * 0.95)))
    if length_fix_mode:
        return min(420, max(220, int((char_max or 400) * 0.95)))
    return min(720, max(260, int((char_max or 500) * 1.4)))


def _improvement_max_tokens(review_variant: str) -> int:
    if _is_qwen_review_variant(review_variant):
        return 320
    return IMPROVEMENT_MAX_TOKENS


def _fallback_attempt_start(review_variant: str) -> int:
    if _is_qwen_review_variant(review_variant):
        return 3
    return REWRITE_MAX_ATTEMPTS


def _total_rewrite_attempts(review_variant: str) -> int:
    if _is_qwen_review_variant(review_variant):
        return 2
    return REWRITE_MAX_ATTEMPTS + FALLBACK_REWRITE_ATTEMPTS


def _normalize_timeout_fallback_clause(
    text: str,
    *,
    limit: int,
) -> str:
    cleaned = _normalize_repaired_text(text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip("。")
    if not cleaned:
        return ""
    cleaned = cleaned.split("。", 1)[0].strip()
    replacements = [
        (r"したい(?:です|と思います|と考えています)$", "したい"),
        (r"なりたい(?:です|と思います|と考えています)$", "なりたい"),
        (r"学びたい(?:です|と思います|と考えています)$", "学びたい"),
        (r"携わりたい(?:です|と思います|と考えています)$", "携わりたい"),
        (r"貢献したい(?:です|と思います|と考えています)$", "貢献したい"),
        (r"考えています$", "考える"),
        (r"思います$", "考える"),
        (r"です$", ""),
        (r"ます$", ""),
    ]
    for pattern, replacement in replacements:
        cleaned = re.sub(pattern, replacement, cleaned)
    if len(cleaned) <= limit:
        return cleaned
    truncated = cleaned[:limit]
    for delimiter in ("。", "、", "，", ",", " "):
        index = truncated.rfind(delimiter)
        if index >= int(limit * 0.55):
            truncated = truncated[:index]
            break
    return truncated.strip("。、，, ")


def _collect_qwen_timeout_support_sentences(
    prompt_user_facts: list[dict[str, Any]],
    *,
    answer: str,
    char_max: int | None,
) -> list[str]:
    limit = 44 if _is_short_answer_mode(char_max) else 84
    normalized_answer = _normalize_timeout_fallback_clause(answer, limit=limit)
    collected: list[str] = []
    seen: set[str] = set()
    for fact in prompt_user_facts:
        text = str(fact.get("text") or "").strip()
        if not text:
            continue
        clause = _normalize_timeout_fallback_clause(text, limit=limit)
        if not clause or clause == normalized_answer or clause in seen:
            continue
        seen.add(clause)
        collected.append(f"{clause}。")
    return collected


def _build_qwen_timeout_anchor_sentence(
    *,
    template_type: str,
    answer: str,
    honorific: str,
    role_name: str | None,
    intern_name: str | None,
) -> str:
    core = _normalize_timeout_fallback_clause(
        answer,
        limit=52 if template_type in {"intern_reason", "intern_goals", "post_join_goals"} else 64,
    )
    if not core:
        core = "自分の強みと学びを生かして価値を出したい"
    if template_type == "company_motivation":
        return f"{honorific}を志望するのは、{core}からだ。"
    if template_type == "role_course_reason":
        return f"{role_name or 'その職種・コース'}を選ぶのは、{core}からだ。"
    if template_type == "post_join_goals":
        return f"入社後は、{core}。"
    if template_type == "intern_goals":
        return f"{intern_name or 'インターン'}では、{core}。"
    if template_type == "intern_reason":
        return f"{intern_name or 'インターン'}に参加したいのは、{core}からだ。"
    if template_type == "self_pr":
        return f"私の強みは、{core}点にある。"
    if template_type == "work_values":
        return f"働く上で大切にしたいのは、{core}姿勢だ。"
    if template_type == "gakuchika":
        return f"学生時代に力を入れたのは、{core}ことだ。"
    return f"{core}。"


def _build_qwen_timeout_tail_sentence(
    *,
    template_type: str,
    honorific: str,
    role_name: str | None,
    intern_name: str | None,
    company_grounding: str,
) -> str:
    if template_type == "company_motivation":
        return f"{honorific}で事業理解を深めながら、価値創出に貢献したい。"
    if template_type == "role_course_reason":
        role = role_name or "その役割"
        return f"{honorific}で{role}として、事業と技術をつなぐ価値を出したい。"
    if template_type == "post_join_goals":
        return "現場で事業理解と実行力を磨きながら、価値創出に貢献したい。"
    if template_type == "intern_goals":
        return f"{intern_name or 'インターン'}の実務を通じて、学びの解像度を高めたい。"
    if template_type == "intern_reason":
        return f"{intern_name or 'インターン'}で実務の手触りを得ながら、成長につなげたい。"
    if template_type == "self_pr":
        if company_grounding == "required":
            return f"{honorific}でもこの強みを生かし、価値創出につなげたい。"
        return "この強みを仕事でも生かし、価値創出につなげたい。"
    if template_type == "work_values":
        return "現場で対話を重ねながら、長期的な価値につなげたい。"
    if template_type == "gakuchika":
        return "この経験で得た学びを、今後の挑戦でも生かしたい。"
    return "これまでに培った学びを土台に、価値創出につなげたい。"


def _qwen_timeout_target_sentence_count(char_max: int | None) -> int:
    if _is_short_answer_mode(char_max):
        return 4
    if char_max and char_max <= 320:
        return 5
    return 7


def _build_qwen_timeout_bridge_sentence(
    *,
    template_type: str,
    honorific: str,
    role_name: str | None,
    intern_name: str | None,
) -> str:
    if template_type == "company_motivation":
        return f"その経験を土台に、{honorific}で事業理解を深めながら価値を形にしたい。"
    if template_type == "role_course_reason":
        return f"その経験で培った視点を、{role_name or 'その職種・コース'}での価値発揮につなげたい。"
    if template_type == "post_join_goals":
        return "その経験で培った推進力を土台に、入社後は現場で事業理解と実行力を磨きたい。"
    if template_type == "intern_reason":
        return f"その経験を土台に、{intern_name or 'インターン'}で実務への解像度を高めたい。"
    if template_type == "intern_goals":
        return f"その経験を土台に、{intern_name or 'インターン'}で学びを実務へ接続したい。"
    if template_type == "self_pr":
        return "その強みは、周囲と連携しながら価値を形にする場面で特に生きる。"
    if template_type == "work_values":
        return "その姿勢を土台に、周囲と対話しながら着実に価値を積み上げたい。"
    if template_type == "gakuchika":
        return "この経験を通じて、課題を整理し周囲を巻き込みながら前に進める力を磨いた。"
    return "その経験を土台に、求められる価値を着実に形にしたい。"


def _build_qwen_timeout_company_sentence(
    *,
    template_type: str,
    honorific: str,
    role_name: str | None,
    company_evidence_cards: list[dict[str, Any]],
) -> str:
    if not company_evidence_cards:
        return ""
    card = company_evidence_cards[0]
    theme = str(card.get("theme") or "").strip()
    claim = _normalize_timeout_fallback_clause(str(card.get("claim") or ""), limit=28)
    if template_type == "role_course_reason":
        if claim:
            return f"特に、{claim}という方向性は、{role_name or 'その職種・コース'}を志向する理由と重なる。"
        return f"{honorific}で{role_name or 'その職種・コース'}として価値を出せる環境にも強く引かれている。"
    if template_type == "company_motivation":
        if claim:
            return f"特に、{claim}という点に、{honorific}ならではの魅力を感じる。"
        return f"{honorific}の事業方向と自分の志向の接点にも魅力を感じる。"
    if template_type == "post_join_goals":
        if claim:
            return f"特に、{claim}という方向性の中で、自分の強みを生かした挑戦を広げたい。"
        return f"{honorific}の事業方向の中で、自分の強みを生かした挑戦を広げたい。"
    if template_type in {"intern_reason", "intern_goals"}:
        if claim:
            return f"特に、{claim}という環境で、実務に近い学びを得られる点に引かれている。"
        return "インターンで実務に近い学びを得られる点にも強く引かれている。"
    if theme in {"価値観", "企業理解", "採用方針", "現場期待"}:
        if claim:
            return f"また、{claim}という姿勢にも自分の価値観との接点を感じる。"
        return f"{honorific}の価値観や現場の姿勢にも、自分との接点を感じる。"
    return ""


def _qwen_timeout_padding_sentences(
    *,
    template_type: str,
    honorific: str,
    role_name: str | None,
    intern_name: str | None,
    company_grounding: str,
) -> list[str]:
    shared = [
        "現場で対話を重ねながら、求められる役割の解像度を高めていきたい。",
        "自分の強みを一方的に示すだけでなく、事業や組織の課題解決に接続できる形まで高めたい。",
        "その過程で、周囲と連携しながら成果を積み上げる姿勢もさらに磨きたい。",
    ]
    if template_type == "role_course_reason":
        return [
            f"{role_name or 'その職種・コース'}では、課題を構造化し関係者を巻き込みながら前に進める力が生きると考える。",
            f"{honorific}でも、事業理解と技術理解を往復しながら価値を出せる人材を目指したい。",
            *shared,
        ]
    if template_type == "company_motivation":
        return [
            f"{honorific}の事業を深く理解し、自分の経験をどの領域で最も生かせるかを見極めながら貢献したい。",
            "幅広い論点を整理しながら本質的な課題に向き合う姿勢を、現場でもさらに磨いていきたい。",
            *shared,
        ]
    if template_type == "post_join_goals":
        return [
            "まずは現場で実務の前提を学び、事業と技術の両面から課題を捉える力を高めたい。",
            "その上で、関係者を巻き込みながら構想を実行へつなぐ役割を担えるようになりたい。",
            *shared,
        ]
    if template_type in {"intern_reason", "intern_goals"}:
        return [
            f"{intern_name or 'インターン'}を通じて、実務で求められる視点と自分の強みのつながりを確かめたい。",
            "限られた期間でも、学んだことを行動へ変えながら現場での価値発揮の仕方を掴みたい。",
            *shared,
        ]
    if template_type == "self_pr":
        tail = [f"{honorific}での業務にもつながる形で強みを発揮したい。"] if company_grounding == "required" else []
        return [
            "相手の状況を踏まえて行動を調整し、チーム全体で成果を出す姿勢にもつなげてきた。",
            *tail,
            *shared,
        ]
    if template_type == "work_values":
        return [
            "短期的な効率だけでなく、周囲と認識を揃えながら長く機能する進め方を大切にしたい。",
            *shared,
        ]
    if template_type == "gakuchika":
        return [
            "課題の背景を捉えた上で打ち手を考え、周囲と共有しながら前進させる姿勢が強みになった。",
            *shared,
        ]
    return shared


def _build_qwen_timeout_fallback_rewrite(
    *,
    template_type: str,
    answer: str,
    prompt_user_facts: list[dict[str, Any]],
    char_min: int | None,
    char_max: int | None,
    company_name: str | None,
    role_name: str | None,
    intern_name: str | None,
    company_grounding: str,
    company_evidence_cards: list[dict[str, Any]],
    industry: str | None = None,
) -> str:
    honorific = get_company_honorific(industry)
    anchor = _build_qwen_timeout_anchor_sentence(
        template_type=template_type,
        answer=answer,
        honorific=honorific,
        role_name=role_name,
        intern_name=intern_name,
    )
    tail = _build_qwen_timeout_tail_sentence(
        template_type=template_type,
        honorific=honorific,
        role_name=role_name,
        intern_name=intern_name,
        company_grounding=company_grounding,
    )
    support_sentences = _collect_qwen_timeout_support_sentences(
        prompt_user_facts,
        answer=answer,
        char_max=char_max,
    )
    bridge = _build_qwen_timeout_bridge_sentence(
        template_type=template_type,
        honorific=honorific,
        role_name=role_name,
        intern_name=intern_name,
    )
    company_sentence = _build_qwen_timeout_company_sentence(
        template_type=template_type,
        honorific=honorific,
        role_name=role_name,
        company_evidence_cards=company_evidence_cards,
    )
    padding_sentences = _qwen_timeout_padding_sentences(
        template_type=template_type,
        honorific=honorific,
        role_name=role_name,
        intern_name=intern_name,
        company_grounding=company_grounding,
    )
    support_limit = 1 if _is_short_answer_mode(char_max) else (2 if char_max and char_max <= 320 else 4)
    candidate_sentences = [
        anchor,
        *support_sentences[:support_limit],
        bridge,
        company_sentence,
        tail,
        *padding_sentences,
    ]
    assembled = ""
    target_floor = char_min or 0
    target_ceiling = char_max or 1000
    target_sentences = _qwen_timeout_target_sentence_count(char_max)
    used_sentences = 0
    for sentence in candidate_sentences:
        if not sentence:
            continue
        next_text = assembled + sentence
        if (
            assembled
            and len(next_text) > target_ceiling
            and len(assembled) >= max(0, target_floor - 24)
        ):
            break
        assembled = next_text
        used_sentences += 1
        if (
            len(assembled) >= target_floor
            and len(assembled) <= target_ceiling
            and used_sentences >= target_sentences
        ):
            break

    if not assembled:
        assembled = anchor + bridge + tail
    return assembled


def _validate_rewrite_candidate(
    candidate: str,
    *,
    template_type: str,
    question: str | None = None,
    company_name: str | None,
    char_min: int | None,
    char_max: int | None,
    issues: list[Issue],
    role_name: str | None,
    grounding_mode: str,
    company_evidence_cards: Optional[list[dict]] = None,
    review_variant: str = "standard",
    use_non_claude_length_control: bool = False,
) -> tuple[str | None, str, str, dict[str, Any]]:
    normalized = _normalize_repaired_text(candidate)
    if not normalized:
        return None, "empty", "改善案が空でした。本文を必ず返してください。", {}

    fitted = _fit_rewrite_text_deterministically(
        normalized,
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        issues=issues,
        role_name=role_name,
        grounding_mode=grounding_mode,
        company_evidence_cards=company_evidence_cards,
        use_non_claude_length_control=use_non_claude_length_control,
    )
    length_meta = {"length_policy": "strict", "length_shortfall": 0}
    if not fitted:
        _, limit_reason = _is_within_char_limits(normalized, char_min, char_max)
        shortfall = _soft_min_shortfall(
            normalized,
            char_min=char_min,
            char_max=char_max,
        )
        if shortfall:
            fitted = normalized
            length_meta = {
                "length_policy": "soft_min_applied",
                "length_shortfall": shortfall,
            }
        else:
            retry_code = "under_min" if limit_reason.startswith("under_min") else "over_max"
            message = (
                "文字数制約を満たしていません。"
                f" 現在{len(normalized)}字で、条件は {limit_reason} です。"
            )
            return None, retry_code, message, {}

    if "です" in fitted or "ます" in fitted:
        return None, "style", "です・ます調が混在しています。だ・である調に統一してください。", {}

    if _should_apply_qwen_semantic_validation(
        review_variant=review_variant,
        template_type=template_type,
        char_max=char_max,
    ):
        semantic_code, semantic_reason = _validate_qwen_short_answer_semantics(
            fitted,
            template_type=template_type,
            company_name=company_name,
            role_name=role_name,
        )
        if semantic_code:
            return None, semantic_code, semantic_reason or "設問への適合が不足しています。", {}

    is_reference_safe, reference_error = _validate_reference_distance(
        template_type=template_type,
        company_name=company_name,
        char_max=char_max,
        variants=[{"text": fitted}],
    )
    if not is_reference_safe:
        return None, "overlap", reference_error or "参考ESとの類似が高すぎます。", {}

    result_code = "soft_min_applied" if length_meta["length_policy"] != "strict" else "ok"
    return fitted, result_code, "ok", length_meta


async def review_section_with_template(
    request: ReviewRequest,
    rag_sources: list[dict],
    company_rag_available: bool,
    json_caller: ReviewJSONCaller | None = None,
    text_caller: ReviewTextCaller | None = None,
    review_feature: str = "es_review",
    llm_provider: str = "claude",
    llm_model: str | None = None,
    review_variant: str = "standard",
    grounding_mode: str = "none",
    triggered_enrichment: bool = False,
    enrichment_completed: bool = False,
    enrichment_sources_added: int = 0,
    injection_risk: str | None = None,
    progress_queue: "asyncio.Queue | None" = None,
) -> ReviewResponse:
    """Review a single ES section with an improvement-first pipeline."""
    json_caller = json_caller or call_llm_with_error
    text_caller = text_caller or call_llm_text_with_error
    template_request = request.template_request
    if not template_request:
        raise ValueError("template_request is required")

    template_type = template_request.template_type
    if template_type not in TEMPLATE_DEFS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template type: {template_type}. Available: {list(TEMPLATE_DEFS.keys())}",
        )

    company_grounding = _get_company_grounding_policy(template_type)
    effective_role_name = (
        request.role_context.primary_role if request.role_context else None
    ) or template_request.role_name
    is_qwen_review = _is_qwen_review_variant(review_variant)

    # Character limits
    char_min = template_request.char_min
    char_max = template_request.char_max

    _queue_progress_event(
        progress_queue,
        step="analysis" if is_qwen_review else "finalize",
        progress=46,
        label="改善案の方針を整理中..." if is_qwen_review else "改善ポイントを整理中...",
        sub_label="必要な事実と企業情報を絞っています"
        if is_qwen_review
        else "元の回答の不足を先に特定しています",
    )
    allowed_user_facts = _build_allowed_user_facts(request)
    logger.info(
        "[ES添削/テンプレート] user facts: count=%s sources=%s",
        len(allowed_user_facts),
        _collect_user_context_sources(request),
    )
    qwen_timeout_deadline = _start_qwen_timeout_budget(review_variant)
    generic_role_mode = _is_generic_role_label(effective_role_name)
    user_priority_urls = {url for url in request.user_provided_corporate_urls if url}
    current_run_priority_urls = {url for url in request.prestream_source_urls if url}
    prompt_user_facts = _select_prompt_user_facts(
        allowed_user_facts,
        template_type=template_type,
        question=template_request.question,
        answer=template_request.answer,
        role_name=effective_role_name,
        intern_name=template_request.intern_name,
        company_name=template_request.company_name,
    )
    if is_qwen_review:
        prompt_user_facts = _trim_qwen_initial_prompt_user_facts(
            prompt_user_facts,
            char_max=char_max,
        )
    company_evidence_cards = _build_company_evidence_cards(
        rag_sources,
        template_type=template_type,
        question=template_request.question,
        answer=template_request.answer,
        role_name=effective_role_name,
        intern_name=template_request.intern_name,
        grounding_mode=grounding_mode,
        user_priority_urls=user_priority_urls,
        current_run_priority_urls=current_run_priority_urls,
    )
    evidence_coverage_level, weak_evidence_notice = _assess_company_evidence_coverage(
        template_type=template_type,
        role_name=effective_role_name,
        company_rag_available=company_rag_available,
        company_evidence_cards=company_evidence_cards,
        grounding_mode=grounding_mode,
    )
    prompt_company_evidence_cards = (
        _trim_qwen_initial_company_evidence_cards(
            company_evidence_cards,
            template_type=template_type,
        )
        if is_qwen_review
        else company_evidence_cards
    )
    if is_qwen_review and not _should_use_qwen_reference_outline(char_max):
        reference_examples = []
        reference_quality_block = ""
    else:
        reference_examples = load_reference_examples(
            template_type,
            char_max=char_max,
            company_name=template_request.company_name,
            max_items=1 if is_qwen_review else 3,
        )
        reference_quality_block = build_reference_quality_block(
            template_type,
            char_max=char_max,
            company_name=template_request.company_name,
        )
    reference_outline_used = "【参考ESから抽出した骨子】" in reference_quality_block
    logger.info(
        "[ES添削/テンプレート] prompt context: selected_user_facts=%s company_evidence_cards=%s reference_examples=%s evidence_coverage=%s company_grounding=%s",
        len(prompt_user_facts),
        len(prompt_company_evidence_cards),
        len(reference_examples),
        evidence_coverage_level,
        company_grounding,
    )
    improvement_timeout_fallback = False
    timeout_stage: str | None = None
    timeout_recovered = False

    top3: list[Issue] = []
    if is_qwen_review:
        logger.info(
            "[ES添削/テンプレート] Qwen rewrite-only mode: improvement generation skipped template=%s",
            template_type,
        )
    else:
        improvement_system_prompt, improvement_user_prompt = build_template_improvement_prompt(
            template_type=template_type,
            question=template_request.question,
            original_answer=template_request.answer,
            company_name=template_request.company_name,
            company_evidence_cards=prompt_company_evidence_cards,
            has_rag=company_rag_available,
            char_min=char_min,
            char_max=char_max,
            allowed_user_facts=prompt_user_facts,
            role_name=effective_role_name,
            grounding_mode=grounding_mode,
            reference_quality_block=reference_quality_block,
            generic_role_mode=generic_role_mode,
            evidence_coverage_level=evidence_coverage_level,
        )
        improvement_result = await json_caller(
            system_prompt=improvement_system_prompt,
            user_message=improvement_user_prompt,
            max_tokens=_improvement_max_tokens(review_variant),
            temperature=0.15,
            model=llm_model,
            feature=review_feature,
            response_format="json_schema",
            json_schema={
                "type": "object",
                "properties": {
                    "top3": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 3,
                        "items": {
                            "type": "object",
                            "properties": {
                                "category": {"type": "string", "maxLength": 12},
                                "issue": {"type": "string", "maxLength": 60},
                                "suggestion": {"type": "string", "maxLength": 60},
                            },
                            "required": ["category", "issue", "suggestion"],
                            "additionalProperties": False,
                        },
                    }
                },
                "required": ["top3"],
                "additionalProperties": False,
            },
            retry_on_parse=True,
            parse_retry_instructions=IMPROVEMENT_PARSE_RETRY_INSTRUCTIONS,
            disable_fallback=True,
        )
        if improvement_result and improvement_result.success and improvement_result.data:
            top3 = _parse_issues(
                improvement_result.data.get("top3", []),
                3,
                role_name=effective_role_name,
                company_rag_available=company_rag_available,
            )
        else:
            logger.warning(
                "[ES添削/テンプレート] improvement generation failed: fallback issues を使用 template=%s success=%s",
                template_type,
                bool(improvement_result and improvement_result.success),
            )
            record_parse_failure("es_review_template_improvements", "fallback_used")

        fallback_issues = _fallback_improvement_points(
            question=template_request.question,
            original_answer=template_request.answer,
            company_rag_available=company_rag_available,
            template_type=template_type,
            role_name=effective_role_name,
            grounding_mode=grounding_mode,
        )
        top3 = _merge_with_fallback_issues(top3, fallback_issues)
        if not top3:
            top3 = fallback_issues
        if len(top3) < 3:
            logger.warning(
                "[ES添削/テンプレート] improvement points を fallback で補完: template=%s count=%s",
                template_type,
                len(top3),
            )

    improvement_payload = [
        {
            "issue_id": issue.issue_id,
            "category": issue.category,
            "issue": issue.issue,
            "suggestion": issue.suggestion,
            "required_action": issue.required_action,
            "must_appear": issue.must_appear,
        }
        for issue in top3
    ]

    final_rewrite = ""
    retry_reason = ""
    retry_code = "generic"
    attempt_failures: list[str] = []
    fallback_to_generic = False
    rewrite_generation_mode = "normal"
    accepted_attempt = 0
    accepted_length_policy = "strict"
    accepted_length_shortfall = 0
    length_fix_attempted = False
    length_fix_result = "not_needed"
    last_rejected_candidate = ""
    qwen_timeout_compact_retry_used = False
    last_rejected_length = 0
    best_rejected_candidate = ""
    best_rejected_length = 0
    best_rejected_distance: int | None = None
    best_retry_code = "generic"
    total_attempts = _total_rewrite_attempts(review_variant)
    fallback_attempt_start = _fallback_attempt_start(review_variant)
    use_non_claude_length_control = _uses_non_claude_tight_length_control(
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        llm_provider=llm_provider,
        review_variant=review_variant,
    )
    for attempt in range(total_attempts):
        timeout_compact_mode = is_qwen_review and qwen_timeout_compact_retry_used
        simplified_mode = attempt >= fallback_attempt_start and not timeout_compact_mode
        length_control_mode = _resolve_rewrite_length_control_mode(
            use_non_claude_length_control=use_non_claude_length_control,
            attempt=attempt,
            retry_code=retry_code,
        )
        retry_hint = _retry_hint_from_code(
            retry_code,
            char_min=char_min,
            char_max=char_max,
            current_length=last_rejected_length or None,
            length_control_mode=length_control_mode,
        )
        length_shortfall = (
            max(0, char_min - last_rejected_length)
            if char_min and last_rejected_length and last_rejected_length < char_min
            else None
        )
        rewrite_source_answer = template_request.answer
        if (
            use_non_claude_length_control
            and best_rejected_candidate
            and retry_code in {"under_min", "over_max"}
            and (length_control_mode == "under_min_recovery" or simplified_mode)
        ):
            rewrite_source_answer = best_rejected_candidate
        attempt_context = _select_rewrite_prompt_context(
            template_type=template_type,
            char_max=char_max,
            attempt=attempt,
            simplified_mode=simplified_mode,
            timeout_compact_mode=timeout_compact_mode,
            review_variant=review_variant,
            prompt_user_facts=prompt_user_facts,
            company_evidence_cards=prompt_company_evidence_cards,
            improvement_payload=improvement_payload,
            reference_quality_block=reference_quality_block,
            evidence_coverage_level=evidence_coverage_level,
        )
        if simplified_mode:
            if not is_qwen_review:
                system_prompt, user_prompt = build_template_fallback_rewrite_prompt(
                    template_type=template_type,
                    company_name=template_request.company_name,
                    industry=template_request.industry,
                    question=template_request.question,
                    answer=rewrite_source_answer,
                    char_min=char_min,
                    char_max=char_max,
                    company_evidence_cards=attempt_context["company_evidence_cards"],
                    has_rag=company_rag_available,
                    improvement_points=attempt_context["improvement_payload"],
                    allowed_user_facts=attempt_context["prompt_user_facts"],
                    intern_name=template_request.intern_name,
                    role_name=effective_role_name,
                    grounding_mode=grounding_mode,
                    retry_hint=retry_hint,
                    reference_quality_block=attempt_context["reference_quality_block"],
                    generic_role_mode=generic_role_mode,
                    evidence_coverage_level=evidence_coverage_level,
                    length_control_mode=length_control_mode,
                    length_shortfall=length_shortfall,
                )
            else:  # pragma: no cover - Qwen rewrite-only path never enters simplified_mode
                raise RuntimeError("Qwen rewrite-only mode should not enter simplified rewrite generation")
        else:
            if is_qwen_review:
                system_prompt, user_prompt = build_qwen_template_rewrite_prompt(
                    template_type=template_type,
                    company_name=template_request.company_name,
                    industry=template_request.industry,
                    question=template_request.question,
                    answer=rewrite_source_answer,
                    char_min=char_min,
                    char_max=char_max,
                    company_evidence_cards=attempt_context["company_evidence_cards"],
                    has_rag=company_rag_available,
                    improvement_points=attempt_context["improvement_payload"],
                    allowed_user_facts=attempt_context["prompt_user_facts"],
                    intern_name=template_request.intern_name,
                    role_name=effective_role_name,
                    grounding_mode=grounding_mode,
                    retry_hint=retry_hint,
                    reference_quality_block=attempt_context["reference_quality_block"],
                    generic_role_mode=generic_role_mode,
                    evidence_coverage_level=evidence_coverage_level,
                )
            else:
                system_prompt, user_prompt = build_template_rewrite_prompt(
                    template_type=template_type,
                    company_name=template_request.company_name,
                    industry=template_request.industry,
                    question=template_request.question,
                    answer=rewrite_source_answer,
                    char_min=char_min,
                    char_max=char_max,
                    company_evidence_cards=attempt_context["company_evidence_cards"],
                    has_rag=company_rag_available,
                    improvement_points=attempt_context["improvement_payload"],
                    allowed_user_facts=attempt_context["prompt_user_facts"],
                    intern_name=template_request.intern_name,
                    role_name=effective_role_name,
                    grounding_mode=grounding_mode,
                    retry_hint=retry_hint,
                    reference_quality_block=attempt_context["reference_quality_block"],
                    generic_role_mode=generic_role_mode,
                    evidence_coverage_level=evidence_coverage_level,
                    length_control_mode=length_control_mode,
                    length_shortfall=length_shortfall,
                )

        logger.info(
            "[ES添削/テンプレート] rewrite %s attempt=%s/%s mode=%s",
            template_type,
            attempt + 1,
            total_attempts,
            "compact_timeout"
            if timeout_compact_mode
            else (
                "fallback"
                if simplified_mode
                else ("length_focus" if length_control_mode == "under_min_recovery" else "normal")
            ),
        )
        _queue_progress_event(
            progress_queue,
            step="rewrite",
            progress=52 if attempt == 0 else min(76, 52 + attempt * 5),
            label=(
                "改善案を短く再生成中..."
                if timeout_compact_mode
                else ("改善案を簡易化中..." if simplified_mode else "改善案を作成中...")
            ),
            sub_label="事実を保ちながら提出用の本文に整えています"
            if (simplified_mode or timeout_compact_mode)
            else "改善ポイントを反映した改善案を整えています",
        )

        rewrite_stage = "compact_rewrite" if timeout_compact_mode else "rewrite"
        rewrite_timeout_seconds = _qwen_stage_timeout_seconds(rewrite_stage, qwen_timeout_deadline)
        if is_qwen_review and rewrite_timeout_seconds == 0:
            retry_reason = "Qwen rewrite の残り予算が尽きました。"
            attempt_failures.append(retry_reason)
            timeout_stage = rewrite_stage
            logger.warning(
                "[ES添削/テンプレート] rewrite %s attempt=%s/%s skipped: Qwen budget exhausted",
                template_type,
                attempt + 1,
                total_attempts,
            )
            break

        rewrite_result = await text_caller(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=_rewrite_max_tokens(
                char_max,
                timeout_compact_mode=timeout_compact_mode,
                review_variant=review_variant,
            ),
            temperature=(
                0.12
                if use_non_claude_length_control
                and not timeout_compact_mode
                and (length_control_mode == "under_min_recovery" or simplified_mode)
                else 0.2
            ),
            model=llm_model,
            feature=review_feature,
            disable_fallback=True,
            **_qwen_timeout_kwargs(rewrite_timeout_seconds),
        )

        if not rewrite_result.success or not rewrite_result.data:
            error = rewrite_result.error
            if is_qwen_review and error and error.error_type == "timeout":
                retry_reason = "Qwen rewrite がタイムアウトしました。"
                attempt_failures.append(retry_reason)
                timeout_stage = rewrite_stage
                logger.warning(
                    "[ES添削/テンプレート] rewrite %s attempt=%s/%s timeout stage=%s",
                    template_type,
                    attempt + 1,
                    total_attempts,
                    rewrite_stage,
                )
                if not timeout_compact_mode and not qwen_timeout_compact_retry_used:
                    qwen_timeout_compact_retry_used = True
                    continue
                break
            raise HTTPException(
                status_code=503,
                detail={
                    "error": error.message if error else "AI処理中にエラーが発生しました",
                    "error_type": error.error_type if error else "unknown",
                    "provider": error.provider if error else "unknown",
                    "detail": error.detail if error else "",
                },
            )

        candidate = (
            rewrite_result.data.get("text", "")
            if isinstance(rewrite_result.data, dict)
            else str(rewrite_result.data)
        )
        if timeout_compact_mode:
            timeout_recovered = True
            rewrite_generation_mode = "compact_timeout"
            qwen_timeout_compact_retry_used = False
        last_rejected_candidate = candidate
        last_rejected_length = len(_normalize_repaired_text(candidate))
        validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
            candidate,
            template_type=template_type,
            question=template_request.question,
            company_name=template_request.company_name,
            char_min=char_min,
            char_max=char_max,
            issues=top3,
            role_name=effective_role_name,
            grounding_mode=grounding_mode,
            company_evidence_cards=prompt_company_evidence_cards,
            review_variant=review_variant,
            use_non_claude_length_control=use_non_claude_length_control,
        )
        if not validated_candidate:
            candidate_distance = _char_limit_distance(
                _normalize_repaired_text(candidate),
                char_min=char_min,
                char_max=char_max,
            )
            if best_rejected_distance is None or candidate_distance < best_rejected_distance:
                best_rejected_candidate = _normalize_repaired_text(candidate)
                best_rejected_length = len(best_rejected_candidate)
                best_rejected_distance = candidate_distance
                best_retry_code = retry_code
            attempt_failures.append(retry_reason)
            logger.warning(
                "[ES添削/テンプレート] rewrite %s attempt=%s/%s 失敗: %s",
                template_type,
                attempt + 1,
                total_attempts,
                _describe_retry_reason(retry_reason),
            )
            continue

        final_rewrite = validated_candidate
        fallback_to_generic = simplified_mode or timeout_compact_mode
        accepted_attempt = attempt + 1
        accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
        accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
        if timeout_compact_mode:
            rewrite_generation_mode = "compact_timeout"
        elif simplified_mode:
            rewrite_generation_mode = "fallback"
        elif length_control_mode == "under_min_recovery":
            rewrite_generation_mode = "length_focus"
        else:
            rewrite_generation_mode = "normal"
        break

    if (
        not final_rewrite
        and not is_qwen_review
        and (best_rejected_candidate or last_rejected_candidate)
        and _should_attempt_length_fix(
            best_rejected_candidate or last_rejected_candidate,
            char_min=char_min,
            char_max=char_max,
            use_non_claude_length_control=use_non_claude_length_control,
        )
    ):
        length_fix_attempted = True
        length_fix_source = best_rejected_candidate or last_rejected_candidate
        length_fix_code = best_retry_code if best_rejected_candidate else retry_code
        logger.info(
            "[ES添削/テンプレート] length-fix attempt: template=%s mode=%s",
            template_type,
            length_fix_code,
        )
        system_prompt, user_prompt = build_template_length_fix_prompt(
            template_type=template_type,
            current_text=length_fix_source,
            char_min=char_min,
            char_max=char_max,
            fix_mode=length_fix_code,
            length_control_mode=(
                "under_min_recovery"
                if use_non_claude_length_control and length_fix_code in {"under_min", "over_max"}
                else "default"
            ),
        )
        length_fix_timeout_seconds = _qwen_stage_timeout_seconds("length_fix", qwen_timeout_deadline)
        if length_fix_timeout_seconds == 0 and _is_qwen_review_variant(review_variant):
            length_fix_result = "failed"
            timeout_stage = "length_fix"
            logger.warning(
                "[ES添削/テンプレート] length-fix skipped: Qwen budget exhausted template=%s",
                template_type,
            )
        else:
            rewrite_result = await text_caller(
                system_prompt=system_prompt,
                user_message=user_prompt,
                max_tokens=_rewrite_max_tokens(char_max, length_fix_mode=True, review_variant=review_variant),
                temperature=0.1,
                model=llm_model,
                feature=review_feature,
                disable_fallback=True,
                **_qwen_timeout_kwargs(length_fix_timeout_seconds),
            )
            if rewrite_result.success and rewrite_result.data:
                candidate = (
                    rewrite_result.data.get("text", "")
                    if isinstance(rewrite_result.data, dict)
                    else str(rewrite_result.data)
                )
                validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
                    candidate,
                    template_type=template_type,
                    question=template_request.question,
                    company_name=template_request.company_name,
                    char_min=char_min,
                    char_max=char_max,
                    issues=top3,
                    role_name=effective_role_name,
                    grounding_mode=grounding_mode,
                    company_evidence_cards=prompt_company_evidence_cards,
                    review_variant=review_variant,
                    use_non_claude_length_control=use_non_claude_length_control,
                )
                if validated_candidate:
                    final_rewrite = validated_candidate
                    accepted_attempt = total_attempts + LENGTH_FIX_REWRITE_ATTEMPTS
                    accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
                    accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
                    length_fix_result = (
                        "soft_min_applied"
                        if accepted_length_policy != "strict"
                        else "strict_recovered"
                    )
                else:
                    length_fix_result = "failed"
            else:
                if (
                    is_qwen_review
                    and rewrite_result.error
                    and rewrite_result.error.error_type == "timeout"
                ):
                    timeout_stage = "length_fix"
                    retry_reason = "Qwen length-fix がタイムアウトしました。"
                length_fix_result = "failed"

    if not final_rewrite and is_qwen_review and timeout_stage in {"rewrite", "compact_rewrite", "length_fix"}:
        logger.warning(
            "[ES添削/テンプレート] rewrite timeout fallback: template=%s stage=%s",
            template_type,
            timeout_stage,
        )
        timeout_candidate = _build_qwen_timeout_fallback_rewrite(
            template_type=template_type,
            answer=template_request.answer,
            prompt_user_facts=prompt_user_facts,
            char_min=char_min,
            char_max=char_max,
            company_name=template_request.company_name,
            role_name=effective_role_name,
            intern_name=template_request.intern_name,
            company_grounding=company_grounding,
            company_evidence_cards=prompt_company_evidence_cards,
            industry=template_request.industry,
        )
        validated_candidate, _, _, retry_meta = _validate_rewrite_candidate(
            timeout_candidate,
            template_type=template_type,
            question=template_request.question,
            company_name=template_request.company_name,
            char_min=char_min,
            char_max=char_max,
            issues=top3,
            role_name=effective_role_name,
            grounding_mode=grounding_mode,
            company_evidence_cards=prompt_company_evidence_cards,
            review_variant=review_variant,
            use_non_claude_length_control=use_non_claude_length_control,
        )
        if validated_candidate:
            final_rewrite = validated_candidate
            fallback_to_generic = True
            timeout_recovered = True
            rewrite_generation_mode = "timeout_fallback"
            accepted_attempt = total_attempts + (LENGTH_FIX_REWRITE_ATTEMPTS if length_fix_attempted else 0) + 1
            accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
            accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)

    if not final_rewrite:
        record_parse_failure("es_review_template_rewrite", retry_reason)
        logger.error(
            f"[ES添削/テンプレート] rewrite {template_type} 最終失敗: "
            f"{_describe_retry_reason(retry_reason)} / 履歴={attempt_failures}"
        )
        raise HTTPException(
            status_code=422,
            detail={
                "error": GENERIC_REWRITE_VALIDATION_ERROR,
                "error_type": "validation",
                "provider": "template_rewrite",
            },
        )

    total_logged_attempts = total_attempts + (LENGTH_FIX_REWRITE_ATTEMPTS if length_fix_attempted else 0)
    if rewrite_generation_mode == "timeout_fallback":
        total_logged_attempts += 1
    logger.info(
        "[ES添削/テンプレート] rewrite success: template=%s attempt=%s/%s chars=%s fallback=%s",
        template_type,
        accepted_attempt,
        total_logged_attempts,
        len(final_rewrite),
        fallback_to_generic,
    )
    _queue_progress_event(
        progress_queue,
        step="rewrite",
        progress=80,
        label="改善案を表示中...",
        sub_label="確定した改善案をそのまま表示しています",
    )
    await _stream_final_rewrite(progress_queue, final_rewrite)

    if top3:
        _queue_progress_event(
            progress_queue,
            step="finalize",
            progress=86,
            label="改善ポイントを表示中...",
            sub_label="元の回答に対する指摘を順に表示しています",
        )
        await _stream_improvement_points(progress_queue, top3)
    else:
        _queue_progress_event(
            progress_queue,
            step="sources",
            progress=90,
            label="出典リンクを表示中...",
            sub_label="企業情報の参照元を整理しています",
        )

    template_review = _build_template_review_response(
        template_type=template_type,
        rewrite_text=final_rewrite,
        rag_sources=rag_sources,
    )
    await _stream_source_links(progress_queue, template_review.keyword_sources)

    return ReviewResponse(
        top3=top3,
        rewrites=[final_rewrite],
        template_review=template_review,
        review_meta=_build_review_meta(
            request,
            llm_provider=llm_provider,
            llm_model=llm_model,
            review_variant=review_variant,
            grounding_mode=grounding_mode,
            triggered_enrichment=triggered_enrichment,
            enrichment_completed=enrichment_completed,
            enrichment_sources_added=enrichment_sources_added,
            injection_risk=injection_risk,
            fallback_to_generic=fallback_to_generic,
            improvement_timeout_fallback=improvement_timeout_fallback,
            timeout_stage=timeout_stage,
            timeout_recovered=timeout_recovered,
            rewrite_generation_mode=rewrite_generation_mode,
            reference_es_count=len(reference_examples),
            reference_quality_profile_used=bool(reference_quality_block),
            reference_outline_used=reference_outline_used,
            company_grounding_policy=company_grounding,
            company_evidence_count=len(prompt_company_evidence_cards),
            evidence_coverage_level=evidence_coverage_level,
            weak_evidence_notice=weak_evidence_notice,
            length_policy=accepted_length_policy,
            length_shortfall=accepted_length_shortfall,
            length_fix_attempted=length_fix_attempted,
            length_fix_result=length_fix_result,
        ),
    )


PROGRESS_STEPS = [
    {
        "id": "validation",
        "label": "入力を検証中...",
        "subLabel": "内容の確認",
    },
    {
        "id": "rag_fetch",
        "label": "企業情報を取得中...",
        "subLabel": "RAGコンテキスト検索",
    },
    {
        "id": "analysis",
        "label": "設問を分析中...",
        "subLabel": "論点と改善余地を整理",
    },
    {
        "id": "rewrite",
        "label": "改善案を作成中...",
        "subLabel": "設問に合う表現へ整えています",
    },
    {
        "id": "finalize",
        "label": "表示を整えています...",
        "subLabel": "結果をまとめています",
    },
    {
        "id": "sources",
        "label": "出典リンクを表示中...",
        "subLabel": "関連情報を最後に添えています",
    },
]


def _sse_event(event_type: str, data: dict) -> str:
    """Format SSE event data."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_comment(comment: str = "keep-alive") -> str:
    """Emit an SSE comment block to keep idle streams open through proxies."""
    return f": {comment}\n\n"


async def _generate_review_progress(
    request: ReviewRequest,
    *,
    review_runner: Callable[..., Awaitable[ReviewResponse]] = review_section_with_template,
    review_runner_kwargs: Optional[dict[str, Any]] = None,
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for ES review progress.
    Yields progress updates as the review is processed.
    """
    review_runner_kwargs = dict(review_runner_kwargs or {})
    if "llm_provider" not in review_runner_kwargs or "llm_model" not in review_runner_kwargs:
        requested_model = request.llm_model.strip() if request.llm_model else None
        llm_provider, llm_model = resolve_feature_model_metadata(
            "es_review", requested_model
        )
        review_runner_kwargs.setdefault("llm_provider", llm_provider)
        review_runner_kwargs.setdefault("llm_model", llm_model)
    try:
        injection_risk, injection_reasons = _detect_request_injection_risk(request)
        if injection_risk == "high":
            logger.warning(
                "[ES添削/SSE] 危険入力を検知したため遮断: "
                + " / ".join(injection_reasons[:3])
            )
            yield _sse_event("error", {"message": GENERIC_INPUT_VALIDATION_ERROR})
            return
        if injection_risk == "medium":
            logger.warning(
                "[ES添削/SSE] 入力を無害化して続行: "
                + " / ".join(injection_reasons[:3])
            )

        _sanitize_review_request(request)
        last_stream_activity = time.monotonic()
        last_keepalive = last_stream_activity

        # Step 1: Validation
        yield _sse_event(
            "progress",
            {"step": "validation", "progress": 5, "label": "入力を検証中..."},
        )
        last_stream_activity = time.monotonic()
        await asyncio.sleep(0.1)  # Small delay to ensure event is sent

        if not request.content or len(request.content.strip()) < 10:
            yield _sse_event(
                "error",
                {
                    "message": "ESの内容が短すぎます。もう少し詳しく書いてから添削をリクエストしてください。"
                },
            )
            last_stream_activity = time.monotonic()
            return

        if not request.section_title:
            yield _sse_event(
                "error",
                {"message": "設問タイトルが必要です。設問ごとに添削してください。"},
            )
            last_stream_activity = time.monotonic()
            return

        yield _sse_event(
            "progress",
            {"step": "validation", "progress": 10, "label": "検証完了"},
        )
        last_stream_activity = time.monotonic()

        template_request = request.template_request
        if not template_request:
            char_max = request.section_char_limit
            char_min = _derive_char_min(char_max)
            template_request = TemplateRequest(
                template_type="basic",
                company_name=None,
                industry=None,
                question=request.section_title or "",
                answer=request.content,
                char_min=char_min,
                char_max=char_max,
                role_name=request.role_context.primary_role if request.role_context else None,
            )

        company_grounding = _get_company_grounding_policy(template_request.template_type)
        assistive_company_signal = _company_grounding_is_assistive(
            template_request.template_type
        ) and _question_has_assistive_company_signal(
            template_type=template_request.template_type,
            question=template_request.question,
        )
        template_rag_profile = get_template_rag_profile(template_request.template_type)
        rag_boosts = _build_role_rag_boosts(
            template_request.template_type,
            request.role_context.primary_role if request.role_context else template_request.role_name,
        )
        if _company_grounding_is_required(template_request.template_type):
            template_rag_profile["short_circuit"] = False
        elif assistive_company_signal:
            template_rag_profile["short_circuit"] = False
        if rag_boosts:
            template_rag_profile["content_type_boosts"] = rag_boosts
            template_rag_profile["short_circuit"] = False

        # Step 2: RAG fetch (if company_id)
        rag_context = ""
        rag_sources: list[dict] = []
        company_rag_available = request.has_company_rag
        context_length = get_dynamic_context_length(request.content)
        retrieval_query = request.retrieval_query or request.content
        grounding_mode = "none"
        triggered_enrichment = bool(request.prestream_enrichment_attempted)
        enrichment_completed = bool(request.prestream_enrichment_completed)
        enrichment_sources_added = max(0, int(request.prestream_enrichment_sources_added or 0))
        user_priority_urls = {url for url in request.user_provided_corporate_urls if url}
        current_run_priority_urls = {url for url in request.prestream_source_urls if url}
        direct_source_urls = list(dict.fromkeys([*request.user_provided_corporate_urls, *request.prestream_source_urls]))

        if request.company_id:
            yield _sse_event(
                "progress",
                {
                    "step": "rag_fetch",
                    "progress": 15,
                    "label": "企業情報を取得中...",
                },
            )
            last_stream_activity = time.monotonic()

            if not company_rag_available:
                company_rag_available = has_company_rag(request.company_id)

            if company_rag_available:
                min_context_length = max(0, settings.rag_min_context_chars)
                rag_context, rag_sources = (
                    await get_enhanced_context_for_review_with_sources(
                        company_id=request.company_id,
                        es_content=retrieval_query,
                        max_context_length=context_length,
                        search_options=template_rag_profile,
                    )
                )
                if direct_source_urls:
                    direct_context, direct_sources = (
                        await get_context_for_source_urls_with_sources(
                            company_id=request.company_id,
                            source_urls=direct_source_urls,
                            max_context_length=max(400, min(context_length, 1400)),
                        )
                    )
                    if direct_context:
                        rag_context = "\n\n".join(
                            part for part in [direct_context, rag_context] if part
                        ).strip()
                    if direct_sources:
                        rag_sources = _merge_rag_sources(direct_sources, rag_sources)
                is_rag_available, rag_reason = _evaluate_template_rag_availability(
                    rag_context=rag_context,
                    rag_sources=rag_sources,
                    min_context_length=min_context_length,
                )
                logger.info(
                    f"[ES添削/SSE/テンプレート] 企業RAG判定: 本文長={len(rag_context)}文字 "
                    f"出典数={len(rag_sources)}件 必要最小長={min_context_length}文字 "
                    f"判定={_describe_rag_reason(rag_reason)}"
                )
                if not is_rag_available:
                    rag_context = ""
                    rag_sources = []
                    company_rag_available = False
                elif not rag_sources:
                    logger.warning(
                        "[ES添削/SSE/テンプレート] ⚠️ RAG本文は利用可だが出典情報不足 - "
                        "企業接続評価は継続しキーワード抽出はフォールバック"
                    )

                record_rag_context(
                    company_id=request.company_id,
                    context_length=len(rag_context),
                    source_count=len(rag_sources),
                )
                grounding_mode = _evaluate_grounding_mode(
                    template_request.template_type,
                    rag_context,
                    rag_sources,
                    request.role_context.primary_role if request.role_context else template_request.role_name,
                    company_rag_available,
                )
                primary_role = (
                    request.role_context.primary_role if request.role_context else template_request.role_name
                )
                initial_company_evidence_cards = _build_company_evidence_cards(
                    rag_sources,
                    template_type=template_request.template_type,
                    question=template_request.question,
                    answer=template_request.answer,
                    role_name=primary_role,
                    intern_name=template_request.intern_name,
                    grounding_mode=grounding_mode,
                    user_priority_urls=user_priority_urls,
                    current_run_priority_urls=current_run_priority_urls,
                )
                initial_coverage_level, _ = _assess_company_evidence_coverage(
                    template_type=template_request.template_type,
                    role_name=primary_role,
                    company_rag_available=company_rag_available,
                    company_evidence_cards=initial_company_evidence_cards,
                    grounding_mode=grounding_mode,
                )
                second_pass_used = False
                if _should_run_role_focused_second_pass(
                    template_request=template_request,
                    primary_role=primary_role,
                    company_rag_available=company_rag_available,
                    grounding_mode=grounding_mode,
                    company_evidence_cards=initial_company_evidence_cards,
                    evidence_coverage_level=initial_coverage_level,
                    assistive_company_signal=assistive_company_signal,
                ):
                    second_pass_anchor = (
                        primary_role
                        or template_request.intern_name
                        or template_request.question
                    )
                    if second_pass_anchor:
                        second_pass_used = True
                        second_pass_query = _build_role_focused_second_pass_query(
                            template_request,
                            primary_role,
                        )
                        second_pass_options = dict(template_rag_profile)
                        second_pass_options["content_type_boosts"] = _build_second_pass_content_type_boosts(
                            template_request,
                            primary_role,
                        )
                        second_pass_options["short_circuit"] = False
                        second_context, second_sources = (
                            await get_enhanced_context_for_review_with_sources(
                                company_id=request.company_id,
                                es_content=second_pass_query,
                                max_context_length=context_length,
                                search_options=second_pass_options,
                            )
                        )
                        if second_context:
                            rag_context = "\n\n".join(
                                part for part in [rag_context, second_context] if part
                            ).strip()
                        rag_sources = _merge_rag_sources(rag_sources, second_sources)
                        grounding_mode = _evaluate_grounding_mode(
                            template_request.template_type,
                            rag_context,
                            rag_sources,
                            primary_role,
                            company_rag_available,
                        )
                        logger.info(
                            "[ES添削/SSE/テンプレート] role-focused second pass: query=%s source_count=%s grounding_mode=%s initial_coverage=%s",
                            second_pass_query,
                            len(rag_sources),
                            grounding_mode,
                            initial_coverage_level,
                        )
                logger.info(
                    "[ES添削/SSE/テンプレート] grounding_mode=%s primary_role=%s triggered_enrichment=%s enrichment_completed=%s enrichment_sources_added=%s second_pass_used=%s",
                    grounding_mode,
                    (
                        request.role_context.primary_role
                        if request.role_context
                        else template_request.role_name
                    )
                    or "未指定",
                    triggered_enrichment,
                    enrichment_completed,
                    enrichment_sources_added,
                    second_pass_used,
                )

            yield _sse_event(
                "progress",
                {
                    "step": "rag_fetch",
                    "progress": 30,
                    "label": "企業情報取得完了"
                    if company_rag_available
                    else "企業情報なし",
                },
            )
            last_stream_activity = time.monotonic()
        else:
            yield _sse_event(
                "progress",
                {"step": "rag_fetch", "progress": 30, "label": "スキップ"},
            )
            last_stream_activity = time.monotonic()

        yield _sse_event(
            "progress",
            {"step": "analysis", "progress": 38, "label": "設問を分析中..."},
        )
        last_stream_activity = time.monotonic()

        section_request = request.model_copy(update={"template_request": template_request})

        progress_queue: asyncio.Queue = asyncio.Queue(maxsize=200)

        async def _run_template_review() -> ReviewResponse:
            return await review_runner(
                request=section_request,
                rag_sources=rag_sources,
                company_rag_available=company_rag_available,
                grounding_mode=grounding_mode,
                triggered_enrichment=triggered_enrichment,
                enrichment_completed=enrichment_completed,
                enrichment_sources_added=enrichment_sources_added,
                injection_risk=injection_risk if injection_risk != "none" else None,
                progress_queue=progress_queue,
                **review_runner_kwargs,
            )

        review_task = asyncio.create_task(_run_template_review())

        while not review_task.done():
            try:
                event_type, event_data = await asyncio.wait_for(
                    progress_queue.get(), timeout=0.4
                )
                if event_type in {
                    "progress",
                    "string_chunk",
                    "field_complete",
                    "array_item_complete",
                }:
                    yield _sse_event(event_type, event_data)
                    last_stream_activity = time.monotonic()
            except asyncio.TimeoutError:
                now = time.monotonic()
                if (
                    not review_task.done()
                    and (now - last_stream_activity) >= SSE_KEEPALIVE_INTERVAL_SECONDS
                    and (now - last_keepalive) >= SSE_KEEPALIVE_INTERVAL_SECONDS
                ):
                    yield _sse_comment()
                    last_stream_activity = now
                    last_keepalive = now
                continue

        while not progress_queue.empty():
            try:
                event_type, event_data = progress_queue.get_nowait()
                if event_type in {
                    "progress",
                    "string_chunk",
                    "field_complete",
                    "array_item_complete",
                }:
                    yield _sse_event(event_type, event_data)
                    last_stream_activity = time.monotonic()
            except asyncio.QueueEmpty:
                break

        try:
            result = await review_task
        except HTTPException as e:
            detail = e.detail
            if isinstance(detail, dict):
                message = (
                    detail.get("error")
                    or detail.get("message")
                    or detail.get("detail")
                    or "AI処理中にエラーが発生しました"
                )
            else:
                message = str(detail)
            yield _sse_event("error", {"message": message})
            last_stream_activity = time.monotonic()
            return

        yield _sse_event("complete", {"result": result.model_dump()})
        last_stream_activity = time.monotonic()

    except Exception as e:
        logger.error(f"[ES添削/SSE] ❌ エラー: {e}")
        yield _sse_event("error", {"message": str(e)})


def _build_review_streaming_response(
    generator: AsyncGenerator[str, None],
) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/review/stream")
async def review_es_stream(request: ReviewRequest):
    """
    Stream ES review progress via Server-Sent Events (SSE).

    This endpoint provides real-time progress updates during ES review,
    allowing the frontend to show accurate progress to users.

    Events:
    - progress: {"type": "progress", "step": "...", "progress": 0-100, "label": "..."}
    - complete: {"type": "complete", "result": {...}}
    - error: {"type": "error", "message": "..."}
    """
    return _build_review_streaming_response(_generate_review_progress(request))


@router.post("/review/qwen/stream")
async def review_es_stream_qwen_beta(request: ReviewRequest):
    """Stream ES review progress via the Qwen3 beta route."""
    if not is_qwen_es_review_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Qwen3 ES添削 beta はまだ有効化されていません",
                "error_type": "disabled",
                "provider": "qwen-es-review",
            },
        )

    return _build_review_streaming_response(
        _generate_review_progress(
            request,
            review_runner=review_section_with_template,
            review_runner_kwargs={
                "json_caller": call_qwen_es_review_json_with_error,
                "text_caller": call_qwen_es_review_text_with_error,
                "review_feature": "es_review_qwen_beta",
                "llm_provider": "qwen-es-review",
                "llm_model": resolve_qwen_es_review_model_name(),
                "review_variant": "qwen3-beta",
            },
        )
    )


@router.get("/company-status/{company_id}", response_model=CompanyReviewStatusResponse)
async def get_company_review_status(company_id: str):
    return evaluate_company_review_status(company_id)
