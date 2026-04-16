"""ES review router."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncGenerator, Any, Awaitable, Callable

from app.security.career_principal import (
    CareerPrincipal,
    require_career_principal,
)
from app.security.sse_concurrency import (
    SseConcurrencyExceeded,
    SseLease,
)
import json
import asyncio
import math
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
    build_template_fallback_rewrite_prompt,
    get_template_evaluation_checks,
    get_template_default_grounding_level,
    get_template_company_grounding_policy,
    get_template_retry_guidance,
    grounding_level_to_policy,
    get_template_rag_profile,
    resolve_length_control_profile,
)
from app.prompts.reference_es import (
    build_reference_quality_block,
    build_reference_quality_profile,
    load_reference_examples,
)
from app.limiter import limiter
from app.utils.es_template_classifier import classify_es_question

# ---------------------------------------------------------------------------
# Extraction module imports — functions/constants split out of this file
# ---------------------------------------------------------------------------
from app.routers.es_review_request import (
    iter_string_leaves as _iter_string_leaves,
    collect_injection_scan_targets as _collect_injection_scan_targets,
    detect_request_injection_risk as _detect_request_injection_risk,
    sanitize_nested_prompt_value as _sanitize_nested_prompt_value,
    sanitize_optional_prompt_text as _sanitize_optional_prompt_text,
    sanitize_review_request as _sanitize_review_request,
)
from app.routers.es_review_validation import (
    SHORT_ANSWER_CHAR_MAX,
    FINAL_SOFT_MIN_FLOOR_RATIO,
    TIGHT_LENGTH_TEMPLATES,
    SEMANTIC_COMPRESSION_RULES,
    _has_unfinished_tail,
    _normalize_repaired_text,
    _coerce_degraded_rewrite_dearu_style,
    _uses_tight_length_control,
    _soft_min_shortfall,
    _is_within_char_limits,
    _char_limit_distance,
    _should_attempt_semantic_compression,
    _apply_semantic_compression_rules,
    _split_japanese_sentences,
    _sentence_priority,
    _prune_low_priority_sentences,
    _trim_to_safe_boundary,
    deterministic_compress_variant,
    _fit_rewrite_text_deterministically,
    _candidate_has_grounding_anchor,
    _should_validate_grounding,
    _split_candidate_sentences,
    _contains_negative_self_eval,
    _validate_standard_conclusion_focus,
    _validate_rewrite_candidate,
)
from app.routers.es_review_issue import (
    DIFFICULTY_LEVELS,
    REQUIRED_ACTIONS,
    _normalize_difficulty,
    _normalize_required_action,
    _normalize_issue_id,
    _infer_required_action,
    _default_difficulty,
    _parse_issues,
    _default_must_appear,
    _fallback_improvement_points,
    _merge_with_fallback_issues,
)
from app.routers.es_review_grounding import (
    COMPANY_HONORIFIC_TOKENS,
    COMPANY_REFERENCE_TOKENS,
    ROLE_SUPPORTIVE_CONTENT_TYPES,
    ROLE_PROGRAM_EVIDENCE_THEMES,
    COMPANY_DIRECTION_EVIDENCE_THEMES,
    SUPPORTING_PROMPT_FACT_SOURCES,
    _template_checks,
    _split_fact_spans,
    _append_user_fact,
    _build_allowed_user_facts,
    _role_name_appears_in_text,
    _extract_prompt_terms,
    _is_generic_role_label,
    _extract_question_focus_signals,
    _question_has_assistive_company_signal,
    _count_term_overlap,
    _select_prompt_user_facts,
    _tokenize_role_terms,
    _infer_company_evidence_theme,
    _infer_secondary_company_evidence_theme,
    _score_company_evidence_source,
    _normalize_company_evidence_axis,
    _normalize_company_evidence_summary,
    _build_company_evidence_cards,
    _assess_company_evidence_coverage,
    _collect_user_context_sources,
)
from app.routers.es_review_retry import (
    REWRITE_MAX_ATTEMPTS,
    LENGTH_FIX_REWRITE_ATTEMPTS,
    _OPENAI_ES_REVIEW_OUTPUT_TOKEN_FLOOR,
    PROMPT_USER_FACT_LIMIT,
    _dedupe_preserve_order,
    _select_retry_codes,
    _primary_retry_code,
    _resolve_rewrite_focus_mode,
    _resolve_rewrite_focus_modes,
    _serialize_focus_modes,
    _format_target_char_hint,
    _best_effort_rewrite_admissible,
    _build_ai_smell_retry_hints,
    _rewrite_validation_degraded_hint,
    _rewrite_validation_soft_hint,
    _describe_retry_reason,
    _resolve_rewrite_length_control_mode,
    _length_profile_stage_from_mode,
    _length_shortfall_bucket,
    _es_review_temperature,
    _should_attempt_length_fix,
    _openai_es_review_output_cap,
    _rewrite_max_tokens,
    _total_rewrite_attempts,
    _normalize_timeout_fallback_clause,
    _retry_hint_from_code,
    _retry_hints_from_codes,
    _should_short_circuit_to_length_fix,
    _is_short_answer_mode,
    _select_rewrite_prompt_context,
    _build_role_focused_second_pass_query,
    _build_second_pass_content_type_boosts,
    _should_run_role_focused_second_pass,
)
from app.routers.es_review_pipeline import (
    _empty_review_token_usage,
    _accumulate_review_token_usage,
    _maybe_review_token_usage,
    _evaluate_template_rag_availability,
    _build_review_meta,
)
from app.routers.es_review_stream import (
    _queue_progress_event,
    _queue_stream_event,
    _stream_final_rewrite,
    _stream_source_links,
    _sse_event,
    _sse_comment,
    _extract_domain,
    _build_keyword_sources,
)
from app.routers.es_review_models import (
    TemplateRequest,
    TemplateVariant,
    TemplateSource,
    RoleContext,
    ProfileContext,
    GakuchikaContextItem,
    DocumentSectionContext,
    DocumentContext,
    ReviewTokenUsage,
    ReviewMeta,
    TemplateReview,
    ReviewRequest,
    Issue,
    ReviewResponse,
    CompanyReviewStatusResponse,
)
from app.routers.es_review_models import (
    TemplateRequest,
    TemplateVariant,
    TemplateSource,
    RoleContext,
    ProfileContext,
    GakuchikaContextItem,
    DocumentSectionContext,
    DocumentContext,
    ReviewTokenUsage,
    ReviewMeta,
    TemplateReview,
    ReviewRequest,
    Issue,
    ReviewResponse,
    CompanyReviewStatusResponse,
)

router = APIRouter(prefix="/api/es", tags=["es-review"])

ReviewJSONCaller = Callable[..., Awaitable[Any]]
ReviewTextCaller = Callable[..., Awaitable[Any]]

COMPANY_EVIDENCE_CARD_LIMIT = 5
SOFT_MIN_SHORTFALL_LIMIT = 8
LENGTH_FIX_DELTA_LIMIT = 25
# under_min は短い生成が続くことがあるため、over_max より広い差分まで length-fix を許可する
LENGTH_FIX_UNDER_MIN_GAP_LIMIT = 200
TIGHT_LENGTH_FIX_DELTA_LIMIT = 45
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


def _get_company_grounding_policy(template_type: str) -> str:
    return get_template_company_grounding_policy(template_type)


def _get_default_grounding_level(template_type: str) -> str:
    return get_template_default_grounding_level(template_type)


def _company_grounding_is_required(template_type: str) -> bool:
    return _get_company_grounding_policy(template_type) == "required"


def _company_grounding_is_assistive(template_type: str) -> bool:
    return _get_company_grounding_policy(template_type) == "assistive"


def _resolve_effective_grounding_level(
    *,
    template_type: str,
    classifier_grounding_level: str | None,
    char_max: int | None,
    evidence_coverage_level: str,
    has_company_rag: bool,
) -> str:
    level = classifier_grounding_level or _get_default_grounding_level(template_type)
    ordered = ["none", "light", "standard", "deep"]

    def lower(current: str) -> str:
        try:
            index = ordered.index(current)
        except ValueError:
            return "light"
        return ordered[max(0, index - 1)]

    if template_type == "basic" and char_max and char_max <= SHORT_ANSWER_CHAR_MAX and level in {"standard", "deep"}:
        level = "light"
    if not has_company_rag and level in {"standard", "deep"}:
        level = lower(level)
    if evidence_coverage_level == "weak" and level in {"standard", "deep"}:
        level = lower(level)
    if evidence_coverage_level == "none" and level in {"standard", "deep"}:
        level = "light"
    return level


def _derive_char_min(char_max: Optional[int]) -> Optional[int]:
    if not char_max:
        return None
    return max(0, char_max - 10)


def _describe_rag_reason(reason: str) -> str:
    mapping = {
        "ok": "企業RAGを利用できます",
        "context_short": "企業RAG本文が短すぎるため利用しません",
        "sources_missing": "企業RAG本文はありますが出典情報が不足しています",
        "rag_unavailable": "企業RAGが利用できません",
        "no_context": "企業RAGの本文が取得できませんでした",
    }
    return mapping.get(reason, reason)


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

    classification = classify_es_question(template_request.question)
    classification_confidence = (
        template_request.inferred_confidence or classification.confidence
    )
    classification_secondary_candidates = (
        template_request.secondary_template_types or classification.secondary_candidates
    )
    classification_rationale = (
        template_request.classification_rationale or classification.rationale
    )
    recommended_grounding_level = (
        template_request.recommended_grounding_level
        or classification.recommended_grounding_level
        or _get_default_grounding_level(template_type)
    )
    classification_hints: list[str] = []
    if classification.predicted_template_type != template_type:
        predicted_label = TEMPLATE_DEFS.get(classification.predicted_template_type, {}).get(
            "label", classification.predicted_template_type
        )
        current_label = TEMPLATE_DEFS.get(template_type, {}).get("label", template_type)
        classification_hints.append(
            f"この設問は {predicted_label} とも読まれやすいが、今回は {current_label} として正面から答える"
        )
    if classification_secondary_candidates:
        secondary_labels = [
            str(TEMPLATE_DEFS.get(candidate, {}).get("label") or candidate)
            for candidate in classification_secondary_candidates[:2]
        ]
        classification_hints.append(
            f"近接しやすい観点（{' / '.join(secondary_labels)}）と混線しない"
        )
    if classification_confidence != "high":
        classification_hints.append("設問の主眼を1つに絞り、別種の設問要素を混ぜすぎない")
    misclassification_recovery_applied = bool(classification_hints)

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
        char_max=char_max,
    )
    verified_rag_sources, rejected_rag_sources, has_mismatched_company_sources = (
        _filter_verified_company_rag_sources(
            rag_sources,
            company_name=template_request.company_name,
        )
    )
    effective_company_rag_available = company_rag_available and bool(verified_rag_sources)
    effective_grounding_mode = grounding_mode
    effective_grounding_level = _resolve_effective_grounding_level(
        template_type=template_type,
        classifier_grounding_level=recommended_grounding_level,
        char_max=char_max,
        evidence_coverage_level="none",
        has_company_rag=effective_company_rag_available,
    )
    effective_company_grounding = grounding_level_to_policy(effective_grounding_level)
    if has_mismatched_company_sources:
        effective_grounding_level = "light"
        effective_company_grounding = grounding_level_to_policy(effective_grounding_level)
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
    effective_grounding_level = _resolve_effective_grounding_level(
        template_type=template_type,
        classifier_grounding_level=recommended_grounding_level,
        char_max=char_max,
        evidence_coverage_level=evidence_coverage_level,
        has_company_rag=effective_company_rag_available,
    )
    if has_mismatched_company_sources:
        effective_grounding_level = "light"
    effective_company_grounding = grounding_level_to_policy(effective_grounding_level)
    grounding_repair_applied = effective_grounding_level != recommended_grounding_level or has_mismatched_company_sources
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
    fallback_triggered = False
    fallback_reason: str | None = None
    length_fix_attempted = False
    length_fix_result = "not_needed"
    best_rejected_candidate = ""
    best_rejected_length = 0
    best_rejected_distance: int | None = None
    best_retry_code = "generic"
    best_failure_codes: list[str] = []
    accepted_ai_smell_warnings: list[dict[str, str]] = []
    best_rejected_ai_smell_warnings: list[dict[str, str]] = []
    retry_failure_codes: list[str] = []
    last_ai_smell_warnings: list[dict[str, str]] = []
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
            template_type=template_type,
        )
        if classification_hints:
            retry_hints = [*classification_hints, *retry_hints]
        if last_ai_smell_warnings:
            smell_hints = _build_ai_smell_retry_hints(last_ai_smell_warnings)
            retry_hints = [*retry_hints, *smell_hints]
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
            effective_company_grounding=effective_company_grounding,
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
            grounding_level_override=effective_grounding_level,
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
            industry=template_request.industry,
            grounding_mode=effective_grounding_mode,
            effective_company_grounding_policy=effective_company_grounding,
            company_evidence_cards=prompt_company_evidence_cards,
            review_variant=review_variant,
            soft_validation_mode="strict",
            user_answer=template_request.answer,
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
                best_retry_code = _primary_retry_code(
                    retry_code=retry_code,
                    failure_codes=failure_codes,
                )
                best_failure_codes = failure_codes
                best_rejected_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
            last_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
            primary_retry_code = _primary_retry_code(
                retry_code=retry_code,
                failure_codes=failure_codes,
            )
            accepted_length_failure_code = primary_retry_code
            if primary_retry_code == "under_min":
                if _should_short_circuit_to_length_fix(
                    retry_code=primary_retry_code,
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
        accepted_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
        rewrite_generation_mode = _serialize_focus_modes(focus_modes)
        break

    if (
        not final_rewrite
        and best_rejected_candidate
        and any(code not in {"under_min", "over_max"} for code in best_failure_codes)
    ):
        fallback_triggered = True
        fallback_reason = best_retry_code or "generic"
        fallback_hints = [*classification_hints, *attempt_failures[-2:]]
        if best_rejected_ai_smell_warnings:
            smell_hints = _build_ai_smell_retry_hints(best_rejected_ai_smell_warnings)
            fallback_hints = [*fallback_hints, *smell_hints]
        system_prompt, user_prompt = build_template_fallback_rewrite_prompt(
            template_type=template_type,
            company_name=template_request.company_name,
            industry=template_request.industry,
            question=template_request.question,
            answer=best_rejected_candidate,
            char_min=char_min,
            char_max=char_max,
            company_evidence_cards=prompt_company_evidence_cards,
            has_rag=effective_company_rag_available,
            allowed_user_facts=prompt_user_facts,
            intern_name=template_request.intern_name,
            role_name=effective_role_name,
            grounding_mode=effective_grounding_mode,
            retry_hints=fallback_hints,
            reference_quality_block=reference_quality_block,
            generic_role_mode=generic_role_mode,
            evidence_coverage_level=evidence_coverage_level,
            length_control_mode="under_min_recovery" if best_retry_code == "under_min" else "default",
            length_shortfall=max(0, (char_min or 0) - len(best_rejected_candidate)) if char_min else None,
            focus_modes=_resolve_rewrite_focus_modes(
                retry_code=best_retry_code,
                failure_codes=best_failure_codes,
            ),
            company_grounding_override=effective_company_grounding,
            grounding_level_override=effective_grounding_level,
            llm_model=llm_model,
        )
        fallback_result = await text_caller(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=_rewrite_max_tokens(
                char_max,
                review_variant=review_variant,
                llm_model=llm_model,
            ),
            temperature=_es_review_temperature(llm_model, stage="rewrite", focus_mode="normal"),
            model=llm_model,
            feature=review_feature,
            disable_fallback=True,
        )
        _accumulate_review_token_usage(review_token_usage, fallback_result, call_kind="text")
        fallback_candidate = (
            fallback_result.data.get("text", "")
            if fallback_result.success and isinstance(fallback_result.data, dict)
            else str(fallback_result.data) if fallback_result.success and fallback_result.data else ""
        )
        validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
            fallback_candidate,
            template_type=template_type,
            question=template_request.question,
            company_name=template_request.company_name,
            char_min=char_min,
            char_max=char_max,
            issues=[],
            role_name=effective_role_name,
            intern_name=template_request.intern_name,
            industry=template_request.industry,
            grounding_mode=effective_grounding_mode,
            effective_company_grounding_policy=effective_company_grounding,
            company_evidence_cards=prompt_company_evidence_cards,
            review_variant=review_variant,
            soft_validation_mode="strict",
            user_answer=template_request.answer,
        )
        _append_rewrite_attempt_trace(
            rewrite_attempt_trace,
            stage="fallback",
            text=fallback_candidate,
            accepted=bool(validated_candidate),
            retry_reason="" if validated_candidate else retry_reason,
            attempt_index=total_attempts + 1,
            total_rewrite_attempts=total_attempts + 1,
            prompt_mode="fallback",
            failure_codes=[] if validated_candidate else list(retry_meta.get("failure_codes") or [retry_code]),
        )
        if validated_candidate:
            final_rewrite = validated_candidate
            accepted_attempt = total_attempts + 1
            accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
            accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
            accepted_soft_min_floor_ratio = retry_meta.get("soft_min_floor_ratio")
            fallback_profile = resolve_length_control_profile(
                char_min,
                char_max,
                stage="under_min_recovery" if best_retry_code == "under_min" else "default",
                original_len=len(best_rejected_candidate),
                llm_model=llm_model,
                latest_failed_len=len(best_rejected_candidate),
            )
            accepted_length_profile_id = fallback_profile.profile_id
            accepted_target_window_lower = fallback_profile.target_lower
            accepted_target_window_upper = fallback_profile.target_upper
            accepted_source_fill_ratio = fallback_profile.source_fill_ratio
            accepted_required_growth = fallback_profile.required_growth
            accepted_latest_failed_length = fallback_profile.latest_failed_length
            accepted_length_failure_code = None
            accepted_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
            rewrite_generation_mode = "fallback_safe_rewrite"
        else:
            attempt_failures.append(retry_reason)

    if (
        not final_rewrite
        and best_rejected_candidate
        and best_retry_code in {"under_min", "over_max", "style", "grounding"}
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
                effective_company_grounding=effective_company_grounding,
                grounding_mode=effective_grounding_mode,
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
                industry=template_request.industry,
                grounding_mode=effective_grounding_mode,
                effective_company_grounding_policy=effective_company_grounding,
                company_evidence_cards=prompt_company_evidence_cards,
                review_variant=review_variant,
                soft_validation_mode="final_soft",
                user_answer=template_request.answer,
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
                accepted_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
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
            failure_codes=best_failure_codes,
        ):
            final_rewrite = _coerce_degraded_rewrite_dearu_style(best_rejected_candidate)
            rewrite_validation_status = "degraded"
            rewrite_validation_codes = list(best_failure_codes or ([best_retry_code] if best_retry_code != "generic" else []))
            rewrite_validation_user_hint = _rewrite_validation_degraded_hint(rewrite_validation_codes)
            accepted_ai_smell_warnings = best_rejected_ai_smell_warnings
            if accepted_ai_smell_warnings:
                smell_details = "; ".join(w["detail"] for w in accepted_ai_smell_warnings[:3])
                rewrite_validation_user_hint += f" また、以下のAI的表現が検出されました: {smell_details}"
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
            recommended_grounding_level=recommended_grounding_level,
            effective_grounding_level=effective_grounding_level,
            company_evidence_count=len(prompt_company_evidence_cards),
            company_evidence_verified_count=len(verified_rag_sources),
            company_evidence_rejected_count=len(rejected_rag_sources),
            company_grounding_safety_applied=has_mismatched_company_sources,
            evidence_coverage_level=evidence_coverage_level,
            weak_evidence_notice=weak_evidence_notice,
            selected_company_evidence_themes=[
                str(card.get("theme") or "").strip()
                for card in prompt_company_evidence_cards
                if str(card.get("theme") or "").strip()
            ],
            length_policy=accepted_length_policy,
            length_shortfall=accepted_length_shortfall,
            length_shortfall_bucket=_length_shortfall_bucket(
                char_min=char_min,
                latest_failed_length=accepted_latest_failed_length,
                length_failure_code=accepted_length_failure_code,
            ),
            soft_min_floor_ratio=accepted_soft_min_floor_ratio,
            length_fix_attempted=length_fix_attempted,
            length_fix_result=length_fix_result,
            rewrite_validation_status=rewrite_validation_status,
            rewrite_validation_codes=rewrite_validation_codes,
            rewrite_validation_user_hint=rewrite_validation_user_hint,
            classification_confidence=classification_confidence,
            classification_secondary_candidates=classification_secondary_candidates,
            classification_rationale=classification_rationale,
            misclassification_recovery_applied=misclassification_recovery_applied,
            fallback_triggered=fallback_triggered,
            fallback_reason=fallback_reason,
            grounding_repair_applied=grounding_repair_applied,
            length_profile_id=accepted_length_profile_id,
            target_window_lower=accepted_target_window_lower,
            target_window_upper=accepted_target_window_upper,
            source_fill_ratio=accepted_source_fill_ratio,
            required_growth=accepted_required_growth,
            latest_failed_length=accepted_latest_failed_length,
            length_failure_code=accepted_length_failure_code,
            unfinished_tail_detected=_has_unfinished_tail(final_rewrite),
            retrieval_profile_name=retrieval_profile_name,
            priority_source_match_count=priority_source_match_count,
            token_usage=_maybe_review_token_usage(review_token_usage),
            rewrite_rejection_reasons=list(attempt_failures),
            rewrite_attempt_trace=rewrite_attempt_trace,
            rewrite_total_rewrite_attempts=total_attempts,
            ai_smell_warnings=accepted_ai_smell_warnings,
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
async def review_es_stream(
    payload: ReviewRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
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

    # Defense-in-depth: if both sides carry a company_id, they must match.
    if (
        request.company_id
        and principal.company_id
        and principal.company_id != request.company_id
    ):
        raise HTTPException(
            status_code=403,
            detail="career principal company_id mismatch",
        )

    try:
        lease = await SseLease.acquire(
            actor_id=principal.actor_id, plan=principal.plan
        )
    except SseConcurrencyExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "sse_concurrency_exceeded",
                "limit": exc.rejection.limit,
            },
            headers={
                "Retry-After": str(exc.rejection.retry_after_seconds),
            },
        )

    async def _stream_with_lease() -> AsyncGenerator[str, None]:
        async with lease:
            async for chunk in _generate_review_progress(request):
                await lease.heartbeat_if_due()
                yield chunk

    return _build_review_streaming_response(_stream_with_lease())


@router.get("/company-status/{company_id}", response_model=CompanyReviewStatusResponse)
@limiter.limit("120/minute")
async def get_company_review_status(company_id: str, request: Request):
    return evaluate_company_review_status(company_id)
