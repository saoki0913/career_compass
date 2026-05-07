"""Orchestrator for ES review: review_section_with_template decomposed into 4 stages.

This module extracts the 936-line review_section_with_template() body into:
  1. prepare_review_context      -> ReviewContext
  2. execute_rewrite_loop        -> RewriteLoopResult
  3. execute_recovery_pipeline   -> RecoveryResult
  4. assemble_review_response    -> ReviewResponse
"""

from __future__ import annotations

import os
import re as _re
from typing import Any, Awaitable, Callable

from fastapi import HTTPException

from app.config import settings
from app.rag.reference_es import retrieve_reference_es_semantic
from app.utils.secure_logger import get_logger
from app.utils.telemetry import record_parse_failure
from app.utils.llm import (
    call_llm_text_with_error as _default_call_llm_text_with_error,
    call_llm_with_error as _default_call_llm_with_error,
)
from app.services.es_review.fact_guard import _compute_hallucination_score
from app.services.es_review.constants import GENERIC_REWRITE_VALIDATION_ERROR
from app.services.es_review.validation_profile import (
    STRICT_PROFILE,
    apply_information_tier_adjustments,
    compute_information_density,
)

# -- models --
from app.services.es_review.models import (
    ReviewContext,
    ReviewRequest,
    ReviewResponse,
    RewriteLoopResult,
    RecoveryResult,
    TemplateReview,
    TemplateSource,
    TemplateVariant,
)

# -- pipeline helpers --
from app.services.es_review.pipeline import (
    _build_review_meta,
    _empty_review_token_usage,
    _accumulate_review_token_usage,
    _maybe_review_token_usage,
)

# -- validation --
from app.services.es_review.validation import (
    SHORT_ANSWER_CHAR_MAX,
    _has_unfinished_tail,
    _normalize_repaired_text,
    _coerce_degraded_rewrite_dearu_style,
    _validate_rewrite_combined,
    _char_limit_distance,
    _uses_tight_length_control,
    evaluate_deep_grounding_meta,
)

# -- retry --
from app.services.es_review.retry import (
    _total_rewrite_attempts,
    _resolve_rewrite_focus_modes,
    _resolve_rewrite_length_control_mode,
    _retry_hints_from_codes,
    _es_review_temperature,
    _rewrite_max_tokens,
    _length_profile_stage_from_mode,
    _serialize_focus_modes,
    _primary_retry_code,
    _select_composite_retry_mode,
    _best_effort_rewrite_admissible,
    _build_hallucination_retry_hints,
    _rewrite_validation_degraded_hint,
    _describe_retry_reason,
    _length_shortfall_bucket,
    _select_rewrite_prompt_context,
)

# -- grounding --
from app.services.es_review.grounding import (
    _build_allowed_user_facts,
    _select_prompt_user_facts,
    _build_company_evidence_cards,
    _assess_company_evidence_coverage,
    _collect_user_context_sources,
    _is_generic_role_label,
)

# -- stream --
from app.services.es_review.stream import (
    _build_keyword_sources,
    _queue_progress_event,
    _stream_final_rewrite,
    _stream_source_links,
)
from app.services.es_review.source_policy import (
    _filter_verified_company_rag_sources,
    _format_rejected_source_log_lines,
    _format_source_log_lines,
    _template_source_family_priority_name,
)
from app.services.es_review.template_context import build_effective_template_context
from app.services.es_review.tracing import _append_rewrite_attempt_trace

# -- prompts --
from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    build_template_rewrite_prompt,
    build_template_fallback_rewrite_prompt,
    get_template_company_grounding_policy,
    get_template_default_grounding_level,
    grounding_level_to_policy,
    resolve_length_control_profile,
)
from app.prompts.es_templates._focus_modes import FocusModeContext
from app.prompts.es_templates._length_control import compute_shortfall_delta_band
from app.prompts.reference_es import (
    load_reference_examples,
    build_reference_quality_profile,
    build_reference_quality_block,
)
from app.utils.es_template_classifier import classify_es_question

logger = get_logger(__name__)

# Type aliases matching es_review.py
ReviewJSONCaller = Callable[..., Awaitable[Any]]
ReviewTextCaller = Callable[..., Awaitable[Any]]


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
    progress_queue: "Any | None" = None,
) -> ReviewResponse:
    """Run the ES review use case without depending on the FastAPI router."""
    ctx = await prepare_review_context(
        request=request,
        rag_sources=rag_sources,
        company_rag_available=company_rag_available,
        json_caller=json_caller,
        text_caller=text_caller,
        review_feature=review_feature,
        llm_provider=llm_provider,
        llm_model=llm_model,
        review_variant=review_variant,
        grounding_mode=grounding_mode,
        triggered_enrichment=triggered_enrichment,
        enrichment_completed=enrichment_completed,
        enrichment_sources_added=enrichment_sources_added,
        injection_risk=injection_risk,
        progress_queue=progress_queue,
    )

    loop_result = await execute_rewrite_loop(ctx)
    recovery = await execute_recovery_pipeline(ctx, loop_result)
    return await assemble_review_response(ctx, loop_result, recovery)


def _get_default_grounding_level(template_type: str) -> str:
    return get_template_default_grounding_level(template_type)


def _get_company_grounding_policy(template_type: str) -> str:
    return get_template_company_grounding_policy(template_type)


def _resolve_effective_grounding_level(
    *,
    template_type: str,
    classifier_grounding_level: str | None,
    char_max: int | None,
    evidence_coverage_level: str,
    rag_available: bool,
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
    if not rag_available and level in {"standard", "deep"}:
        level = lower(level)
    if evidence_coverage_level == "weak" and level in {"standard", "deep"}:
        level = lower(level)
    if evidence_coverage_level == "none" and level in {"standard", "deep"}:
        level = "light"
    return level


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


# ---------------------------------------------------------------------------
# Stage 1: prepare_review_context
# ---------------------------------------------------------------------------

async def prepare_review_context(
    *,
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
    progress_queue: "Any | None" = None,
) -> ReviewContext:
    """Build the full ReviewContext: classification, grounding, evidence, references."""
    if json_caller is None:
        json_caller = _default_call_llm_with_error
    if text_caller is None:
        text_caller = _default_call_llm_text_with_error
    template_request = request.template_request
    if not template_request:
        raise ValueError("template_request is required")

    template_type = template_request.template_type
    if template_type not in TEMPLATE_DEFS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template type: {template_type}. Available: {list(TEMPLATE_DEFS.keys())}",
        )

    # -- Classification --
    classification = classify_es_question(template_request.question)
    request_compound_secondary_types = (
        list(template_request.compound_secondary_types or [])
        or list(template_request.secondary_template_types or [])
    )
    request_is_compound = (
        bool(template_request.is_compound)
        or bool(request_compound_secondary_types)
        or bool(template_request.compound_variant)
        or bool(template_request.compound_pattern_id)
    )
    effective_template_ctx = build_effective_template_context(
        classification,
        primary_type_override=template_type,
        secondary_type_overrides=request_compound_secondary_types,
        variant_override=template_request.compound_variant,
        pattern_id_override=template_request.compound_pattern_id,
        is_compound_override=request_is_compound or None,
    )
    classification_confidence = (
        template_request.inferred_confidence or classification.confidence
    )
    secondary_candidate_pool = [
        *list(template_request.secondary_template_types or []),
        *list(effective_template_ctx.secondary_types or []),
        *list(classification.secondary_candidates or []),
    ]
    classification_secondary_candidates = []
    for candidate in secondary_candidate_pool:
        if candidate and candidate != template_type and candidate not in classification_secondary_candidates:
            classification_secondary_candidates.append(candidate)
    classification_rationale = (
        template_request.classification_rationale or classification.rationale
    )
    recommended_grounding_level = (
        template_request.recommended_grounding_level
        or effective_template_ctx.effective_grounding_level
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

    # -- Grounding setup --
    rag_profile_type = effective_template_ctx.rag_profile_type
    grounding_template_type = rag_profile_type if effective_template_ctx.requires_company_rag else template_type
    company_grounding = (
        "required"
        if effective_template_ctx.requires_company_rag
        else _get_company_grounding_policy(template_type)
    )
    effective_role_name = (
        request.role_context.primary_role if request.role_context else None
    ) or template_request.role_name

    char_min = template_request.char_min
    char_max = template_request.char_max

    # -- User facts --
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

    # -- RAG source verification --
    verified_rag_sources, rejected_rag_sources, has_mismatched_company_sources = (
        _filter_verified_company_rag_sources(
            rag_sources,
            company_name=template_request.company_name,
        )
    )
    effective_company_rag_available = company_rag_available and bool(verified_rag_sources)
    effective_grounding_mode = grounding_mode
    effective_grounding_level = _resolve_effective_grounding_level(
        template_type=grounding_template_type,
        classifier_grounding_level=recommended_grounding_level,
        char_max=char_max,
        evidence_coverage_level="none",
        rag_available=effective_company_rag_available,
    )
    effective_company_grounding = grounding_level_to_policy(effective_grounding_level)
    if has_mismatched_company_sources:
        effective_grounding_level = "light"
        effective_company_grounding = grounding_level_to_policy(effective_grounding_level)
        effective_grounding_mode = "company_general" if verified_rag_sources else "none"

    # -- Company evidence cards --
    company_evidence_cards = _build_company_evidence_cards(
        verified_rag_sources,
        template_type=rag_profile_type,
        question=template_request.question,
        answer=template_request.answer,
        role_name=effective_role_name,
        intern_name=template_request.intern_name,
        grounding_mode=effective_grounding_mode,
        user_priority_urls=user_priority_urls,
    )
    evidence_coverage_level, weak_evidence_notice = _assess_company_evidence_coverage(
        template_type=rag_profile_type,
        role_name=effective_role_name,
        company_rag_available=effective_company_rag_available,
        company_evidence_cards=company_evidence_cards,
        grounding_mode=effective_grounding_mode,
    )
    effective_grounding_level = _resolve_effective_grounding_level(
        template_type=grounding_template_type,
        classifier_grounding_level=recommended_grounding_level,
        char_max=char_max,
        evidence_coverage_level=evidence_coverage_level,
        rag_available=effective_company_rag_available,
    )
    if has_mismatched_company_sources:
        effective_grounding_level = "light"
    effective_company_grounding = grounding_level_to_policy(effective_grounding_level)
    grounding_repair_applied = (
        effective_grounding_level != recommended_grounding_level
        or has_mismatched_company_sources
    )
    prompt_company_evidence_cards = company_evidence_cards

    # -- Reference examples --
    reference_examples = load_reference_examples(
        template_type,
        char_max=char_max,
        company_name=template_request.company_name,
        max_items=3,
    )
    reference_es_mode = "quality_profile_only"
    if settings.reference_es_rag_enabled:
        semantic_reference_examples = await retrieve_reference_es_semantic(
            template_type,
            industry=template_request.industry,
            char_max=char_max,
            query_text=template_request.answer,
            top_k=3,
        )
        if semantic_reference_examples:
            reference_examples = semantic_reference_examples
            reference_es_mode = "semantic_enabled"
        else:
            reference_es_mode = "semantic_shadow"
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
    reference_outline_used = "\u3010\u53c2\u8003ES\u304b\u3089\u62bd\u51fa\u3057\u305f\u9aa8\u5b50\u3011" in reference_quality_block
    logic_patterns_used = "論理アプローチ" in reference_quality_block
    logic_patterns_confidence: str | None = None
    if logic_patterns_used:
        from app.prompts.logic_patterns import CONFIDENCE_MAP

        logic_patterns_confidence = CONFIDENCE_MAP.get(template_type)

    # -- Logging --
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

    use_tight_length_control = _uses_tight_length_control(
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        review_variant=review_variant,
    )

    retrieval_profile_name = _template_source_family_priority_name(rag_profile_type)
    priority_source_match_count = sum(
        1
        for source in verified_rag_sources
        if str(source.get("source_url") or "") in user_priority_urls
    )

    return ReviewContext(
        template_type=template_type,
        template_request=template_request,
        request=request,
        json_caller=json_caller,
        text_caller=text_caller,
        review_feature=review_feature,
        llm_provider=llm_provider,
        llm_model=llm_model,
        review_variant=review_variant,
        injection_risk=injection_risk,
        progress_queue=progress_queue,
        classification_confidence=classification_confidence,
        classification_secondary_candidates=list(classification_secondary_candidates),
        classification_rationale=classification_rationale,
        classification_hints=classification_hints,
        misclassification_recovery_applied=misclassification_recovery_applied,
        recommended_grounding_level=recommended_grounding_level,
        company_grounding=company_grounding,
        effective_role_name=effective_role_name,
        effective_grounding_mode=effective_grounding_mode,
        effective_grounding_level=effective_grounding_level,
        effective_company_grounding=effective_company_grounding,
        effective_company_rag_available=effective_company_rag_available,
        grounding_repair_applied=grounding_repair_applied,
        has_mismatched_company_sources=has_mismatched_company_sources,
        char_min=char_min,
        char_max=char_max,
        prompt_user_facts=prompt_user_facts,
        prompt_company_evidence_cards=prompt_company_evidence_cards,
        verified_rag_sources=verified_rag_sources,
        rejected_rag_sources=rejected_rag_sources,
        evidence_coverage_level=evidence_coverage_level,
        weak_evidence_notice=weak_evidence_notice,
        reference_examples=reference_examples,
        reference_quality_profile=reference_quality_profile,
        reference_quality_block=reference_quality_block,
        reference_outline_used=reference_outline_used,
        reference_es_mode=reference_es_mode,
        logic_patterns_used=logic_patterns_used,
        logic_patterns_confidence=logic_patterns_confidence,
        generic_role_mode=generic_role_mode,
        user_priority_urls=user_priority_urls,
        use_tight_length_control=use_tight_length_control,
        review_token_usage=review_token_usage,
        triggered_enrichment=triggered_enrichment,
        enrichment_completed=enrichment_completed,
        enrichment_sources_added=enrichment_sources_added,
        retrieval_profile_name=retrieval_profile_name,
        priority_source_match_count=priority_source_match_count,
        effective_template_ctx=effective_template_ctx,
    )


# ---------------------------------------------------------------------------
# Stage 2: execute_rewrite_loop
# ---------------------------------------------------------------------------

def _has_length_and_non_length_failure(codes: list[str] | None) -> bool:
    code_set = set(codes or [])
    return bool(code_set & {"under_min", "over_max"}) and bool(
        code_set - {"under_min", "over_max"}
    )


_SAFE_REWRITE_BLOCK_CODES = frozenset({
    "empty",
    "company_reference_in_companyless",
    "fact_preservation",
})


_REWRITE_FAILURE_SEVERITY: dict[str, int] = {
    "empty": 4,
    "fragment": 4,
    "company_reference_in_companyless": 3,
    "fact_preservation": 3,
    "hallucination": 1,
}


def _rewrite_candidate_rank(
    failure_codes: list[str] | None,
    *,
    distance: int,
) -> tuple[int, int]:
    severity = max(
        (_REWRITE_FAILURE_SEVERITY.get(code, 0) for code in (failure_codes or [])),
        default=0,
    )
    return severity, distance


def _should_use_safe_rewrite(
    *,
    attempt: int,
    total_attempts: int,
    best_rejected_candidate: str,
    failure_codes: list[str] | None,
) -> bool:
    code_set = set(failure_codes or [])
    return (
        attempt == total_attempts - 1
        and bool(best_rejected_candidate)
        and _has_length_and_non_length_failure(failure_codes)
        and not bool(code_set & _SAFE_REWRITE_BLOCK_CODES)
    )


async def execute_rewrite_loop(ctx: ReviewContext) -> RewriteLoopResult:
    """Run the main rewrite attempt loop (up to N retries)."""
    result = RewriteLoopResult()
    improvement_payload: list[dict[str, Any]] = []

    retry_reason = ""
    last_hallucination_warnings: list[dict[str, str]] = []

    template_request = ctx.template_request
    density = compute_information_density(template_request.answer)
    profile = apply_information_tier_adjustments(STRICT_PROFILE, density.tier)
    ctx.validation_profile = profile
    ctx.information_density = {
        "char_count": density.char_count,
        "fact_count": density.fact_count,
        "score": density.score,
        "tier": density.tier,
    }

    total_attempts = profile.max_retry
    effective_template_checks = dict(
        (getattr(ctx.effective_template_ctx, "merged_spec", {}) or {}).get(
            "evaluation_checks"
        )
        or {}
    )

    for attempt in range(total_attempts):
        result.executed_rewrite_attempts = attempt + 1
        if attempt == 0:
            focus_modes = ["normal"]
            focus_mode = "normal"
        else:
            atomic_focus_modes = _resolve_rewrite_focus_modes(
                retry_code=result.retry_code,
                failure_codes=result.retry_failure_codes,
            )
            composite_mode = _select_composite_retry_mode(
                failure_codes=result.retry_failure_codes,
                already_used=result.composite_retry_attempted,
            )
            if composite_mode:
                result.composite_retry_attempted = True
                result.composite_retry_modes.append(composite_mode)
                result.repair_dispatches.append(composite_mode)
                focus_modes = [composite_mode, *atomic_focus_modes[:2]]
                focus_mode = atomic_focus_modes[0] if atomic_focus_modes else composite_mode
            else:
                focus_modes = atomic_focus_modes
                focus_mode = focus_modes[0]
                result.repair_dispatches.append(_serialize_focus_modes(focus_modes))
        length_control_mode = _resolve_rewrite_length_control_mode(
            use_tight_length_control=ctx.use_tight_length_control,
            focus_mode=focus_mode,
        )
        retry_hints = _retry_hints_from_codes(
            retry_code=result.retry_code,
            failure_codes=result.retry_failure_codes,
            char_min=ctx.char_min,
            char_max=ctx.char_max,
            current_length=result.best_rejected_length or None,
            length_control_mode=length_control_mode,
            template_type=ctx.template_type,
        )
        if ctx.classification_hints:
            retry_hints = [*ctx.classification_hints, *retry_hints]
        if last_hallucination_warnings:
            hallucination_hints = _build_hallucination_retry_hints(
                last_hallucination_warnings
            )
            retry_hints = [*retry_hints, *hallucination_hints]
        if result.retry_code == "llm_quality" and retry_reason:
            retry_hints = [*retry_hints, retry_reason]
        length_shortfall = (
            max(0, ctx.char_min - result.best_rejected_length)
            if ctx.char_min and result.best_rejected_length and result.best_rejected_length < ctx.char_min
            else None
        )
        latest_failed_length = (
            len(result.best_rejected_candidate) if result.best_rejected_candidate else None
        )
        delta_band = compute_shortfall_delta_band(
            char_min=ctx.char_min,
            current_length=latest_failed_length,
        )
        focus_mode_context = (
            FocusModeContext(
                char_min=ctx.char_min,
                char_max=ctx.char_max,
                current_length=latest_failed_length,
                shortfall=max(0, (ctx.char_min or 0) - latest_failed_length),
                delta_band=delta_band,
                template_type=ctx.template_type,
            )
            if delta_band and latest_failed_length is not None
            else None
        )
        rewrite_source_answer = template_request.answer
        use_safe_rewrite = _should_use_safe_rewrite(
            attempt=attempt,
            total_attempts=total_attempts,
            best_rejected_candidate=result.best_rejected_candidate,
            failure_codes=result.best_failure_codes,
        )
        length_profile = resolve_length_control_profile(
            ctx.char_min,
            ctx.char_max,
            stage=_length_profile_stage_from_mode(length_control_mode),
            original_len=len(rewrite_source_answer),
            llm_model=ctx.llm_model,
            latest_failed_len=result.best_rejected_length,
        )
        attempt_context = _select_rewrite_prompt_context(
            template_type=ctx.template_type,
            char_max=ctx.char_max,
            attempt=attempt,
            simplified_mode=False,
            length_control_mode=length_control_mode,
            prompt_user_facts=ctx.prompt_user_facts,
            company_evidence_cards=ctx.prompt_company_evidence_cards,
            improvement_payload=improvement_payload,
            reference_quality_block=ctx.reference_quality_block,
            evidence_coverage_level=ctx.evidence_coverage_level,
            effective_company_grounding=ctx.effective_company_grounding,
        )
        if use_safe_rewrite:
            result.safe_rewrite_triggered = True
            result.safe_rewrite_reason = result.best_retry_code or "generic"
            system_prompt, user_prompt = build_template_fallback_rewrite_prompt(
                template_type=ctx.template_type,
                company_name=template_request.company_name,
                industry=template_request.industry,
                question=template_request.question,
                answer=template_request.answer,
                char_min=ctx.char_min,
                char_max=ctx.char_max,
                company_evidence_cards=attempt_context["company_evidence_cards"],
                has_rag=ctx.effective_company_rag_available,
                allowed_user_facts=attempt_context["prompt_user_facts"],
                intern_name=template_request.intern_name,
                role_name=ctx.effective_role_name,
                grounding_mode=ctx.effective_grounding_mode,
                retry_hints=retry_hints,
                reference_quality_block=attempt_context["reference_quality_block"],
                generic_role_mode=ctx.generic_role_mode,
                evidence_coverage_level=ctx.evidence_coverage_level,
                length_control_mode=length_control_mode,
                length_shortfall=length_shortfall,
                focus_mode=focus_mode,
                focus_modes=focus_modes,
                company_grounding_override=ctx.effective_company_grounding,
                grounding_level_override=ctx.effective_grounding_level,
                llm_model=ctx.llm_model,
                latest_failed_length=result.best_rejected_length,
                template_spec_override=getattr(ctx.effective_template_ctx, "merged_spec", None),
            )
        else:
            system_prompt, user_prompt = build_template_rewrite_prompt(
                template_type=ctx.template_type,
                company_name=template_request.company_name,
                industry=template_request.industry,
                question=template_request.question,
                answer=rewrite_source_answer,
                char_min=ctx.char_min,
                char_max=ctx.char_max,
                company_evidence_cards=attempt_context["company_evidence_cards"],
                has_rag=ctx.effective_company_rag_available,
                allowed_user_facts=attempt_context["prompt_user_facts"],
                intern_name=template_request.intern_name,
                role_name=ctx.effective_role_name,
                grounding_mode=ctx.effective_grounding_mode,
                retry_hints=retry_hints,
                reference_quality_block=attempt_context["reference_quality_block"],
                generic_role_mode=ctx.generic_role_mode,
                evidence_coverage_level=ctx.evidence_coverage_level,
                length_control_mode=length_control_mode,
                length_shortfall=length_shortfall,
                focus_mode=focus_mode,
                focus_modes=focus_modes,
                company_grounding_override=ctx.effective_company_grounding,
                grounding_level_override=ctx.effective_grounding_level,
                llm_model=ctx.llm_model,
                latest_failed_length=result.best_rejected_length,
                focus_mode_context=focus_mode_context,
                template_spec_override=getattr(ctx.effective_template_ctx, "merged_spec", None),
            )

        logger.info(
            "[ES添削/テンプレート] rewrite %s attempt=%s/%s mode=%s",
            ctx.template_type,
            attempt + 1,
            total_attempts,
            _serialize_focus_modes(focus_modes),
        )
        _queue_progress_event(
            ctx.progress_queue,
            step="rewrite",
            progress=52 if attempt == 0 else min(76, 52 + attempt * 5),
            label="改善案を作成中..." if focus_mode == "normal" else "失敗理由に合わせて再調整中...",
            sub_label="事実を保ちながら提出用の本文に整えています",
        )

        rewrite_result = await ctx.text_caller(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=_rewrite_max_tokens(
                ctx.char_max,
                focus_mode=focus_mode,
                review_variant=ctx.review_variant,
                llm_model=ctx.llm_model,
            ),
            temperature=_es_review_temperature(
                ctx.llm_model,
                stage="rewrite",
                focus_mode=focus_mode,
                shortfall_delta_band=delta_band,
            ),
            model=ctx.llm_model,
            feature=ctx.review_feature,
            disable_fallback=True,
        )
        _accumulate_review_token_usage(ctx.review_token_usage, rewrite_result, call_kind="text")

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
        validated_candidate, retry_code, retry_reason, retry_meta = await _validate_rewrite_combined(
            candidate,
            template_type=ctx.template_type,
            question=template_request.question,
            company_name=template_request.company_name,
            char_min=ctx.char_min,
            char_max=ctx.char_max,
            issues=[],
            role_name=ctx.effective_role_name,
            intern_name=template_request.intern_name,
            industry=template_request.industry,
            grounding_mode=ctx.effective_grounding_mode,
            effective_company_grounding_policy=ctx.effective_company_grounding,
            effective_grounding_level=ctx.effective_grounding_level,
            company_evidence_cards=ctx.prompt_company_evidence_cards,
            review_variant=ctx.review_variant,
            soft_validation_mode="strict",
            user_answer=template_request.answer,
            effective_template_checks=effective_template_checks,
            json_caller=ctx.json_caller,
            is_final_attempt=attempt == total_attempts - 1,
            profile=profile,
        )
        _append_rewrite_attempt_trace(
            result.rewrite_attempt_trace,
            text=str(candidate),
            accepted=bool(validated_candidate),
            retry_reason=retry_reason if not validated_candidate else "",
            attempt_index=attempt + 1,
            total_rewrite_attempts=total_attempts,
            prompt_mode=focus_mode,
            prompt_modes=focus_modes,
            stage="safe_rewrite" if use_safe_rewrite else "rewrite",
            failure_codes=[] if validated_candidate else list(retry_meta.get("failure_codes") or [retry_code]),
        )
        if not validated_candidate:
            failure_codes = list(retry_meta.get("failure_codes") or [retry_code])
            result.retry_failure_codes = failure_codes
            result.retry_code = retry_code
            normalized_candidate = _normalize_repaired_text(candidate)
            candidate_distance = _char_limit_distance(
                normalized_candidate,
                char_min=ctx.char_min,
                char_max=ctx.char_max,
            )
            candidate_rank = _rewrite_candidate_rank(failure_codes, distance=candidate_distance)
            best_rank = (
                None
                if result.best_rejected_distance is None
                else _rewrite_candidate_rank(
                    result.best_failure_codes,
                    distance=result.best_rejected_distance,
                )
            )
            if best_rank is None or candidate_rank <= best_rank:
                result.best_rejected_candidate = normalized_candidate
                result.best_rejected_length = len(result.best_rejected_candidate)
                result.best_rejected_distance = candidate_distance
                result.best_retry_code = _primary_retry_code(
                    retry_code=retry_code,
                    failure_codes=failure_codes,
                )
                result.best_failure_codes = failure_codes
                result.best_rejected_hallucination_warnings = list(
                    retry_meta.get("hallucination_warnings") or []
                )
            last_hallucination_warnings = list(
                retry_meta.get("hallucination_warnings") or []
            )
            primary_rc = _primary_retry_code(
                retry_code=retry_code,
                failure_codes=failure_codes,
            )
            result.accepted_length_failure_code = primary_rc
            result.attempt_failures.append(retry_reason)
            logger.warning(
                "[ES添削/テンプレート] rewrite %s attempt=%s/%s 失敗: %s",
                ctx.template_type,
                attempt + 1,
                total_attempts,
                _describe_retry_reason(retry_reason),
            )
            continue

        # -- accepted --
        result.final_rewrite = validated_candidate
        result.accepted_attempt = attempt + 1
        result.accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
        result.accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
        result.accepted_soft_min_floor_ratio = retry_meta.get("soft_min_floor_ratio")
        result.accepted_length_profile_id = length_profile.profile_id
        result.accepted_target_window_lower = length_profile.target_lower
        result.accepted_target_window_upper = length_profile.target_upper
        result.accepted_source_fill_ratio = length_profile.source_fill_ratio
        result.accepted_required_growth = length_profile.required_growth
        result.accepted_latest_failed_length = length_profile.latest_failed_length
        result.accepted_length_failure_code = None
        result.accepted_hallucination_warnings = list(
            retry_meta.get("hallucination_warnings") or []
        )
        result.rewrite_generation_mode = _serialize_focus_modes(focus_modes)
        if use_safe_rewrite:
            result.rewrite_generation_mode = "safe_rewrite"
        break

    return result


# ---------------------------------------------------------------------------
# Stage 3: execute_recovery_pipeline
# ---------------------------------------------------------------------------

async def execute_recovery_pipeline(
    ctx: ReviewContext,
    loop_result: RewriteLoopResult,
) -> RecoveryResult:
    """Fallback rewrite and best-effort adoption."""
    recovery = RecoveryResult()

    # If loop already succeeded, nothing to recover.
    if loop_result.final_rewrite:
        return recovery

    template_request = ctx.template_request

    # Carry over attempt_failures and trace from loop for final assembly.
    recovery.attempt_failures = list(loop_result.attempt_failures)
    recovery.rewrite_attempt_trace = list(loop_result.rewrite_attempt_trace)

    # -----------------------------------------------------------------------
    # Best-effort adoption
    # -----------------------------------------------------------------------
    if loop_result.best_rejected_candidate and _best_effort_rewrite_admissible(
        loop_result.best_rejected_candidate,
        template_type=ctx.template_type,
        company_name=template_request.company_name,
        char_max=ctx.char_max,
        primary_failure_code=loop_result.best_retry_code,
        failure_codes=loop_result.best_failure_codes,
        degraded_block_codes=(
            ctx.validation_profile.degraded_block_codes
            if ctx.validation_profile is not None
            else None
        ),
    ):
        recovery.final_rewrite = _coerce_degraded_rewrite_dearu_style(loop_result.best_rejected_candidate)
        recovery.rewrite_validation_status = "degraded"
        recovery.rewrite_validation_codes = list(
            loop_result.best_failure_codes
            or ([loop_result.best_retry_code] if loop_result.best_retry_code != "generic" else [])
        )
        recovery.rewrite_validation_user_hint = _rewrite_validation_degraded_hint(recovery.rewrite_validation_codes)
        recovery.accepted_hallucination_warnings = (
            loop_result.best_rejected_hallucination_warnings
        )
        recovery.rewrite_generation_mode = "degraded_best_effort"
        recovery.final_acceptance_source = "degraded_best_effort"
        recovery.accepted_attempt = loop_result.executed_rewrite_attempts
        degraded_profile = resolve_length_control_profile(
            ctx.char_min,
            ctx.char_max,
            stage="under_min_recovery" if loop_result.best_retry_code == "under_min" else "default",
            original_len=len(loop_result.best_rejected_candidate),
            llm_model=ctx.llm_model,
            latest_failed_len=len(loop_result.best_rejected_candidate),
        )
        recovery.accepted_length_profile_id = degraded_profile.profile_id
        recovery.accepted_target_window_lower = degraded_profile.target_lower
        recovery.accepted_target_window_upper = degraded_profile.target_upper
        recovery.accepted_source_fill_ratio = degraded_profile.source_fill_ratio
        recovery.accepted_required_growth = degraded_profile.required_growth
        recovery.accepted_latest_failed_length = len(loop_result.best_rejected_candidate)
        recovery.accepted_length_failure_code = loop_result.best_retry_code
        _append_rewrite_attempt_trace(
            recovery.rewrite_attempt_trace,
            stage="degraded_best_effort",
            text=recovery.final_rewrite,
            accepted=True,
            retry_reason="adopted_best_rejected_without_new_llm",
            failure_codes=recovery.rewrite_validation_codes,
        )
        logger.warning(
            "[ES添削/テンプレート] rewrite %s ベストエフォート採用: codes=%s",
            ctx.template_type,
            recovery.rewrite_validation_codes,
        )
        return recovery

    # -----------------------------------------------------------------------
    # Total failure
    # -----------------------------------------------------------------------
    retry_reason_final = loop_result.attempt_failures[-1] if loop_result.attempt_failures else ""
    record_parse_failure("es_review_template_rewrite", retry_reason_final)
    logger.error(
        "[ES添削/テンプレート] rewrite %s 最終失敗: %s / 履歴=%s",
        ctx.template_type,
        _describe_retry_reason(retry_reason_final),
        loop_result.attempt_failures,
    )
    detail: dict[str, Any] = {
        "error": GENERIC_REWRITE_VALIDATION_ERROR,
        "error_type": "validation",
        "provider": "template_rewrite",
    }
    if os.getenv("LIVE_ES_REVIEW_CAPTURE_DEBUG") == "1":
        detail["debug"] = {
            "last_retry_reason": retry_reason_final,
            "attempt_failures": loop_result.attempt_failures[-16:],
            "rewrite_attempt_trace": recovery.rewrite_attempt_trace,
        }
    raise HTTPException(status_code=422, detail=detail)


# ---------------------------------------------------------------------------
# Stage 4: assemble_review_response
# ---------------------------------------------------------------------------

async def assemble_review_response(
    ctx: ReviewContext,
    loop_result: RewriteLoopResult,
    recovery: RecoveryResult,
) -> ReviewResponse:
    """Log, stream final rewrite, and build ReviewResponse."""
    total_attempts = (
        ctx.validation_profile.max_retry
        if ctx.validation_profile is not None
        else _total_rewrite_attempts(ctx.review_variant)
    )

    # Determine which result set to use: recovery overrides loop when it produced a rewrite.
    if recovery.final_rewrite:
        final_rewrite = recovery.final_rewrite
        accepted_attempt = recovery.accepted_attempt
        accepted_length_policy = recovery.accepted_length_policy
        accepted_length_shortfall = recovery.accepted_length_shortfall
        accepted_soft_min_floor_ratio = recovery.accepted_soft_min_floor_ratio
        accepted_length_profile_id = recovery.accepted_length_profile_id
        accepted_target_window_lower = recovery.accepted_target_window_lower
        accepted_target_window_upper = recovery.accepted_target_window_upper
        accepted_source_fill_ratio = recovery.accepted_source_fill_ratio
        accepted_required_growth = recovery.accepted_required_growth
        accepted_latest_failed_length = recovery.accepted_latest_failed_length
        accepted_length_failure_code = recovery.accepted_length_failure_code
        accepted_ai_smell_warnings: list[dict[str, str]] = []
        rewrite_generation_mode = recovery.rewrite_generation_mode
        rewrite_validation_status = recovery.rewrite_validation_status
        rewrite_validation_codes = recovery.rewrite_validation_codes
        rewrite_validation_user_hint = recovery.rewrite_validation_user_hint
        fallback_triggered = recovery.fallback_triggered
        fallback_reason = recovery.fallback_reason
        safe_rewrite_triggered = loop_result.safe_rewrite_triggered
        safe_rewrite_reason = loop_result.safe_rewrite_reason
        length_fix_attempted = recovery.length_fix_attempted
        length_fix_result = recovery.length_fix_result
        attempt_failures = recovery.attempt_failures
        rewrite_attempt_trace = recovery.rewrite_attempt_trace
        repair_dispatches = [
            *loop_result.repair_dispatches,
            *recovery.repair_dispatches,
        ]
        composite_retry_modes = [
            *loop_result.composite_retry_modes,
            *recovery.composite_retry_modes,
        ]
        final_acceptance_source = recovery.final_acceptance_source
    else:
        final_rewrite = loop_result.final_rewrite
        accepted_attempt = loop_result.accepted_attempt
        accepted_length_policy = loop_result.accepted_length_policy
        accepted_length_shortfall = loop_result.accepted_length_shortfall
        accepted_soft_min_floor_ratio = loop_result.accepted_soft_min_floor_ratio
        accepted_length_profile_id = loop_result.accepted_length_profile_id
        accepted_target_window_lower = loop_result.accepted_target_window_lower
        accepted_target_window_upper = loop_result.accepted_target_window_upper
        accepted_source_fill_ratio = loop_result.accepted_source_fill_ratio
        accepted_required_growth = loop_result.accepted_required_growth
        accepted_latest_failed_length = loop_result.accepted_latest_failed_length
        accepted_length_failure_code = loop_result.accepted_length_failure_code
        accepted_ai_smell_warnings = []
        rewrite_generation_mode = loop_result.rewrite_generation_mode
        rewrite_validation_status = loop_result.rewrite_validation_status
        rewrite_validation_codes = loop_result.rewrite_validation_codes
        rewrite_validation_user_hint = loop_result.rewrite_validation_user_hint
        fallback_triggered = False
        fallback_reason = None
        safe_rewrite_triggered = loop_result.safe_rewrite_triggered
        safe_rewrite_reason = loop_result.safe_rewrite_reason
        length_fix_attempted = False
        length_fix_result = "not_needed"
        attempt_failures = loop_result.attempt_failures
        rewrite_attempt_trace = loop_result.rewrite_attempt_trace
        repair_dispatches = list(loop_result.repair_dispatches)
        composite_retry_modes = list(loop_result.composite_retry_modes)
        final_acceptance_source = (
            "safe_rewrite" if loop_result.safe_rewrite_triggered else "rewrite"
        )

    total_logged_attempts = total_attempts
    logger.info(
        "[ES添削/テンプレート] rewrite success: template=%s attempt=%s/%s chars=%s",
        ctx.template_type,
        accepted_attempt,
        total_logged_attempts,
        len(final_rewrite),
    )
    logger.info(
        "[ES添削/テンプレート] final rewrite:\n%s",
        final_rewrite,
    )
    _queue_progress_event(
        ctx.progress_queue,
        step="rewrite",
        progress=80,
        label="改善案を表示中...",
        sub_label="確定した改善案をそのまま表示しています",
    )
    await _stream_final_rewrite(ctx.progress_queue, final_rewrite)

    _queue_progress_event(
        ctx.progress_queue,
        step="sources",
        progress=90,
        label="出典リンクを表示中...",
        sub_label="企業情報の参照元を整理しています",
    )

    template_review = _build_template_review_response(
        template_type=ctx.template_type,
        rewrite_text=final_rewrite,
        rag_sources=ctx.verified_rag_sources,
        request=ctx.request,
    )
    logger.info(
        "[ES添削/テンプレート] sources:\n%s",
        _format_source_log_lines(template_review.keyword_sources),
    )
    await _stream_source_links(ctx.progress_queue, template_review.keyword_sources)

    # -- Compute quality score fields from final rewrite --
    _final_text = final_rewrite
    _sentences = [s.strip() for s in _re.split(r"(?<=[。！？])", _final_text) if s.strip()]
    _rewrite_sentence_count = len(_sentences)
    _opening_conclusion_chars = len(_sentences[0]) if _sentences else 0
    _concrete_count = len(_re.findall(
        r"\d+[人名件%％倍回日月年時間分秒個社台冊本]|\d+", _final_text,
    ))
    _ai_smell_tier = 0
    _hallucination_warnings_for_tier = (
        recovery.accepted_hallucination_warnings if recovery.final_rewrite
        else loop_result.accepted_hallucination_warnings
    )
    _hallucination_result = _compute_hallucination_score(
        _hallucination_warnings_for_tier,
        template_type=ctx.template_type,
        tier2_threshold=(
            ctx.validation_profile.hallucination_tier2_threshold
            if ctx.validation_profile is not None
            else None
        ),
    )
    _hallucination_tier = int(_hallucination_result.get("tier", 0))
    _deep_grounding_meta = evaluate_deep_grounding_meta(
        final_rewrite,
        company_name=ctx.template_request.company_name,
        company_evidence_cards=ctx.prompt_company_evidence_cards,
    ) if ctx.effective_grounding_level == "deep" else {}
    effective_template_ctx = ctx.effective_template_ctx

    return ReviewResponse(
        rewrites=[final_rewrite],
        template_review=template_review,
        review_meta=_build_review_meta(
            ctx.request,
            llm_provider=ctx.llm_provider,
            llm_model=ctx.llm_model,
            review_variant=ctx.review_variant,
            grounding_mode=ctx.effective_grounding_mode,
            triggered_enrichment=ctx.triggered_enrichment,
            enrichment_completed=ctx.enrichment_completed,
            enrichment_sources_added=ctx.enrichment_sources_added,
            injection_risk=ctx.injection_risk,
            rewrite_generation_mode=rewrite_generation_mode,
            repair_dispatch_count=len(repair_dispatches),
            repair_dispatches=repair_dispatches,
            composite_retry_modes=composite_retry_modes,
            final_acceptance_source=final_acceptance_source,
            rewrite_attempt_count=accepted_attempt,
            reference_es_count=len(ctx.reference_examples),
            reference_es_mode=ctx.reference_es_mode,
            reference_quality_profile_used=bool(ctx.reference_quality_block),
            reference_outline_used=ctx.reference_outline_used,
            reference_hint_count=len((ctx.reference_quality_profile or {}).get("quality_hints") or [])
            + len((ctx.reference_quality_profile or {}).get("conditional_hints") or []),
            reference_conditional_hints_applied=bool(
                (ctx.reference_quality_profile or {}).get("conditional_hints_applied")
            ),
            reference_profile_variance=(ctx.reference_quality_profile or {}).get("variance_band"),
            logic_patterns_used=ctx.logic_patterns_used,
            logic_patterns_confidence=ctx.logic_patterns_confidence,
            company_grounding_policy=ctx.company_grounding,
            effective_company_grounding_policy=ctx.effective_company_grounding,
            recommended_grounding_level=ctx.recommended_grounding_level,
            effective_grounding_level=ctx.effective_grounding_level,
            company_evidence_count=len(ctx.prompt_company_evidence_cards),
            company_evidence_verified_count=len(ctx.verified_rag_sources),
            company_evidence_rejected_count=len(ctx.rejected_rag_sources),
            company_grounding_safety_applied=ctx.has_mismatched_company_sources,
            evidence_coverage_level=ctx.evidence_coverage_level,
            weak_evidence_notice=ctx.weak_evidence_notice,
            selected_company_evidence_themes=[
                str(card.get("theme") or "").strip()
                for card in ctx.prompt_company_evidence_cards
                if str(card.get("theme") or "").strip()
            ],
            length_policy=accepted_length_policy,
            length_shortfall=accepted_length_shortfall,
            length_shortfall_bucket=_length_shortfall_bucket(
                char_min=ctx.char_min,
                latest_failed_length=accepted_latest_failed_length,
                length_failure_code=accepted_length_failure_code,
            ),
            soft_min_floor_ratio=accepted_soft_min_floor_ratio,
            length_fix_attempted=length_fix_attempted,
            length_fix_result=length_fix_result,
            rewrite_validation_status=rewrite_validation_status,
            rewrite_validation_codes=rewrite_validation_codes,
            rewrite_validation_user_hint=rewrite_validation_user_hint,
            classification_confidence=ctx.classification_confidence,
            classification_secondary_candidates=ctx.classification_secondary_candidates,
            classification_rationale=ctx.classification_rationale,
            misclassification_recovery_applied=ctx.misclassification_recovery_applied,
            fallback_triggered=fallback_triggered,
            fallback_reason=fallback_reason,
            safe_rewrite_triggered=safe_rewrite_triggered,
            safe_rewrite_reason=safe_rewrite_reason,
            grounding_repair_applied=ctx.grounding_repair_applied,
            is_compound=bool(getattr(effective_template_ctx, "is_compound", False)),
            compound_secondary_types=list(getattr(effective_template_ctx, "secondary_types", []) or []),
            compound_variant=getattr(effective_template_ctx, "variant", None),
            compound_pattern_id=getattr(effective_template_ctx, "pattern_id", None),
            deep_grounding_proper_noun_found=bool(
                _deep_grounding_meta.get("deep_grounding_proper_noun_found")
            ),
            deep_grounding_connection_found=bool(
                _deep_grounding_meta.get("deep_grounding_connection_found")
            ),
            length_profile_id=accepted_length_profile_id,
            target_window_lower=accepted_target_window_lower,
            target_window_upper=accepted_target_window_upper,
            source_fill_ratio=accepted_source_fill_ratio,
            required_growth=accepted_required_growth,
            latest_failed_length=accepted_latest_failed_length,
            length_failure_code=accepted_length_failure_code,
            unfinished_tail_detected=_has_unfinished_tail(final_rewrite),
            retrieval_profile_name=ctx.retrieval_profile_name,
            priority_source_match_count=ctx.priority_source_match_count,
            token_usage=_maybe_review_token_usage(ctx.review_token_usage),
            rewrite_rejection_reasons=list(attempt_failures),
            rewrite_attempt_trace=rewrite_attempt_trace,
            rewrite_total_rewrite_attempts=total_attempts,
            ai_smell_warnings=accepted_ai_smell_warnings,
            ai_smell_tier=_ai_smell_tier,
            hallucination_tier=_hallucination_tier,
            validation_profile_name=(
                ctx.validation_profile.name
                if ctx.validation_profile is not None
                else "strict"
            ),
            information_density=ctx.information_density,
            concrete_marker_count=_concrete_count,
            opening_conclusion_chars=_opening_conclusion_chars,
            rewrite_sentence_count=_rewrite_sentence_count,
        ),
    )
