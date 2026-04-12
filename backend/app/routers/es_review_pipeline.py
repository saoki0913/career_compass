"""Pipeline facade for ES review orchestration.

Self-contained token-usage helpers and meta builders live here directly. The
heavier orchestration entry points (`_generate_review_progress`,
`_build_review_streaming_response`, etc.) are still defined in `es_review.py`
and lazy-resolved here to avoid circular imports.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any, Optional

from app.routers.es_review_grounding import _collect_user_context_sources
from app.routers.es_review_models import (
    ReviewMeta,
    ReviewRequest,
    ReviewTokenUsage,
    RoleContext,
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
    recommended_grounding_level: str = "none",
    effective_grounding_level: str = "none",
    company_evidence_count: int = 0,
    company_evidence_verified_count: int = 0,
    company_evidence_rejected_count: int = 0,
    company_grounding_safety_applied: bool = False,
    evidence_coverage_level: str = "none",
    weak_evidence_notice: bool = False,
    selected_company_evidence_themes: list[str] | None = None,
    length_policy: str = "strict",
    length_shortfall: int = 0,
    length_shortfall_bucket: str | None = None,
    soft_min_floor_ratio: float | None = None,
    length_fix_attempted: bool = False,
    length_fix_result: str = "not_needed",
    token_usage: Optional[ReviewTokenUsage] = None,
    rewrite_validation_status: str = "strict_ok",
    rewrite_validation_codes: list[str] | None = None,
    rewrite_validation_user_hint: str | None = None,
    classification_confidence: str = "low",
    classification_secondary_candidates: list[str] | None = None,
    classification_rationale: str | None = None,
    misclassification_recovery_applied: bool = False,
    fallback_triggered: bool = False,
    fallback_reason: str | None = None,
    grounding_repair_applied: bool = False,
    length_profile_id: str | None = None,
    target_window_lower: int | None = None,
    target_window_upper: int | None = None,
    source_fill_ratio: float | None = None,
    required_growth: int = 0,
    latest_failed_length: int = 0,
    length_failure_code: str | None = None,
    unfinished_tail_detected: bool = False,
    retrieval_profile_name: str | None = None,
    priority_source_match_count: int = 0,
    rewrite_rejection_reasons: list[str] | None = None,
    rewrite_attempt_trace: list[dict[str, Any]] | None = None,
    rewrite_total_rewrite_attempts: int = 0,
    ai_smell_warnings: list[dict[str, str]] | None = None,
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
        recommended_grounding_level=recommended_grounding_level,
        effective_grounding_level=effective_grounding_level,
        company_evidence_count=company_evidence_count,
        company_evidence_verified_count=company_evidence_verified_count,
        company_evidence_rejected_count=company_evidence_rejected_count,
        company_grounding_safety_applied=company_grounding_safety_applied,
        evidence_coverage_level=evidence_coverage_level,
        weak_evidence_notice=weak_evidence_notice,
        selected_company_evidence_themes=list(selected_company_evidence_themes or []),
        injection_risk=injection_risk,
        user_context_sources=_collect_user_context_sources(request),
        hallucination_guard_mode="strict",
        rewrite_generation_mode=rewrite_generation_mode,
        classification_confidence=classification_confidence,
        classification_secondary_candidates=list(classification_secondary_candidates or []),
        classification_rationale=classification_rationale,
        misclassification_recovery_applied=misclassification_recovery_applied,
        rewrite_attempt_count=rewrite_attempt_count,
        length_policy=length_policy,
        length_shortfall=length_shortfall,
        length_shortfall_bucket=length_shortfall_bucket,
        soft_min_floor_ratio=soft_min_floor_ratio,
        length_fix_attempted=length_fix_attempted,
        length_fix_result=length_fix_result,
        rewrite_validation_status=rewrite_validation_status,
        rewrite_validation_codes=list(rewrite_validation_codes or []),
        rewrite_validation_user_hint=rewrite_validation_user_hint,
        fallback_triggered=fallback_triggered,
        fallback_reason=fallback_reason,
        grounding_repair_applied=grounding_repair_applied,
        length_profile_id=length_profile_id,
        target_window_lower=target_window_lower,
        target_window_upper=target_window_upper,
        source_fill_ratio=source_fill_ratio,
        required_growth=required_growth,
        latest_failed_length=latest_failed_length,
        length_failure_code=length_failure_code,
        unfinished_tail_detected=unfinished_tail_detected,
        retrieval_profile_name=retrieval_profile_name,
        priority_source_match_count=priority_source_match_count,
        token_usage=token_usage,
        rewrite_rejection_reasons=list(rewrite_rejection_reasons or []),
        rewrite_attempt_trace=list(rewrite_attempt_trace or []),
        rewrite_total_rewrite_attempts=rewrite_total_rewrite_attempts,
        ai_smell_warnings=list(ai_smell_warnings or []),
    )


def _router():
    return import_module("app.routers.es_review")


async def _generate_review_progress(*args, **kwargs):  # type: ignore[override]
    async for event in _router()._generate_review_progress_impl(*args, **kwargs):
        yield event


def _build_review_streaming_response(*args, **kwargs):  # type: ignore[override]
    return _router()._build_review_streaming_response_impl(*args, **kwargs)


async def review_section_with_template(*args, **kwargs):  # type: ignore[override]
    return await _router()._review_section_with_template_impl(*args, **kwargs)


def _build_template_review_response(*args, **kwargs):  # type: ignore[override]
    return _router()._build_template_review_response_impl(*args, **kwargs)


__all__ = [
    "_accumulate_review_token_usage",
    "_build_review_meta",
    "_build_review_streaming_response",
    "_build_template_review_response",
    "_empty_review_token_usage",
    "_evaluate_template_rag_availability",
    "_generate_review_progress",
    "_maybe_review_token_usage",
    "review_section_with_template",
]
