"""ES review router."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, AsyncGenerator, Any, Awaitable, Callable
import json
import asyncio
import math
import re
import time
from urllib.parse import urlparse
import os

from app.config import settings
from app.utils.secure_logger import get_logger
from app.utils.llm import (
    call_llm_text_with_error,
    call_llm_with_error,
    consume_request_llm_cost_summary,
    sanitize_es_content,
    detect_es_injection_risk,
    sanitize_prompt_input,
    resolve_feature_model_metadata,
)
from app.utils.vector_store import (
    get_enhanced_context_for_review_with_sources,
    has_company_rag,
    get_company_rag_status,
    get_dynamic_context_length,
)
from app.utils.content_types import content_type_label
from app.utils.company_names import classify_company_domain_relation

logger = get_logger(__name__)
from app.utils.telemetry import (
    record_parse_failure,
    record_rag_context,
)
from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    build_template_length_fix_prompt,
    build_template_rewrite_prompt,
    get_template_company_grounding_policy,
    get_template_rag_profile,
    resolve_length_control_profile,
)
from app.prompts.reference_es import (
    build_reference_quality_block,
    build_reference_quality_profile,
    load_reference_examples,
)
from app.limiter import limiter

router = APIRouter(prefix="/api/es", tags=["es-review"])

ReviewJSONCaller = Callable[..., Awaitable[Any]]
ReviewTextCaller = Callable[..., Awaitable[Any]]

REWRITE_MAX_ATTEMPTS = 3
LENGTH_FIX_REWRITE_ATTEMPTS = 1
# OpenAI Responses の推論トークンが max_output に含まれるため、可視出力の前に枯渇しないよう下限を設ける。
_OPENAI_ES_REVIEW_OUTPUT_TOKEN_FLOOR = 4096
PROMPT_USER_FACT_LIMIT = 8
COMPANY_EVIDENCE_CARD_LIMIT = 5
SHORT_ANSWER_CHAR_MAX = 220
SOFT_MIN_SHORTFALL_LIMIT = 8
FINAL_SOFT_MIN_FLOOR_RATIO = 0.9
LENGTH_FIX_DELTA_LIMIT = 25
# under_min は短い生成が続くことがあるため、over_max より広い差分まで length-fix を許可する
LENGTH_FIX_UNDER_MIN_GAP_LIMIT = 200
TIGHT_LENGTH_FIX_DELTA_LIMIT = 45
TIGHT_LENGTH_TEMPLATES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
    "role_course_reason",
}
SSE_KEEPALIVE_INTERVAL_SECONDS = 15.0
GENERIC_REWRITE_VALIDATION_ERROR = "条件を満たす改善案を生成できませんでした。再実行してください。"
GENERIC_INPUT_VALIDATION_ERROR = "入力内容を確認して再実行してください。"
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
SOURCE_FAMILY_CONTENT_TYPES = {
    "hiring_role": {
        "new_grad_recruitment",
        "midcareer_recruitment",
    },
    "people_values": {
        "employee_interviews",
        "ceo_message",
        "corporate_site",
    },
    "business_future": {
        "corporate_site",
        "press_release",
        "midterm_plan",
        "ir_materials",
        "csr_sustainability",
    },
}
SOURCE_BOOST_HIGH = 1.35
SOURCE_BOOST_MEDIUM = 1.18
SOURCE_BOOST_LOW = 0.92
SOURCE_BOOST_DISABLED = 0.0
PRIORITY_SOURCE_URL_BOOST = 1.25
TEMPLATE_SOURCE_FAMILY_PRIORITIES = {
    "company_motivation": ("business_future", "people_values", "hiring_role"),
    "role_course_reason": ("hiring_role", "people_values", "business_future"),
    "intern_reason": ("hiring_role", "people_values", "business_future"),
    "intern_goals": ("people_values", "hiring_role", "business_future"),
    "post_join_goals": ("business_future", "people_values", "hiring_role"),
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


class ReviewTokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cached_input_tokens: int = 0
    llm_call_count: int = 0
    structured_call_count: int = 0
    text_call_count: int = 0


class ReviewMeta(BaseModel):
    llm_provider: str = "claude"
    llm_model: Optional[str] = None
    llm_model_alias: Optional[str] = None
    review_variant: str = "standard"
    grounding_mode: str = "none"
    primary_role: Optional[str] = None
    role_source: Optional[str] = None
    triggered_enrichment: bool = False
    enrichment_completed: bool = False
    enrichment_sources_added: int = 0
    reference_es_count: int = 0
    reference_es_mode: str = "quality_profile_only"
    reference_quality_profile_used: bool = False
    reference_outline_used: bool = False
    reference_hint_count: int = 0
    reference_conditional_hints_applied: bool = False
    reference_profile_variance: Optional[str] = None
    company_grounding_policy: str = "assistive"
    effective_company_grounding_policy: str = "assistive"
    company_evidence_count: int = 0
    company_evidence_verified_count: int = 0
    company_evidence_rejected_count: int = 0
    company_grounding_safety_applied: bool = False
    evidence_coverage_level: str = "none"
    weak_evidence_notice: bool = False
    injection_risk: Optional[str] = None
    user_context_sources: list[str] = Field(default_factory=list)
    hallucination_guard_mode: str = "strict"
    rewrite_generation_mode: str = "normal"
    rewrite_attempt_count: int = 0
    length_policy: str = "strict"
    length_shortfall: int = 0
    soft_min_floor_ratio: float | None = None
    length_fix_attempted: bool = False
    length_fix_result: str = "not_needed"
    rewrite_validation_status: str = "strict_ok"
    rewrite_validation_codes: list[str] = Field(default_factory=list)
    rewrite_validation_user_hint: Optional[str] = None
    length_profile_id: Optional[str] = None
    target_window_lower: Optional[int] = None
    target_window_upper: Optional[int] = None
    source_fill_ratio: Optional[float] = None
    required_growth: int = 0
    latest_failed_length: int = 0
    length_failure_code: Optional[str] = None
    retrieval_profile_name: Optional[str] = None
    priority_source_match_count: int = 0
    token_usage: Optional[ReviewTokenUsage] = Field(default=None, exclude=True)
    # LIVE_ES_REVIEW_CAPTURE_DEBUG=1 のときのみ埋まる（API 既定シリアライズから除外）
    rewrite_rejection_reasons: list[str] = Field(default_factory=list, exclude=True)
    rewrite_attempt_trace: list[dict[str, Any]] = Field(default_factory=list, exclude=True)
    rewrite_total_rewrite_attempts: int = Field(default=0, exclude=True)


class TemplateReview(BaseModel):
    """Template-based review result."""

    template_type: str
    variants: list[TemplateVariant]
    keyword_sources: list[TemplateSource]


class ReviewRequest(BaseModel):
    content: str
    section_id: Optional[str] = None
    document_id: Optional[str] = None  # Current ES document (for in-app citation links)
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


def _coerce_degraded_rewrite_dearu_style(text: str) -> str:
    """degraded 採用時のみ。安全な置換でです・ますを減らし、空にならなければ採用する。"""
    if "です" not in text and "ます" not in text:
        return text
    t = text
    pairs = (
        ("しています", "している"),
        ("いています", "いている"),
        ("なっています", "なっている"),
        ("でいます", "でいる"),
        ("であります", "である"),
        ("あります。", "ある。"),
        ("あります", "ある"),
        ("でした。", "だった。"),
        ("でした", "だった"),
        ("ですので", "ため"),
        ("ですから", "から"),
        ("ですが", "だが"),
        ("です。", "だ。"),
        ("です", "だ"),
    )
    for old, new in pairs:
        t = t.replace(old, new)
    t = t.strip()
    return t if t else text


def _derive_char_min(char_max: Optional[int]) -> Optional[int]:
    if not char_max:
        return None
    return max(0, char_max - 10)


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
    if "職種・コース" in reason:
        return "なぜその職種・コースかが弱かったため、役割の理由を先頭で明示して再試行します。"
    if "設問の冒頭表現を繰り返さず" in reason:
        return "設問の言い換えから始まっていたため、結論だけを先頭で短く言い切って再試行します。"
    if "1文目で" in reason and "短く言い切って" in reason:
        return f"{reason} 先頭文だけで答えが伝わる構成にして再試行します。"
    if "断片的" in reason:
        return "断片的な本文になったため、1本の文章として再試行します。"
    return f"{reason} 再試行します。"


def _best_effort_rewrite_admissible(
    normalized_text: str,
    *,
    template_type: str,
    company_name: str | None,
    char_max: int | None,
    primary_failure_code: str,
) -> bool:
    """Return True if we may return best rejected rewrite instead of 422.

    Block empty output and fragment-only text.
    """
    if not (normalized_text or "").strip():
        return False
    if primary_failure_code in {"empty", "fragment"}:
        return False
    return True


def _rewrite_validation_degraded_hint(codes: list[str]) -> str:
    """degraded 採用時に、未解決の主要コードに応じた修正点を明示する。"""
    intro = (
        "厳密な品質チェックをすべて満たせませんでしたが、最も近い改善案を表示しています。"
    )
    action_by_code: dict[str, str] = {
        "style": (
            "提出前に、です・ます調を使わずだ・である調にそろえてください。"
        ),
        "under_min": (
            "提出前に、指定の最小字数を満たすよう、本文を足すか構成を調整してください。"
        ),
        "over_max": (
            "提出前に、指定の最大字数を超えないよう、重複や冗長な表現を削ってください。"
        ),
        "answer_focus": (
            "提出前に、冒頭の1〜2文で設問の答えの核がすぐ伝わるよう書き直してください。"
        ),
        "verbose_opening": (
            "提出前に、設問文の言い換えで始めず、結論から書き始めてください。"
        ),
        "bulletish_or_listlike": (
            "提出前に、箇条書きや番号列挙をやめ、つながった一段の本文にしてください。"
        ),
        "grounding": (
            "提出前に、企業や役割との接点が本文から伝わるよう、1文で結び直してください。"
        ),
        "generic": (
            "提出前に、文体（だ・である調）・指定字数・冒頭の結論の置き方を確認し、"
            "不足している点を直してください。"
        ),
    }
    if not codes:
        return intro + action_by_code["generic"]
    actions = [
        action_by_code.get(code, action_by_code["generic"])
        for code in _select_retry_codes(retry_code=codes[0], failure_codes=codes)
    ]
    return intro + " ".join(_dedupe_preserve_order(actions))


def _rewrite_validation_soft_hint(codes: list[str]) -> str:
    if not codes:
        return "一部条件を緩和して表示しています。提出前に文体と企業接続を確認してください。"

    if set(codes) == {"under_min"}:
        return "一部条件を緩和して表示しています。提出前に、指定字数に届いているか確認してください。"
    if set(codes) == {"style"}:
        return "一部条件を緩和して表示しています。提出前に、だ・である調へ統一してください。"
    if set(codes) == {"grounding"}:
        return "一部条件を緩和して表示しています。提出前に、企業や役割との接点を1文で補ってください。"
    return "一部条件を緩和して表示しています。提出前に文体・文字数・企業接続を確認してください。"


def _candidate_has_grounding_anchor(
    text: str,
    *,
    template_type: str,
    company_name: str | None,
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    company_evidence_cards: Optional[list[dict]] = None,
) -> bool:
    normalized = text or ""
    if grounding_mode == "none":
        return True

    company_terms = {
        "事業",
        "価値",
        "価値観",
        "方向性",
        "姿勢",
        "顧客",
        "社会",
        "現場",
        "変革",
        "成長",
        "挑戦",
    }
    for card in company_evidence_cards or []:
        for field in ("theme", "claim", "excerpt"):
            for token in re.findall(r"[一-龥ぁ-んァ-ヴー]{2,12}|[A-Za-z][A-Za-z0-9.+/-]{1,}", str(card.get(field) or "")):
                if len(token) >= 2:
                    company_terms.add(token)

    company_reference_present = bool(
        (company_name and company_name in normalized)
        or any(token in normalized for token in COMPANY_HONORIFIC_TOKENS)
    )
    company_term_present = any(token in normalized for token in company_terms)
    if not company_reference_present and not company_term_present:
        return False

    if grounding_mode != "role_grounded":
        return company_reference_present and company_term_present

    if template_type in {"role_course_reason", "post_join_goals"}:
        return bool(company_term_present and (
            _role_name_appears_in_text(role_name, normalized)
            or re.search(r"職種|コース|役割|業務|ポジション", normalized)
        ))
    if template_type in {"intern_reason", "intern_goals"}:
        return bool(company_term_present and (
            (intern_name and intern_name in normalized)
            or re.search(r"インターン|プログラム|実務|現場", normalized)
        ))
    return True


def _should_validate_grounding(
    *,
    template_type: str,
    question: str | None,
    effective_company_grounding_policy: str,
    grounding_mode: str,
) -> bool:
    if grounding_mode == "none":
        return False
    if effective_company_grounding_policy == "required":
        return True
    if effective_company_grounding_policy == "assistive":
        return _question_has_assistive_company_signal(
            template_type=template_type,
            question=question or "",
        )
    return False


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


COMPANY_HONORIFIC_TOKENS = ("貴社", "貴行", "貴庫", "貴所", "貴校", "貴院")
# 学生側の企業指称（社名が無くても「なぜこの会社か」が立つ表現）
COMPANY_REFERENCE_TOKENS = ("当社", "御社", "同社", "本社", "こちらの企業")
REPEATED_OPENING_PATTERNS: dict[str, str] = {
    "company_motivation": r"(志望する理由|志望理由)は",
    "intern_reason": r"(参加理由|志望理由)は",
    "intern_goals": r"(学びたいこと|やりたいこと)は",
    "gakuchika": r"(学生時代に力を入れたこと|学生時代に頑張ったこと)は",
    "role_course_reason": r"(選んだ理由|選択した理由|志望理由)は",
    "work_values": r"(大切にしている価値観|働くうえで大切にしていること)は",
    # 例: 「自己PRとして〜」「私の強みは〜」の設問言い換え開始
    "self_pr": r"(自己PR|自己ＰＲ)(?:として|で|は)|私の強みは|アピールしたいことは|自己紹介としては",
}

# 先頭ウィンドウで「答えの核」があるか（自然な言い出しを落とさないため広めに）
_SELF_PR_HEAD_FOCUS = (
    r"強み|長所|得意|アピール|特徴|資質|性格|スキル|信念|指針|軸|他者と(?:の)?違い|"
    r"差別化|強みとして|スキルとして|自分(?:自身)?(?:の)?|私(?:自身)?(?:の)?|"
    r"一つ(?:の)?|まず|最も"
)
_POST_JOIN_HEAD_FOCUS = (
    r"入社後|将来|キャリア|仕事|業務|職場|携わりたい|挑戦したい|担いたい|実現したい|貢献したい|"
    r"目標|手掛け|ビジネス|投資|事業機会|価値創出|獲得したい|極めたい|従事|取り組みたい|"
    r"身を置き|発揮したい|成し遂げ|やりたい|務めたい"
)
_WORK_VALUES_HEAD_FOCUS = (
    r"大切|重視|価値観|信念|軸|譲れない|譲りたくない|姿勢|こだわり|大事にしている|"
    r"考え方|モットー|指針|プライド|根底|念頭|秉|大切にしたい|尊重"
)
_GAKUCHIKA_HEAD_FOCUS = (
    r"力を入れ|頑張っ|取り組ん|経験|課題|行動|成果|学び|リーダー|役割|担当|主担当|"
    r"工夫|改善|達成|PDCA|チーム|サークル|ゼミ|研究|活動|最も"
)
_INTERN_REASON_HEAD_FOCUS = (
    r"参加|志望|理由|惹|魅力|学びたい|学びたく|身につけたい|得たい|挑戦したい|試したい|試し(?:ながら|て)|"
    r"実践したい|実践的|期待|関心|魅力を感|惹か|ふさわしい|最適|身を置きたい|触れたい|体感|機会|鍛え"
)
_INTERN_GOALS_HEAD_FOCUS = (
    r"学びたい|身につけたい|やりたい|獲得したい|高めたい|磨きたい|確かめたい|得たい|"
    r"習得したい|鍛えたい|深めたい|試したい|経験したい|積みたい|培いたい|伸ばしたい"
)


def _role_name_appears_in_text(role_name: str | None, haystack: str) -> bool:
    if not role_name:
        return False
    rn = re.sub(r"\s+", " ", role_name).strip()
    if not rn:
        return False
    if rn in haystack:
        return True
    for part in re.split(r"[/／・]+", rn):
        p = part.strip()
        if len(p) >= 2 and p in haystack:
            return True
    return False


def _split_candidate_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


def _validate_standard_conclusion_focus(
    text: str,
    *,
    template_type: str,
    company_name: str | None,
    role_name: str | None,
    intern_name: str | None,
) -> tuple[str | None, str | None]:
    sentences = _split_candidate_sentences(text)
    if not sentences:
        return "fragment", "本文が断片的です。文を最後まで言い切ってください。"

    first_sentence = sentences[0].strip()
    # 複数文のときだけ極端に短い先頭文をスキップ（1文完結の長文は下のテンプレ検証へ進める）
    if len(sentences) > 1:
        meaningful_chars = re.findall(r"[一-龥ぁ-んァ-ヶA-Za-z0-9]", first_sentence)
        if len(set(meaningful_chars)) <= 3:
            return None, None

    # 1文に圧縮した長文では「理由は…」が先頭に来るのが自然なため、verbose 検知は複数文に限定する
    repeated_pattern = REPEATED_OPENING_PATTERNS.get(template_type)
    if (
        len(sentences) > 1
        and repeated_pattern
        and re.search(repeated_pattern, first_sentence)
    ):
        return "verbose_opening", "設問の冒頭表現を繰り返さず、1文目で答えを短く言い切ってください。"

    if template_type == "company_motivation":
        # 先頭3文までで企業名/貴社と志望の軸を確認（研究・経験から入り3文目で企業に接続する出力を許容）
        head = "".join(sentences[:3])
        company_anchor_head = bool(
            (company_name and company_name in head)
            or any(token in head for token in COMPANY_HONORIFIC_TOKENS)
            or any(token in head for token in COMPANY_REFERENCE_TOKENS)
        )
        if not company_anchor_head or not re.search(
            r"志望|惹|魅力|理由|価値|からだ|ためだ|関心|期待|共感|惹か",
            head,
        ):
            return "answer_focus", "冒頭でなぜこの会社かを短く言い切ってください（企業名または貴社と志望の核を含む）。"
    elif template_type == "role_course_reason":
        head = "".join(sentences[:2])
        role_anchor_head = bool(
            _role_name_appears_in_text(role_name, head)
            or re.search(r"職種|コース|業務|役割|ポジション|ジョブ", head)
        )
        if not role_anchor_head or not re.search(
            r"志望|選ぶ|理由|関心|担いたい|携わりたい|適性|適合|惹か|魅力|期待|共感",
            head,
        ):
            return "answer_focus", "冒頭でなぜその職種・コースかを短く言い切ってください。"
    elif template_type == "intern_reason":
        head = "".join(sentences[:2])
        internship_named = bool(
            intern_name
            and re.search(r"インターン|internship", intern_name, re.IGNORECASE)
        )
        # 英語プログラム名だけの設問では「インターン」と書かず実務・課題に寄せる出力が多い
        has_intern_context = bool(
            (intern_name and intern_name in text)
            or re.search(r"インターン|プログラム|インターンシップ", head)
            or re.search(r"インターン|プログラム|インターンシップ", text)
            or (
                internship_named
                and re.search(r"実務|現場|課題|就業|体験", text)
            )
        )
        if not has_intern_context or not re.search(_INTERN_REASON_HEAD_FOCUS, head):
            return "answer_focus", "冒頭でなぜそのインターンに参加したいかを短く言い切ってください。"
    elif template_type == "intern_goals":
        # 英語プログラム名のみの設問では「インターン」が後段に出る／学習目的が3文目にまとまる出力もある
        head = "".join(sentences[:3])
        internship_named = bool(
            intern_name
            and re.search(r"インターン|internship", intern_name, re.IGNORECASE)
        )
        intern_anchor_head = bool(
            (intern_name and intern_name in head)
            or re.search(r"インターン|プログラム|インターンシップ", head)
            or (
                internship_named
                and re.search(
                    r"実務|現場|分析|学び|意思決定|優先|仮説|課題|顧客|価値",
                    head,
                )
            )
        )
        if not intern_anchor_head or not re.search(_INTERN_GOALS_HEAD_FOCUS, head):
            return "answer_focus", "冒頭でインターンで何を学びたいかを短く言い切ってください。"
    elif template_type == "post_join_goals":
        # 長文設問では経験→本題の2文目以降に「入社後」が出る出力も多いため先頭3文まで見る
        head = "".join(sentences[:3])
        if not re.search(_POST_JOIN_HEAD_FOCUS, head):
            return "answer_focus", "冒頭で入社後にやりたいことや手掛けたいことを短く言い切ってください。"
    elif template_type == "self_pr":
        # 経験→強みの導入や多様な言い出しを先頭2文までで許容（例:「サークルで〜。この経験から強みは〜」）
        head = "".join(sentences[:2])
        if not re.search(_SELF_PR_HEAD_FOCUS, head):
            return "answer_focus", "冒頭で自分の強みやアピールの核を短く示してください。"
    elif template_type == "work_values":
        head = "".join(sentences[:2])
        if not re.search(_WORK_VALUES_HEAD_FOCUS, head):
            return "answer_focus", "冒頭で大切にしている価値観や姿勢の核を短く示してください。"
    elif template_type == "gakuchika":
        # 行動・成果の核を先頭3文までで確認（verbose_opening は上で処理済み）
        head = "".join(sentences[:3])
        if not re.search(_GAKUCHIKA_HEAD_FOCUS, head):
            return "answer_focus", "冒頭で学生時代に力を入れた取り組みの核を短く示してください。"

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
                "same_company_verified": bool(source.get("same_company_verified", True)),
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
    cards = [
        card
        for card in (company_evidence_cards or [])
        if bool(card.get("same_company_verified", True))
    ]
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


def _should_fetch_company_rag_for_template(
    template_type: str,
    *,
    assistive_company_signal: bool,
) -> bool:
    if _company_grounding_is_required(template_type):
        return True
    return assistive_company_signal


def _template_source_family_priority_name(template_type: str) -> str | None:
    if template_type in {"self_pr", "gakuchika", "work_values", "basic"}:
        return "assistive_people_values"
    if template_type in TEMPLATE_SOURCE_FAMILY_PRIORITIES:
        return template_type
    return None


def _build_template_content_type_boosts(
    template_type: str,
    *,
    assistive_company_signal: bool,
) -> dict[str, float]:
    if template_type in {"self_pr", "gakuchika", "work_values", "basic"}:
        if not assistive_company_signal:
            return {}
        families = ("people_values",)
    else:
        families = TEMPLATE_SOURCE_FAMILY_PRIORITIES.get(template_type, ())

    if not families:
        return {}

    family_weights = {families[0]: SOURCE_BOOST_HIGH}
    if len(families) >= 2:
        family_weights[families[1]] = SOURCE_BOOST_MEDIUM
    if len(families) >= 3:
        family_weights[families[2]] = SOURCE_BOOST_LOW

    boosts: dict[str, float] = {}
    for family_types in SOURCE_FAMILY_CONTENT_TYPES.values():
        for content_type in family_types:
            boosts[content_type] = SOURCE_BOOST_DISABLED

    for family_name, weight in family_weights.items():
        for content_type in SOURCE_FAMILY_CONTENT_TYPES[family_name]:
            boosts[content_type] = max(boosts.get(content_type, SOURCE_BOOST_DISABLED), weight)

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


def _capture_rewrite_debug_enabled() -> bool:
    return os.getenv("LIVE_ES_REVIEW_CAPTURE_DEBUG", "").strip() == "1"


def _append_rewrite_attempt_trace(
    trace: list[dict[str, Any]],
    *,
    stage: str,
    text: str,
    accepted: bool,
    retry_reason: str = "",
    attempt_index: int = 0,
    total_rewrite_attempts: int = 0,
    prompt_mode: str = "",
    prompt_modes: list[str] | None = None,
    failure_codes: list[str] | None = None,
    fix_pass: int = 0,
    length_fix_total: int = 0,
) -> None:
    if not _capture_rewrite_debug_enabled():
        return
    row: dict[str, Any] = {
        "stage": stage,
        "accepted": accepted,
        "char_count": len(text or ""),
        "text": text or "",
    }
    if retry_reason:
        row["retry_reason"] = retry_reason
    if attempt_index:
        row["attempt_index"] = attempt_index
    if total_rewrite_attempts:
        row["total_rewrite_attempts"] = total_rewrite_attempts
    if prompt_mode:
        row["prompt_mode"] = prompt_mode
    if prompt_modes:
        row["prompt_modes"] = list(prompt_modes)
    if failure_codes:
        row["failure_codes"] = list(failure_codes)
    if fix_pass:
        row["fix_pass"] = fix_pass
    if length_fix_total:
        row["length_fix_total"] = length_fix_total
    trace.append(row)


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
    rewrite_generation_mode: str = "normal",
    rewrite_attempt_count: int = 0,
    reference_es_count: int = 0,
    reference_quality_profile_used: bool = False,
    reference_outline_used: bool = False,
    reference_hint_count: int = 0,
    reference_conditional_hints_applied: bool = False,
    reference_profile_variance: str | None = None,
    company_grounding_policy: str = "assistive",
    effective_company_grounding_policy: str = "assistive",
    company_evidence_count: int = 0,
    company_evidence_verified_count: int = 0,
    company_evidence_rejected_count: int = 0,
    company_grounding_safety_applied: bool = False,
    evidence_coverage_level: str = "none",
    weak_evidence_notice: bool = False,
    length_policy: str = "strict",
    length_shortfall: int = 0,
    soft_min_floor_ratio: float | None = None,
    length_fix_attempted: bool = False,
    length_fix_result: str = "not_needed",
    token_usage: Optional[ReviewTokenUsage] = None,
    rewrite_validation_status: str = "strict_ok",
    rewrite_validation_codes: list[str] | None = None,
    rewrite_validation_user_hint: str | None = None,
    length_profile_id: str | None = None,
    target_window_lower: int | None = None,
    target_window_upper: int | None = None,
    source_fill_ratio: float | None = None,
    required_growth: int = 0,
    latest_failed_length: int = 0,
    length_failure_code: str | None = None,
    retrieval_profile_name: str | None = None,
    priority_source_match_count: int = 0,
    rewrite_rejection_reasons: list[str] | None = None,
    rewrite_attempt_trace: list[dict[str, Any]] | None = None,
    rewrite_total_rewrite_attempts: int = 0,
) -> ReviewMeta:
    template_request = request.template_request
    role_context = request.role_context or RoleContext()
    return ReviewMeta(
        llm_provider=llm_provider,
        llm_model=llm_model,
        llm_model_alias=request.llm_model,
        review_variant=review_variant,
        grounding_mode=grounding_mode,
        primary_role=role_context.primary_role or (template_request.role_name if template_request else None),
        role_source=role_context.source,
        triggered_enrichment=triggered_enrichment,
        enrichment_completed=enrichment_completed,
        enrichment_sources_added=enrichment_sources_added,
        reference_es_count=reference_es_count,
        reference_es_mode="quality_profile_only",
        reference_quality_profile_used=reference_quality_profile_used,
        reference_outline_used=reference_outline_used,
        reference_hint_count=reference_hint_count,
        reference_conditional_hints_applied=reference_conditional_hints_applied,
        reference_profile_variance=reference_profile_variance,
        company_grounding_policy=company_grounding_policy,
        effective_company_grounding_policy=effective_company_grounding_policy,
        company_evidence_count=company_evidence_count,
        company_evidence_verified_count=company_evidence_verified_count,
        company_evidence_rejected_count=company_evidence_rejected_count,
        company_grounding_safety_applied=company_grounding_safety_applied,
        evidence_coverage_level=evidence_coverage_level,
        weak_evidence_notice=weak_evidence_notice,
        injection_risk=injection_risk,
        user_context_sources=_collect_user_context_sources(request),
        hallucination_guard_mode="strict",
        rewrite_generation_mode=rewrite_generation_mode,
        rewrite_attempt_count=rewrite_attempt_count,
        length_policy=length_policy,
        length_shortfall=length_shortfall,
        soft_min_floor_ratio=soft_min_floor_ratio,
        length_fix_attempted=length_fix_attempted,
        length_fix_result=length_fix_result,
        rewrite_validation_status=rewrite_validation_status,
        rewrite_validation_codes=list(rewrite_validation_codes or []),
        rewrite_validation_user_hint=rewrite_validation_user_hint,
        length_profile_id=length_profile_id,
        target_window_lower=target_window_lower,
        target_window_upper=target_window_upper,
        source_fill_ratio=source_fill_ratio,
        required_growth=required_growth,
        latest_failed_length=latest_failed_length,
        length_failure_code=length_failure_code,
        retrieval_profile_name=retrieval_profile_name,
        priority_source_match_count=priority_source_match_count,
        token_usage=token_usage,
        rewrite_rejection_reasons=list(rewrite_rejection_reasons or []),
        rewrite_attempt_trace=list(rewrite_attempt_trace or []),
        rewrite_total_rewrite_attempts=rewrite_total_rewrite_attempts,
    )


def _empty_review_token_usage() -> ReviewTokenUsage:
    return ReviewTokenUsage()


def _accumulate_review_token_usage(
    totals: ReviewTokenUsage,
    result: Any,
    *,
    call_kind: str,
) -> None:
    usage = getattr(result, "usage", None)
    if not isinstance(usage, dict):
        return

    totals.input_tokens += int(usage.get("input_tokens") or 0)
    totals.output_tokens += int(usage.get("output_tokens") or 0)
    totals.reasoning_tokens += int(usage.get("reasoning_tokens") or 0)
    totals.cached_input_tokens += int(usage.get("cached_input_tokens") or 0)
    totals.llm_call_count += 1
    if call_kind == "structured":
        totals.structured_call_count += 1
    elif call_kind == "text":
        totals.text_call_count += 1


def _maybe_review_token_usage(totals: ReviewTokenUsage) -> Optional[ReviewTokenUsage]:
    return totals if totals.llm_call_count > 0 else None


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


def _build_user_context_template_sources(request: ReviewRequest) -> list[TemplateSource]:
    """Non-URL citation cards for user-provided context included in this review request."""
    sources: list[TemplateSource] = []

    if request.profile_context:
        p = request.profile_context
        bits: list[str] = []
        if p.university:
            bits.append(p.university)
        if p.faculty:
            bits.append(p.faculty)
        if p.graduation_year is not None:
            bits.append(f"{p.graduation_year}年卒")
        if p.target_industries:
            bits.append("志望業界: " + "・".join(p.target_industries[:4]))
        if p.target_job_types:
            bits.append("志望職種: " + "・".join(p.target_job_types[:4]))
        excerpt = " ".join(bits).strip()[:220] or "プロフィール項目を添削コンテキストに含めています。"
        sources.append(
            TemplateSource(
                source_id="user:profile",
                source_url="/profile",
                content_type="user_profile",
                content_type_label="ユーザー情報",
                title="プロフィール（就活Pass）",
                domain=None,
                excerpt=excerpt,
            )
        )

    if request.gakuchika_context:
        titles = [item.title.strip() for item in request.gakuchika_context if item.title.strip()]
        preview = "、".join(titles[:4])
        if len(titles) > 4:
            preview += " ほか"
        excerpt = (
            f"{len(request.gakuchika_context)}件のガクチカ要約・素材を参照しました。"
            + (f" タイトル例: {preview}" if preview else "")
        )[:260]
        sources.append(
            TemplateSource(
                source_id="user:gakuchika",
                source_url="/gakuchika",
                content_type="user_gakuchika",
                content_type_label="ユーザー情報",
                title="ガクチカ（就活Pass）",
                domain=None,
                excerpt=excerpt,
            )
        )

    if request.document_context and request.document_context.other_sections:
        other = request.document_context.other_sections
        titles = [s.title.strip() for s in other if s.title.strip()]
        head = "、".join(titles[:5])
        if len(titles) > 5:
            head += " ほか"
        excerpt = f"同一ESの他設問 {len(other)} 件を参照しました。" + (f" {head}" if head else "")
        excerpt = excerpt.strip()[:260]
        doc_path = f"/es/{request.document_id}" if request.document_id else ""
        sources.append(
            TemplateSource(
                source_id="user:document_sections",
                source_url=doc_path,
                content_type="user_document",
                content_type_label="ユーザー情報",
                title="同一ESの他設問（就活Pass）",
                domain=None,
                excerpt=excerpt,
            )
        )

    return sources


EMPLOYEE_INTERVIEW_EVIDENCE_POSITIVE_SIGNALS = {
    "interview",
    "voice",
    "people",
    "person",
    "member",
    "members",
    "staff",
    "story",
    "talk",
    "社員紹介",
    "社員インタビュー",
    "社員の声",
    "先輩社員",
    "働く人",
    "人を知る",
    "人を読む",
}
EMPLOYEE_INTERVIEW_EVIDENCE_NEGATIVE_SIGNALS = {
    "investor",
    "investors",
    "ir",
    "financial",
    "earnings",
    "results",
    "governance",
    "integrated",
    "統合報告",
    "決算",
    "株主",
    "投資家",
    "有価証券",
    "企業データ",
    "会社概要",
    "企業概要",
    "company data",
    "company overview",
}


def _company_source_text(source: dict[str, Any]) -> str:
    return " ".join(
        str(source.get(key) or "").lower()
        for key in ("source_url", "title", "excerpt", "heading", "heading_path")
    )


def _filter_verified_company_rag_sources(
    rag_sources: list[dict],
    *,
    company_name: str | None,
) -> tuple[list[dict], list[dict], bool]:
    if not company_name:
        return list(rag_sources), [], False

    verified_sources: list[dict] = []
    rejected_sources: list[dict] = []
    has_mismatched_company_sources = False

    for source in rag_sources:
        enriched = dict(source)
        source_url = str(source.get("source_url") or "")
        content_type = str(source.get("content_type") or "")
        reason: str | None = None

        if not source_url:
            reason = "source_url_missing"
        else:
            relation = classify_company_domain_relation(source_url, company_name, content_type)
            enriched["domain_relation"] = relation
            enriched["domain"] = source.get("domain") or _extract_domain(source_url)
            if not relation.get("is_official"):
                has_mismatched_company_sources = True
                reason = "same_company_unverified"

        if not reason and content_type == "employee_interviews":
            haystack = _company_source_text(enriched)
            path = urlparse(source_url).path.rstrip("/").lower() if source_url else ""
            if not path:
                reason = "employee_root_page"
            elif any(signal in haystack for signal in EMPLOYEE_INTERVIEW_EVIDENCE_NEGATIVE_SIGNALS):
                reason = "employee_wrong_topic"
            elif not any(signal in haystack for signal in EMPLOYEE_INTERVIEW_EVIDENCE_POSITIVE_SIGNALS):
                reason = "employee_signal_missing"

        enriched["same_company_verified"] = reason is None
        enriched["validation_reason"] = reason or "verified"
        if reason is None:
            verified_sources.append(enriched)
        else:
            rejected_sources.append(enriched)

    return verified_sources, rejected_sources, has_mismatched_company_sources


def _build_template_review_response(
    template_type: str,
    rewrite_text: str,
    rag_sources: list[dict],
    *,
    request: ReviewRequest | None = None,
) -> TemplateReview:
    company_sources = _build_keyword_sources(rag_sources)
    user_sources = _build_user_context_template_sources(request) if request else []
    keyword_sources = [*user_sources, *company_sources]
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


def _format_issue_log_lines(issues: list[Issue]) -> str:
    if not issues:
        return "  (none)"
    return "\n".join(
        f"  {index}. [{issue.category}] issue={issue.issue} / suggestion={issue.suggestion}"
        for index, issue in enumerate(issues, start=1)
    )


def _format_evidence_card_log_lines(cards: list[dict[str, Any]]) -> str:
    if not cards:
        return "  (none)"
    lines: list[str] = []
    for index, card in enumerate(cards, start=1):
        source_title = str(card.get("source_title") or card.get("title") or "-")
        source_url = str(card.get("source_url") or "-")
        lines.append(
            "  "
            + f"{index}. theme={card.get('theme', '-')}"
            + f" / claim={card.get('claim', '-')}"
            + f" / verified={card.get('same_company_verified', True)}"
            + f" / source={source_title}"
            + f" / url={source_url}"
        )
    return "\n".join(lines)


def _format_rejected_source_log_lines(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "  (none)"
    return "\n".join(
        "  "
        + f"{index}. reason={source.get('validation_reason', '-')}"
        + f" / type={source.get('content_type', '-')}"
        + f" / title={source.get('title', '-')}"
        + f" / url={source.get('source_url', '-')}"
        for index, source in enumerate(sources, start=1)
    )


def _format_source_log_lines(sources: list[TemplateSource]) -> str:
    if not sources:
        return "  (none)"
    return "\n".join(
        "  "
        + f"{index}. [{source.content_type_label or source.content_type}] "
        + f"title={source.title or '-'} / domain={source.domain or '-'} / url={source.source_url or '-'}"
        for index, source in enumerate(sources, start=1)
    )


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
    length_control_mode: str = "default",
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
    compact_mode = timeout_compact_mode or simplified_mode or attempt >= 2
    preserve_context_for_recovery = length_control_mode == "under_min_recovery"
    preserve_required_context = company_grounding == "required" and not short_answer_mode

    if preserve_context_for_recovery:
        fact_limit = PROMPT_USER_FACT_LIMIT
    elif short_answer_mode:
        fact_limit = 4
    elif simplified_mode:
        fact_limit = 5
    elif compact_mode:
        fact_limit = 6
    else:
        fact_limit = PROMPT_USER_FACT_LIMIT
    if compact_mode:
        fact_limit = max(4, fact_limit)

    issue_limit = 3 if preserve_context_for_recovery else (2 if compact_mode else 3)
    if preserve_context_for_recovery:
        card_limit = min(4, len(company_evidence_cards))
    elif company_grounding == "assistive":
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
    elif preserve_required_context and compact_mode:
        card_limit = min(2, len(company_evidence_cards))
    elif compact_mode:
        card_limit = 2
    else:
        card_limit = 3

    include_reference_quality = (
        bool(reference_quality_block)
        and not short_answer_mode
        and (char_max is None or char_max >= 260)
        and (
            attempt == 0
            or preserve_context_for_recovery
            or (simplified_mode and preserve_required_context)
        )
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
    *,
    stage: str = "default",
) -> str:
    if char_min and char_max:
        gap = 3 if stage == "under_min_recovery" else 5
        target_lower = max(char_min, char_max - gap)
        target_upper = char_max
        return f"{target_lower}〜{target_upper}字"
    if char_max:
        gap = 3 if stage == "under_min_recovery" else 5
        return f"{max(0, char_max - gap)}〜{char_max}字"
    if char_min:
        return f"{char_min}字以上"
    return "指定文字数付近"


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _retry_hint_from_code(
    code: str,
    *,
    char_min: int | None,
    char_max: int | None,
    current_length: int | None = None,
    length_control_mode: str = "default",
) -> str:
    target_stage = (
        "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    )
    target_hint = _format_target_char_hint(char_min, char_max, stage=target_stage)
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
        if char_min and current_length:
            return (
                f"現状{current_length}字。最低{char_min}字まであと{shortfall}字以上足す。"
                f"新事実は足さず、元回答の経験・接続を1〜2文で補い {target_hint} を満たす"
            )
    mapping = {
        "empty": "改善案本文を必ず1件だけ返す",
        "under_min": f"内容を薄めず {target_hint} を狙う",
        "over_max": f"冗長語を削り {target_hint} に収める",
        "style": "です・ます調を使わず、だ・である調に統一する",
        "answer_focus": (
            "1文目で設問への答えを短く言い切る（インターンなら参加・学びの核、"
            "コース志望なら志望・関心の語を含める）"
        ),
        "verbose_opening": "設問の言い換えから始めず、1文目は結論だけを短く置く",
        "fragment": "本文を断片で終わらせず、最後まで言い切る",
        "bulletish_or_listlike": "箇条書きや列挙ではなく、1本の本文にする",
        "generic": "条件を満たす安全な改善案を返す",
    }
    return mapping.get(code, mapping["generic"])


def _select_retry_codes(*, retry_code: str, failure_codes: list[str] | None = None) -> list[str]:
    raw_codes = _dedupe_preserve_order(([retry_code] if retry_code else []) + list(failure_codes or []))
    if not raw_codes:
        return ["generic"]

    length_codes = [code for code in raw_codes if code in {"under_min", "over_max"}]
    other_codes = [code for code in raw_codes if code not in {"under_min", "over_max"}]

    selected: list[str] = []
    if length_codes:
        selected.append(length_codes[0])
    selected.extend(other_codes[: max(0, 2 - len(selected))])
    if not selected:
        selected.append(raw_codes[0])
    return _dedupe_preserve_order(selected)


def _retry_hints_from_codes(
    *,
    retry_code: str,
    failure_codes: list[str] | None,
    char_min: int | None,
    char_max: int | None,
    current_length: int | None = None,
    length_control_mode: str = "default",
) -> list[str]:
    return [
        _retry_hint_from_code(
            code,
            char_min=char_min,
            char_max=char_max,
            current_length=current_length,
            length_control_mode=length_control_mode,
        )
        for code in _select_retry_codes(
            retry_code=retry_code,
            failure_codes=failure_codes,
        )
    ]


def _resolve_rewrite_focus_mode(*, retry_code: str) -> str:
    mapping = {
        "under_min": "length_focus_min",
        "over_max": "length_focus_max",
        "style": "style_focus",
        "grounding": "grounding_focus",
        "answer_focus": "answer_focus",
        "verbose_opening": "opening_focus",
        "bulletish_or_listlike": "structure_focus",
        "empty": "structure_focus",
        "fragment": "structure_focus",
        "generic": "structure_focus",
    }
    return mapping.get(retry_code or "generic", "structure_focus")


def _resolve_rewrite_focus_modes(*, retry_code: str, failure_codes: list[str] | None = None) -> list[str]:
    selected_codes = _select_retry_codes(retry_code=retry_code, failure_codes=failure_codes)
    modes = [
        _resolve_rewrite_focus_mode(retry_code=code)
        for code in selected_codes
    ]
    return _dedupe_preserve_order(modes or [_resolve_rewrite_focus_mode(retry_code=retry_code)])


def _serialize_focus_modes(focus_modes: list[str] | None) -> str:
    unique_modes = _dedupe_preserve_order(list(focus_modes or []))
    if not unique_modes:
        return "normal"
    if unique_modes == ["normal"]:
        return "normal"
    return "+".join(unique_modes)


def _uses_tight_length_control(
    *,
    template_type: str,
    char_min: int | None,
    char_max: int | None,
    review_variant: str,
) -> bool:
    if not char_min or not char_max:
        return False
    _ = review_variant
    if template_type in TIGHT_LENGTH_TEMPLATES and 300 <= char_max <= 500:
        return True
    if char_max <= SHORT_ANSWER_CHAR_MAX and char_min >= 120:
        return True
    if template_type in TIGHT_LENGTH_TEMPLATES and 140 <= char_min and char_max <= 260:
        return True
    return False


def _resolve_rewrite_length_control_mode(
    *,
    use_tight_length_control: bool,
    focus_mode: str,
) -> str:
    if not use_tight_length_control:
        return "default"
    if focus_mode == "length_focus_min":
        return "under_min_recovery"
    if focus_mode == "length_focus_max":
        return "tight_length"
    return "tight_length"


def _length_profile_stage_from_mode(length_control_mode: str) -> str:
    if length_control_mode == "under_min_recovery":
        return "under_min_recovery"
    if length_control_mode == "tight_length":
        return "tight_length"
    return "default"


def _should_short_circuit_to_length_fix(
    *,
    retry_code: str,
    current_length: int,
    last_under_min_length: int | None,
    attempt_number: int,
    llm_model: str | None,
    char_min: int | None,
    char_max: int | None,
    rewrite_source_answer: str,
) -> bool:
    if retry_code != "under_min":
        return False
    profile = resolve_length_control_profile(
        char_min,
        char_max,
        stage="under_min_recovery",
        original_len=len(rewrite_source_answer or ""),
        llm_model=llm_model,
        latest_failed_len=current_length,
    )
    if attempt_number < profile.early_length_fix_after_attempt:
        return False
    if last_under_min_length is None:
        return False
    return (current_length - last_under_min_length) < 4


def _soft_min_shortfall(
    text: str,
    *,
    char_min: int | None,
    char_max: int | None,
    final_attempt: bool = False,
) -> int:
    if not char_min or not char_max:
        return 0
    shortfall = char_min - len(text)
    if shortfall <= 0:
        return 0
    if not final_attempt:
        return 0
    floor = math.ceil(char_max * FINAL_SOFT_MIN_FLOOR_RATIO)
    if len(text) < floor:
        return 0
    return shortfall


def _es_review_temperature(
    llm_model: str | None,
    *,
    stage: str,
    focus_mode: str = "normal",
    use_tight_length_control: bool = False,
    length_control_mode: str = "default",
    simplified_mode: bool = False,
) -> float:
    _ = (use_tight_length_control, length_control_mode, simplified_mode)
    provider, model_name = resolve_feature_model_metadata("es_review", llm_model)
    if provider == "google":
        return 1.0
    if stage == "improvement":
        return 0.15
    if stage == "length_fix":
        return 0.08
    if focus_mode in {"length_focus_min", "length_focus_max"}:
        return 0.11
    if focus_mode != "normal":
        return 0.14
    mid = (model_name or "").strip().lower()
    if provider == "openai" and "mini" in mid:
        return 0.16
    return 0.2


def _should_attempt_length_fix(
    text: str,
    *,
    char_min: int | None,
    char_max: int | None,
    use_tight_length_control: bool = False,
    primary_failure_code: str = "generic",
    failure_codes: list[str] | None = None,
) -> bool:
    normalized = _normalize_repaired_text(text)
    if not normalized:
        return False
    failure_code_set = set(failure_codes or ([primary_failure_code] if primary_failure_code else []))
    if failure_code_set & {"bulletish_or_listlike", "empty", "fragment"}:
        return False
    if failure_code_set & {"style", "grounding"}:
        return True
    if char_max and len(normalized) > char_max:
        limit = (
            TIGHT_LENGTH_FIX_DELTA_LIMIT
            if use_tight_length_control
            else LENGTH_FIX_DELTA_LIMIT
        )
        return (len(normalized) - char_max) <= limit
    if char_min and len(normalized) < char_min:
        # under_min は本文が短すぎるケースが多く、タイト制御でも広めに length-fix する
        return (char_min - len(normalized)) <= LENGTH_FIX_UNDER_MIN_GAP_LIMIT
    return False


def _rewrite_max_tokens(
    char_max: int | None,
    *,
    length_fix_mode: bool = False,
    timeout_compact_mode: bool = False,
    review_variant: str = "standard",
    llm_model: str | None = None,
) -> int:
    if length_fix_mode:
        base = min(420, max(220, int((char_max or 400) * 0.95)))
    else:
        base = min(720, max(260, int((char_max or 500) * 1.4)))
        mid = (llm_model or "").strip().lower()
        if "gpt-5" in mid and "mini" in mid and (char_max or 0) >= 170:
            base = min(720, int(base * 1.12))
    base = _openai_es_review_output_cap(base, llm_model)
    provider, _ = resolve_feature_model_metadata("es_review", llm_model)
    if provider == "google" and not length_fix_mode and (char_max or 0) >= 300:
        # 長文で出力が短く切れるケース向けに余裕を持たせる（呼び出し回数は増やさない）
        base = max(base, min(2048, int((char_max or 400) * 1.65)))
    return base


def _openai_es_review_output_cap(base: int, llm_model: str | None) -> int:
    """Raise output token ceiling for OpenAI reasoning models (Responses API)."""
    provider, model_name = resolve_feature_model_metadata("es_review", llm_model)
    if provider != "openai":
        return base
    mid = model_name.strip().lower()
    if not (mid.startswith("gpt-5") or mid.startswith("o")):
        return base
    return max(base, _OPENAI_ES_REVIEW_OUTPUT_TOKEN_FLOOR)


def _total_rewrite_attempts(review_variant: str) -> int:
    _ = review_variant
    return REWRITE_MAX_ATTEMPTS


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
    intern_name: str | None = None,
    grounding_mode: str,
    effective_company_grounding_policy: str = "assistive",
    company_evidence_cards: Optional[list[dict]] = None,
    review_variant: str = "standard",
    soft_validation_mode: str = "strict",
    allow_soft_min: bool | None = None,
) -> tuple[str | None, str, str, dict[str, Any]]:
    if allow_soft_min is not None and soft_validation_mode == "strict":
        soft_validation_mode = "final_soft" if allow_soft_min else "strict"
    normalized = _normalize_repaired_text(candidate)
    if not normalized:
        return None, "empty", "改善案が空でした。本文を必ず返してください。", {}

    style_invalid = "です" in normalized or "ます" in normalized
    bulletish_invalid = bool(
        "\n" in normalized and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", normalized)
    )
    focus_code, focus_reason = _validate_standard_conclusion_focus(
        normalized,
        template_type=template_type,
        company_name=company_name,
        role_name=role_name,
        intern_name=intern_name,
    )
    fitted = _fit_rewrite_text_deterministically(
        normalized,
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        issues=issues,
        role_name=role_name,
        grounding_mode=grounding_mode,
        company_evidence_cards=company_evidence_cards,
    )
    length_meta = {"length_policy": "strict", "length_shortfall": 0}
    primary_length_code: str | None = None
    if not fitted:
        _, limit_reason = _is_within_char_limits(normalized, char_min, char_max)
        shortfall = _soft_min_shortfall(
            normalized,
            char_min=char_min,
            char_max=char_max,
            final_attempt=soft_validation_mode == "final_soft",
        )
        if shortfall:
            fitted = normalized
            length_meta = {
                "length_policy": "soft_ok",
                "length_shortfall": shortfall,
                "soft_min_floor_ratio": FINAL_SOFT_MIN_FLOOR_RATIO,
            }
        else:
            retry_code = "under_min" if limit_reason.startswith("under_min") else "over_max"
            primary_length_code = retry_code
            fitted = normalized

    if "です" in fitted or "ます" in fitted:
        style_invalid = True

    if "\n" in fitted and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", fitted):
        bulletish_invalid = True

    focus_code, focus_reason = _validate_standard_conclusion_focus(
        fitted,
        template_type=template_type,
        company_name=company_name,
        role_name=role_name,
        intern_name=intern_name,
    )

    grounding_invalid = False
    if _should_validate_grounding(
        template_type=template_type,
        question=question,
        effective_company_grounding_policy=effective_company_grounding_policy,
        grounding_mode=grounding_mode,
    ):
        grounding_invalid = not _candidate_has_grounding_anchor(
            fitted,
            template_type=template_type,
            company_name=company_name,
            role_name=role_name,
            intern_name=intern_name,
            grounding_mode=grounding_mode,
            company_evidence_cards=company_evidence_cards,
        )

    failure_codes: list[str] = []
    failure_reason = "条件を満たしていません。"
    if style_invalid:
        failure_codes.append("style")
        failure_reason = "です・ます調が混在しています。だ・である調に統一してください。"
    if bulletish_invalid:
        failure_codes.append("bulletish_or_listlike")
        failure_reason = "箇条書きや列挙ではなく、1本の本文にしてください。"
    if focus_code:
        failure_codes.append(focus_code)
        failure_reason = focus_reason or "設問への適合が不足しています。"
    if grounding_invalid:
        failure_codes.append("grounding")
        failure_reason = "企業や役割との接点が本文から十分に伝わっていません。"
    if primary_length_code:
        failure_codes.append(primary_length_code)
        if len(failure_codes) == 1:
            failure_reason = (
                "文字数制約を満たしていません。"
                f" 現在{len(normalized)}字で、条件は "
                f"{'under_min' if primary_length_code == 'under_min' else 'over_max'} です。"
            )

    if failure_codes:
        if soft_validation_mode == "final_soft":
            blocked = {"bulletish_or_listlike", "empty", "fragment"}
            if not (set(failure_codes) & blocked):
                if set(failure_codes) == {"under_min"} and length_meta["length_policy"] != "strict":
                    return fitted, "soft_ok", "ok", length_meta
                allowed_soft_codes = {"style", "grounding"}
                if set(failure_codes).issubset(allowed_soft_codes):
                    meta = dict(length_meta)
                    meta["soft_validation_applied"] = True
                    meta["soft_validation_codes"] = sorted(set(failure_codes))
                    return fitted, "soft_ok", "ok", meta
        return None, failure_codes[0], failure_reason, {"failure_codes": failure_codes}

    result_code = "soft_ok" if length_meta["length_policy"] != "strict" else "ok"
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
    """Review a single ES section with a rewrite-only pipeline."""
    _ = json_caller
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

    # Character limits
    char_min = template_request.char_min
    char_max = template_request.char_max

    allowed_user_facts = _build_allowed_user_facts(request)
    logger.info(
        "[ES添削/テンプレート] user facts: count=%s sources=%s",
        len(allowed_user_facts),
        _collect_user_context_sources(request),
    )
    generic_role_mode = _is_generic_role_label(effective_role_name)
    user_priority_urls = {url for url in request.user_provided_corporate_urls if url}
    prompt_user_facts = _select_prompt_user_facts(
        allowed_user_facts,
        template_type=template_type,
        question=template_request.question,
        answer=template_request.answer,
        role_name=effective_role_name,
        intern_name=template_request.intern_name,
        company_name=template_request.company_name,
    )
    verified_rag_sources, rejected_rag_sources, has_mismatched_company_sources = (
        _filter_verified_company_rag_sources(
            rag_sources,
            company_name=template_request.company_name,
        )
    )
    effective_company_rag_available = company_rag_available and bool(verified_rag_sources)
    effective_grounding_mode = grounding_mode
    effective_company_grounding = company_grounding
    if has_mismatched_company_sources:
        effective_company_grounding = "assistive"
        effective_grounding_mode = "company_general" if verified_rag_sources else "none"
    company_evidence_cards = _build_company_evidence_cards(
        verified_rag_sources,
        template_type=template_type,
        question=template_request.question,
        answer=template_request.answer,
        role_name=effective_role_name,
        intern_name=template_request.intern_name,
        grounding_mode=effective_grounding_mode,
        user_priority_urls=user_priority_urls,
    )
    evidence_coverage_level, weak_evidence_notice = _assess_company_evidence_coverage(
        template_type=template_type,
        role_name=effective_role_name,
        company_rag_available=effective_company_rag_available,
        company_evidence_cards=company_evidence_cards,
        grounding_mode=effective_grounding_mode,
    )
    prompt_company_evidence_cards = company_evidence_cards
    reference_examples = load_reference_examples(
        template_type,
        char_max=char_max,
        company_name=template_request.company_name,
        max_items=3,
    )
    reference_quality_profile = build_reference_quality_profile(
        template_type,
        char_max=char_max,
        company_name=template_request.company_name,
        current_answer=template_request.answer,
    )
    reference_quality_block = build_reference_quality_block(
        template_type,
        char_max=char_max,
        company_name=template_request.company_name,
        current_answer=template_request.answer,
    )
    reference_outline_used = "【参考ESから抽出した骨子】" in reference_quality_block
    logger.info(
        "[ES添削/テンプレート] prompt context: selected_user_facts=%s company_evidence_cards=%s reference_examples=%s evidence_coverage=%s company_grounding=%s effective_grounding=%s safety_applied=%s",
        len(prompt_user_facts),
        len(prompt_company_evidence_cards),
        len(reference_examples),
        evidence_coverage_level,
        effective_company_grounding,
        effective_grounding_mode,
        has_mismatched_company_sources,
    )
    logger.info(
        "[ES添削/テンプレート] evidence cards:\n%s",
        _format_evidence_card_log_lines(prompt_company_evidence_cards),
    )
    logger.info(
        "[ES添削/テンプレート] rejected evidence:\n%s",
        _format_rejected_source_log_lines(rejected_rag_sources),
    )
    review_token_usage = _empty_review_token_usage()
    improvement_payload: list[dict[str, Any]] = []

    final_rewrite = ""
    retry_reason = ""
    retry_code = "generic"
    attempt_failures: list[str] = []
    rewrite_attempt_trace: list[dict[str, Any]] = []
    rewrite_generation_mode = "normal"
    rewrite_validation_status = "strict_ok"
    rewrite_validation_codes: list[str] = []
    rewrite_validation_user_hint: str | None = None
    accepted_attempt = 0
    accepted_length_policy = "strict"
    accepted_length_shortfall = 0
    accepted_soft_min_floor_ratio: float | None = None
    accepted_length_profile_id: str | None = None
    accepted_target_window_lower: int | None = None
    accepted_target_window_upper: int | None = None
    accepted_source_fill_ratio: float | None = None
    accepted_required_growth = 0
    accepted_latest_failed_length = 0
    accepted_length_failure_code: str | None = None
    retrieval_profile_name = _template_source_family_priority_name(template_type)
    priority_source_match_count = sum(
        1
        for source in verified_rag_sources
        if str(source.get("source_url") or "") in user_priority_urls
    )
    length_fix_attempted = False
    length_fix_result = "not_needed"
    best_rejected_candidate = ""
    best_rejected_length = 0
    best_rejected_distance: int | None = None
    best_retry_code = "generic"
    best_failure_codes: list[str] = []
    retry_failure_codes: list[str] = []
    last_under_min_length: int | None = None
    executed_rewrite_attempts = 0
    total_attempts = _total_rewrite_attempts(review_variant)
    use_tight_length_control = _uses_tight_length_control(
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        review_variant=review_variant,
    )
    for attempt in range(total_attempts):
        executed_rewrite_attempts = attempt + 1
        focus_modes = (
            ["normal"]
            if attempt == 0
            else _resolve_rewrite_focus_modes(
                retry_code=retry_code,
                failure_codes=retry_failure_codes,
            )
        )
        focus_mode = focus_modes[0]
        length_control_mode = _resolve_rewrite_length_control_mode(
            use_tight_length_control=use_tight_length_control,
            focus_mode=focus_mode,
        )
        retry_hints = _retry_hints_from_codes(
            retry_code=retry_code,
            failure_codes=retry_failure_codes,
            char_min=char_min,
            char_max=char_max,
            current_length=best_rejected_length or None,
            length_control_mode=length_control_mode,
        )
        length_shortfall = (
            max(0, char_min - best_rejected_length)
            if char_min and best_rejected_length and best_rejected_length < char_min
            else None
        )
        rewrite_source_answer = best_rejected_candidate or template_request.answer
        if attempt == 0:
            rewrite_source_answer = template_request.answer
        length_profile = resolve_length_control_profile(
            char_min,
            char_max,
            stage=_length_profile_stage_from_mode(length_control_mode),
            original_len=len(rewrite_source_answer),
            llm_model=llm_model,
            latest_failed_len=best_rejected_length,
        )
        attempt_context = _select_rewrite_prompt_context(
            template_type=template_type,
            char_max=char_max,
            attempt=attempt,
            simplified_mode=False,
            length_control_mode=length_control_mode,
            prompt_user_facts=prompt_user_facts,
            company_evidence_cards=prompt_company_evidence_cards,
            improvement_payload=improvement_payload,
            reference_quality_block=reference_quality_block,
            evidence_coverage_level=evidence_coverage_level,
        )
        system_prompt, user_prompt = build_template_rewrite_prompt(
            template_type=template_type,
            company_name=template_request.company_name,
            industry=template_request.industry,
            question=template_request.question,
            answer=rewrite_source_answer,
            char_min=char_min,
            char_max=char_max,
            company_evidence_cards=attempt_context["company_evidence_cards"],
            has_rag=effective_company_rag_available,
            allowed_user_facts=attempt_context["prompt_user_facts"],
            intern_name=template_request.intern_name,
            role_name=effective_role_name,
            grounding_mode=effective_grounding_mode,
            retry_hints=retry_hints,
            reference_quality_block=attempt_context["reference_quality_block"],
            generic_role_mode=generic_role_mode,
            evidence_coverage_level=evidence_coverage_level,
            length_control_mode=length_control_mode,
            length_shortfall=length_shortfall,
            focus_mode=focus_mode,
            focus_modes=focus_modes,
            company_grounding_override=effective_company_grounding,
            llm_model=llm_model,
        )

        logger.info(
            "[ES添削/テンプレート] rewrite %s attempt=%s/%s mode=%s",
            template_type,
            attempt + 1,
            total_attempts,
            focus_mode,
        )
        _queue_progress_event(
            progress_queue,
            step="rewrite",
            progress=52 if attempt == 0 else min(76, 52 + attempt * 5),
            label="改善案を作成中..." if focus_mode == "normal" else "失敗理由に合わせて再調整中...",
            sub_label="事実を保ちながら提出用の本文に整えています",
        )

        rewrite_result = await text_caller(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=_rewrite_max_tokens(
                char_max,
                review_variant=review_variant,
                llm_model=llm_model,
            ),
            temperature=_es_review_temperature(
                llm_model,
                stage="rewrite",
                focus_mode=focus_mode,
            ),
            model=llm_model,
            feature=review_feature,
            disable_fallback=True,
        )
        _accumulate_review_token_usage(review_token_usage, rewrite_result, call_kind="text")

        if not rewrite_result.success or not rewrite_result.data:
            error = rewrite_result.error
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
        validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
            candidate,
            template_type=template_type,
            question=template_request.question,
            company_name=template_request.company_name,
            char_min=char_min,
            char_max=char_max,
            issues=[],
            role_name=effective_role_name,
            intern_name=template_request.intern_name,
            grounding_mode=effective_grounding_mode,
            effective_company_grounding_policy=effective_company_grounding,
            company_evidence_cards=prompt_company_evidence_cards,
            review_variant=review_variant,
            soft_validation_mode="strict",
        )
        _append_rewrite_attempt_trace(
            rewrite_attempt_trace,
            stage="rewrite",
            text=str(candidate),
            accepted=bool(validated_candidate),
            retry_reason=retry_reason if not validated_candidate else "",
            attempt_index=attempt + 1,
            total_rewrite_attempts=total_attempts,
            prompt_mode=focus_mode,
            prompt_modes=focus_modes,
            failure_codes=[] if validated_candidate else list(retry_meta.get("failure_codes") or [retry_code]),
        )
        if not validated_candidate:
            failure_codes = list(retry_meta.get("failure_codes") or [retry_code])
            retry_failure_codes = failure_codes
            normalized_candidate = _normalize_repaired_text(candidate)
            current_length = len(normalized_candidate)
            candidate_distance = _char_limit_distance(
                normalized_candidate,
                char_min=char_min,
                char_max=char_max,
            )
            if best_rejected_distance is None or candidate_distance <= best_rejected_distance:
                best_rejected_candidate = normalized_candidate
                best_rejected_length = len(best_rejected_candidate)
                best_rejected_distance = candidate_distance
                best_retry_code = retry_code
                best_failure_codes = failure_codes
            accepted_length_failure_code = retry_code
            if retry_code == "under_min":
                if _should_short_circuit_to_length_fix(
                    retry_code=retry_code,
                    current_length=current_length,
                    last_under_min_length=last_under_min_length,
                    attempt_number=attempt + 1,
                    llm_model=llm_model,
                    char_min=char_min,
                    char_max=char_max,
                    rewrite_source_answer=rewrite_source_answer,
                ):
                    last_under_min_length = current_length
                    attempt_failures.append(retry_reason)
                    logger.warning(
                        "[ES添削/テンプレート] rewrite %s attempt=%s/%s 失敗: %s",
                        template_type,
                        attempt + 1,
                        total_attempts,
                        _describe_retry_reason(retry_reason),
                    )
                    logger.info(
                        "[ES添削/テンプレート] rewrite %s attempt=%s/%s under_min が連続したため早期に length-fix へ移行",
                        template_type,
                        attempt + 1,
                        total_attempts,
                    )
                    break
                last_under_min_length = current_length
            else:
                last_under_min_length = None
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
        accepted_attempt = attempt + 1
        accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
        accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
        accepted_soft_min_floor_ratio = retry_meta.get("soft_min_floor_ratio")
        accepted_length_profile_id = length_profile.profile_id
        accepted_target_window_lower = length_profile.target_lower
        accepted_target_window_upper = length_profile.target_upper
        accepted_source_fill_ratio = length_profile.source_fill_ratio
        accepted_required_growth = length_profile.required_growth
        accepted_latest_failed_length = length_profile.latest_failed_length
        accepted_length_failure_code = None
        rewrite_generation_mode = _serialize_focus_modes(focus_modes)
        break

    if (
        not final_rewrite
        and best_rejected_candidate
        and _should_attempt_length_fix(
            best_rejected_candidate,
            char_min=char_min,
            char_max=char_max,
            use_tight_length_control=use_tight_length_control,
            primary_failure_code=best_retry_code,
            failure_codes=best_failure_codes,
        )
    ):
        length_fix_attempted = True
        length_fix_source = best_rejected_candidate
        length_fix_code = best_retry_code
        length_fix_failure_codes = list(best_failure_codes or [best_retry_code])
        length_fix_result = "failed"
        for fix_pass in range(LENGTH_FIX_REWRITE_ATTEMPTS):
            length_fix_focus_modes = _resolve_rewrite_focus_modes(
                retry_code=length_fix_code,
                failure_codes=length_fix_failure_codes,
            )
            logger.info(
                "[ES添削/テンプレート] length-fix attempt: template=%s mode=%s pass=%s/%s",
                template_type,
                _serialize_focus_modes(length_fix_focus_modes),
                fix_pass + 1,
                LENGTH_FIX_REWRITE_ATTEMPTS,
            )
            system_prompt, user_prompt = build_template_length_fix_prompt(
                template_type=template_type,
                current_text=length_fix_source,
                char_min=char_min,
                char_max=char_max,
                fix_mode=length_fix_code,
                focus_modes=length_fix_focus_modes,
                length_control_mode=(
                    "under_min_recovery"
                    if use_tight_length_control and length_fix_code in {"under_min", "over_max"}
                    else "default"
                ),
                llm_model=llm_model,
            )
            rewrite_result = await text_caller(
                system_prompt=system_prompt,
                user_message=user_prompt,
                max_tokens=_rewrite_max_tokens(
                    char_max,
                    length_fix_mode=True,
                    review_variant=review_variant,
                    llm_model=llm_model,
                ),
                temperature=_es_review_temperature(llm_model, stage="length_fix"),
                model=llm_model,
                feature=review_feature,
                disable_fallback=True,
            )
            _accumulate_review_token_usage(review_token_usage, rewrite_result, call_kind="text")
            if not rewrite_result.success or not rewrite_result.data:
                _append_rewrite_attempt_trace(
                    rewrite_attempt_trace,
                    stage="length_fix",
                    text="",
                    accepted=False,
                    retry_reason="llm_call_failed",
                    prompt_mode=_serialize_focus_modes(length_fix_focus_modes),
                    prompt_modes=length_fix_focus_modes,
                    fix_pass=fix_pass + 1,
                    length_fix_total=LENGTH_FIX_REWRITE_ATTEMPTS,
                )
                break
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
                issues=[],
                role_name=effective_role_name,
                intern_name=template_request.intern_name,
                grounding_mode=effective_grounding_mode,
                effective_company_grounding_policy=effective_company_grounding,
                company_evidence_cards=prompt_company_evidence_cards,
                review_variant=review_variant,
                soft_validation_mode="final_soft",
            )
            if validated_candidate:
                _append_rewrite_attempt_trace(
                    rewrite_attempt_trace,
                    stage="length_fix",
                    text=str(candidate),
                    accepted=True,
                    prompt_mode=_serialize_focus_modes(length_fix_focus_modes),
                    prompt_modes=length_fix_focus_modes,
                    fix_pass=fix_pass + 1,
                    length_fix_total=LENGTH_FIX_REWRITE_ATTEMPTS,
                )
                final_rewrite = validated_candidate
                accepted_attempt = executed_rewrite_attempts + fix_pass + 1
                accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
                accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
                accepted_soft_min_floor_ratio = retry_meta.get("soft_min_floor_ratio")
                length_fix_profile = resolve_length_control_profile(
                    char_min,
                    char_max,
                    stage="under_min_recovery" if length_fix_code == "under_min" else "tight_length",
                    original_len=len(length_fix_source),
                    llm_model=llm_model,
                    latest_failed_len=len(length_fix_source),
                )
                accepted_length_profile_id = length_fix_profile.profile_id
                accepted_target_window_lower = length_fix_profile.target_lower
                accepted_target_window_upper = length_fix_profile.target_upper
                accepted_source_fill_ratio = length_fix_profile.source_fill_ratio
                accepted_required_growth = length_fix_profile.required_growth
                accepted_latest_failed_length = len(length_fix_source)
                accepted_length_failure_code = "under_min" if length_fix_code == "under_min" else retry_code
                if retry_code == "soft_ok":
                    rewrite_validation_status = "soft_ok"
                    rewrite_validation_codes = list(
                        retry_meta.get("soft_validation_codes") or ["under_min"]
                    )
                    rewrite_validation_user_hint = _rewrite_validation_soft_hint(
                        rewrite_validation_codes
                    )
                    length_fix_result = "soft_recovered"
                else:
                    length_fix_result = "strict_recovered"
                break
            _append_rewrite_attempt_trace(
                rewrite_attempt_trace,
                stage="length_fix",
                text=str(candidate),
                accepted=False,
                retry_reason=retry_reason,
                prompt_mode=_serialize_focus_modes(length_fix_focus_modes),
                prompt_modes=length_fix_focus_modes,
                failure_codes=list(retry_meta.get("failure_codes") or [retry_code]),
                fix_pass=fix_pass + 1,
                length_fix_total=LENGTH_FIX_REWRITE_ATTEMPTS,
            )
            if fix_pass + 1 < LENGTH_FIX_REWRITE_ATTEMPTS:
                normalized_candidate = _normalize_repaired_text(candidate)
                if normalized_candidate:
                    length_fix_source = normalized_candidate
                    length_fix_failure_codes = list(retry_meta.get("failure_codes") or [retry_code])
                    length_fix_code = retry_code or length_fix_code

    if not final_rewrite:
        if best_rejected_candidate and _best_effort_rewrite_admissible(
            best_rejected_candidate,
            template_type=template_type,
            company_name=template_request.company_name,
            char_max=char_max,
            primary_failure_code=best_retry_code,
        ):
            final_rewrite = _coerce_degraded_rewrite_dearu_style(best_rejected_candidate)
            rewrite_validation_status = "degraded"
            rewrite_validation_codes = list(best_failure_codes or ([best_retry_code] if best_retry_code != "generic" else []))
            rewrite_validation_user_hint = _rewrite_validation_degraded_hint(rewrite_validation_codes)
            rewrite_generation_mode = "degraded_best_effort"
            accepted_attempt = executed_rewrite_attempts + (
                LENGTH_FIX_REWRITE_ATTEMPTS if length_fix_attempted else 0
            )
            degraded_profile = resolve_length_control_profile(
                char_min,
                char_max,
                stage="under_min_recovery" if best_retry_code == "under_min" else "default",
                original_len=len(best_rejected_candidate),
                llm_model=llm_model,
                latest_failed_len=len(best_rejected_candidate),
            )
            accepted_length_profile_id = degraded_profile.profile_id
            accepted_target_window_lower = degraded_profile.target_lower
            accepted_target_window_upper = degraded_profile.target_upper
            accepted_source_fill_ratio = degraded_profile.source_fill_ratio
            accepted_required_growth = degraded_profile.required_growth
            accepted_latest_failed_length = len(best_rejected_candidate)
            accepted_length_failure_code = best_retry_code
            _append_rewrite_attempt_trace(
                rewrite_attempt_trace,
                stage="degraded_best_effort",
                text=final_rewrite,
                accepted=True,
                retry_reason="adopted_best_rejected_without_new_llm",
                failure_codes=rewrite_validation_codes,
            )
            logger.warning(
                "[ES添削/テンプレート] rewrite %s ベストエフォート採用: codes=%s",
                template_type,
                rewrite_validation_codes,
            )
        else:
            record_parse_failure("es_review_template_rewrite", retry_reason)
            logger.error(
                f"[ES添削/テンプレート] rewrite {template_type} 最終失敗: "
                f"{_describe_retry_reason(retry_reason)} / 履歴={attempt_failures}"
            )
            detail: dict[str, Any] = {
                "error": GENERIC_REWRITE_VALIDATION_ERROR,
                "error_type": "validation",
                "provider": "template_rewrite",
            }
            if os.getenv("LIVE_ES_REVIEW_CAPTURE_DEBUG") == "1":
                detail["debug"] = {
                    "last_retry_reason": retry_reason,
                    "attempt_failures": attempt_failures[-16:],
                    "rewrite_attempt_trace": rewrite_attempt_trace,
                }
            raise HTTPException(status_code=422, detail=detail)

    total_logged_attempts = total_attempts + (LENGTH_FIX_REWRITE_ATTEMPTS if length_fix_attempted else 0)
    logger.info(
        "[ES添削/テンプレート] rewrite success: template=%s attempt=%s/%s chars=%s",
        template_type,
        accepted_attempt,
        total_logged_attempts,
        len(final_rewrite),
    )
    logger.info(
        "[ES添削/テンプレート] final rewrite:\n%s",
        final_rewrite,
    )
    _queue_progress_event(
        progress_queue,
        step="rewrite",
        progress=80,
        label="改善案を表示中...",
        sub_label="確定した改善案をそのまま表示しています",
    )
    await _stream_final_rewrite(progress_queue, final_rewrite)

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
        rag_sources=verified_rag_sources,
        request=request,
    )
    logger.info(
        "[ES添削/テンプレート] sources:\n%s",
        _format_source_log_lines(template_review.keyword_sources),
    )
    await _stream_source_links(progress_queue, template_review.keyword_sources)

    return ReviewResponse(
        rewrites=[final_rewrite],
        template_review=template_review,
        review_meta=_build_review_meta(
            request,
            llm_provider=llm_provider,
            llm_model=llm_model,
            review_variant=review_variant,
            grounding_mode=effective_grounding_mode,
            triggered_enrichment=triggered_enrichment,
            enrichment_completed=enrichment_completed,
            enrichment_sources_added=enrichment_sources_added,
            injection_risk=injection_risk,
            rewrite_generation_mode=rewrite_generation_mode,
            rewrite_attempt_count=accepted_attempt,
            reference_es_count=len(reference_examples),
            reference_quality_profile_used=bool(reference_quality_block),
            reference_outline_used=reference_outline_used,
            reference_hint_count=len((reference_quality_profile or {}).get("quality_hints") or [])
            + len((reference_quality_profile or {}).get("conditional_hints") or []),
            reference_conditional_hints_applied=bool(
                (reference_quality_profile or {}).get("conditional_hints_applied")
            ),
            reference_profile_variance=(reference_quality_profile or {}).get("variance_band"),
            company_grounding_policy=company_grounding,
            effective_company_grounding_policy=effective_company_grounding,
            company_evidence_count=len(prompt_company_evidence_cards),
            company_evidence_verified_count=len(verified_rag_sources),
            company_evidence_rejected_count=len(rejected_rag_sources),
            company_grounding_safety_applied=has_mismatched_company_sources,
            evidence_coverage_level=evidence_coverage_level,
            weak_evidence_notice=weak_evidence_notice,
            length_policy=accepted_length_policy,
            length_shortfall=accepted_length_shortfall,
            soft_min_floor_ratio=accepted_soft_min_floor_ratio,
            length_fix_attempted=length_fix_attempted,
            length_fix_result=length_fix_result,
            rewrite_validation_status=rewrite_validation_status,
            rewrite_validation_codes=rewrite_validation_codes,
            rewrite_validation_user_hint=rewrite_validation_user_hint,
            length_profile_id=accepted_length_profile_id,
            target_window_lower=accepted_target_window_lower,
            target_window_upper=accepted_target_window_upper,
            source_fill_ratio=accepted_source_fill_ratio,
            required_growth=accepted_required_growth,
            latest_failed_length=accepted_latest_failed_length,
            length_failure_code=accepted_length_failure_code,
            retrieval_profile_name=retrieval_profile_name,
            priority_source_match_count=priority_source_match_count,
            token_usage=_maybe_review_token_usage(review_token_usage),
            rewrite_rejection_reasons=list(attempt_failures),
            rewrite_attempt_trace=rewrite_attempt_trace,
            rewrite_total_rewrite_attempts=total_attempts,
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

        if not request.content or not request.content.strip():
            yield _sse_event(
                "error",
                {
                    "message": "ESの内容が空です。本文を入力してから添削をリクエストしてください。"
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
        template_rag_profile["content_type_boosts"] = _build_template_content_type_boosts(
            template_request.template_type,
            assistive_company_signal=assistive_company_signal,
        )
        template_rag_profile["priority_source_urls"] = list(
            dict.fromkeys(request.user_provided_corporate_urls)
        )
        if _should_fetch_company_rag_for_template(
            template_request.template_type,
            assistive_company_signal=assistive_company_signal,
        ):
            template_rag_profile["short_circuit"] = False

        # Step 2: RAG fetch (if company_id)
        rag_context = ""
        rag_sources: list[dict] = []
        company_rag_available = request.has_company_rag
        context_length = get_dynamic_context_length(request.content)
        retrieval_query = request.retrieval_query or request.content
        grounding_mode = "none"
        triggered_enrichment = False
        enrichment_completed = False
        enrichment_sources_added = 0
        user_priority_urls = {url for url in request.user_provided_corporate_urls if url}
        should_fetch_company_rag = _should_fetch_company_rag_for_template(
            template_request.template_type,
            assistive_company_signal=assistive_company_signal,
        )

        if request.company_id and should_fetch_company_rag:
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
                )
                initial_coverage_level, _ = _assess_company_evidence_coverage(
                    template_type=template_request.template_type,
                    role_name=primary_role,
                    company_rag_available=company_rag_available,
                    company_evidence_cards=initial_company_evidence_cards,
                    grounding_mode=grounding_mode,
                )
                logger.info(
                    "[ES添削/SSE/テンプレート] grounding_mode=%s primary_role=%s triggered_enrichment=%s enrichment_completed=%s enrichment_sources_added=%s initial_coverage=%s",
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
                    initial_coverage_level,
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
            yield _sse_event("error", {
                "message": message,
                "internal_telemetry": consume_request_llm_cost_summary("es_review"),
            })
            last_stream_activity = time.monotonic()
            return

        yield _sse_event("complete", {
            "result": result.model_dump(),
            "internal_telemetry": consume_request_llm_cost_summary("es_review"),
        })
        last_stream_activity = time.monotonic()

    except Exception as e:
        logger.error(f"[ES添削/SSE] ❌ エラー: {e}")
        yield _sse_event("error", {
            "message": str(e),
            "internal_telemetry": consume_request_llm_cost_summary("es_review"),
        })


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
@limiter.limit("60/minute")
async def review_es_stream(payload: ReviewRequest, request: Request):
    """
    Stream ES review progress via Server-Sent Events (SSE).

    This endpoint provides real-time progress updates during ES review,
    allowing the frontend to show accurate progress to users.

    Events:
    - progress: {"type": "progress", "step": "...", "progress": 0-100, "label": "..."}
    - complete: {"type": "complete", "result": {...}}
    - error: {"type": "error", "message": "..."}
    """
    request = payload
    return _build_review_streaming_response(_generate_review_progress(request))


@router.get("/company-status/{company_id}", response_model=CompanyReviewStatusResponse)
@limiter.limit("120/minute")
async def get_company_review_status(company_id: str, request: Request):
    return evaluate_company_review_status(company_id)
