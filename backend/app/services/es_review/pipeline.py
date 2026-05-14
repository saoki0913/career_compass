"""Pipeline helpers for ES review orchestration."""

from __future__ import annotations

from typing import Any, Optional

from app.services.es_review.grounding import _collect_user_context_sources
from app.services.es_review.models import (
    ClassificationInfo,
    GroundingInfo,
    LLMInfo,
    LengthInfo,
    QualityInfo,
    ReviewMeta,
    ReviewRequest,
    ReviewTokenUsage,
    RetryInfo,
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
    repair_dispatch_count: int = 0,
    repair_dispatches: list[str] | None = None,
    composite_retry_modes: list[str] | None = None,
    final_acceptance_source: str = "rewrite",
    rewrite_attempt_count: int = 0,
    reference_es_count: int = 0,
    reference_es_mode: str = "quality_profile_only",
    reference_quality_profile_used: bool = False,
    reference_outline_used: bool = False,
    reference_hint_count: int = 0,
    reference_conditional_hints_applied: bool = False,
    reference_profile_variance: str | None = None,
    logic_patterns_used: bool = False,
    logic_patterns_confidence: str | None = None,
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
    token_usage: Optional[ReviewTokenUsage] = None,
    rewrite_validation_status: str = "strict_ok",
    rewrite_validation_codes: list[str] | None = None,
    rewrite_validation_user_hint: str | None = None,
    llm_quality_failed_checks: list[str] | None = None,
    llm_quality_warned_checks: list[str] | None = None,
    llm_quality_lenient_pass: bool = False,
    llm_quality_failure_count: int = 0,
    classification_confidence: str = "low",
    classification_secondary_candidates: list[str] | None = None,
    classification_rationale: str | None = None,
    misclassification_recovery_applied: bool = False,
    fallback_triggered: bool = False,
    fallback_reason: str | None = None,
    safe_rewrite_triggered: bool = False,
    safe_rewrite_reason: str | None = None,
    grounding_repair_applied: bool = False,
    is_compound: bool = False,
    compound_secondary_types: list[str] | None = None,
    compound_variant: str | None = None,
    compound_pattern_id: str | None = None,
    deep_grounding_proper_noun_found: bool = False,
    deep_grounding_connection_found: bool = False,
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
    ai_smell_tier: int = 0,
    hallucination_tier: int = 0,
    validation_profile_name: str = "strict",
    information_density: dict[str, Any] | None = None,
    concrete_marker_count: int = 0,
    opening_conclusion_chars: int = 0,
    rewrite_sentence_count: int = 0,
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
        reference_es_mode=reference_es_mode,
        reference_quality_profile_used=reference_quality_profile_used,
        reference_outline_used=reference_outline_used,
        reference_hint_count=reference_hint_count,
        reference_conditional_hints_applied=reference_conditional_hints_applied,
        reference_profile_variance=reference_profile_variance,
        logic_patterns_used=logic_patterns_used,
        logic_patterns_confidence=logic_patterns_confidence,
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
        hallucination_guard_mode="hard_block",
        rewrite_generation_mode=rewrite_generation_mode,
        repair_dispatch_count=repair_dispatch_count,
        repair_dispatches=list(repair_dispatches or []),
        composite_retry_modes=list(composite_retry_modes or []),
        final_acceptance_source=final_acceptance_source,
        classification_confidence=classification_confidence,
        classification_secondary_candidates=list(classification_secondary_candidates or []),
        classification_rationale=classification_rationale,
        misclassification_recovery_applied=misclassification_recovery_applied,
        rewrite_attempt_count=rewrite_attempt_count,
        length_policy=length_policy,
        length_shortfall=length_shortfall,
        length_shortfall_bucket=length_shortfall_bucket,
        soft_min_floor_ratio=soft_min_floor_ratio,
        rewrite_validation_status=rewrite_validation_status,
        rewrite_validation_codes=list(rewrite_validation_codes or []),
        rewrite_validation_user_hint=rewrite_validation_user_hint,
        llm_quality_failed_checks=list(llm_quality_failed_checks or []),
        llm_quality_warned_checks=list(llm_quality_warned_checks or []),
        llm_quality_lenient_pass=llm_quality_lenient_pass,
        llm_quality_failure_count=llm_quality_failure_count,
        fallback_triggered=fallback_triggered,
        fallback_reason=fallback_reason,
        safe_rewrite_triggered=safe_rewrite_triggered,
        safe_rewrite_reason=safe_rewrite_reason,
        grounding_repair_applied=grounding_repair_applied,
        is_compound=is_compound,
        compound_secondary_types=list(compound_secondary_types or []),
        compound_variant=compound_variant,
        compound_pattern_id=compound_pattern_id,
        deep_grounding_proper_noun_found=deep_grounding_proper_noun_found,
        deep_grounding_connection_found=deep_grounding_connection_found,
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
        ai_smell_tier=ai_smell_tier,
        hallucination_tier=hallucination_tier,
        validation_profile_name=validation_profile_name,
        information_density=dict(information_density or {}),
        concrete_marker_count=concrete_marker_count,
        opening_conclusion_chars=opening_conclusion_chars,
        rewrite_sentence_count=rewrite_sentence_count,
        llm_info=LLMInfo(
            provider=llm_provider,
            model=llm_model,
            model_alias=request.llm_model,
        ),
        quality_info=QualityInfo(
            ai_smell_tier=ai_smell_tier,
            hallucination_tier=hallucination_tier,
            validation_status=rewrite_validation_status,
            validation_codes=list(rewrite_validation_codes or []),
            validation_user_hint=rewrite_validation_user_hint,
            llm_quality_failed_checks=list(llm_quality_failed_checks or []),
            llm_quality_warned_checks=list(llm_quality_warned_checks or []),
            llm_quality_lenient_pass=llm_quality_lenient_pass,
            llm_quality_failure_count=llm_quality_failure_count,
            validation_profile_name=validation_profile_name,
        ),
        grounding_info=GroundingInfo(
            mode=grounding_mode,
            company_grounding_policy=company_grounding_policy,
            effective_company_grounding_policy=effective_company_grounding_policy,
            recommended_level=recommended_grounding_level,
            effective_level=effective_grounding_level,
            evidence_count=company_evidence_count,
            evidence_verified_count=company_evidence_verified_count,
            evidence_rejected_count=company_evidence_rejected_count,
            safety_applied=company_grounding_safety_applied,
            evidence_coverage_level=evidence_coverage_level,
            weak_evidence_notice=weak_evidence_notice,
            selected_themes=list(selected_company_evidence_themes or []),
            repair_applied=grounding_repair_applied,
            deep_proper_noun_found=deep_grounding_proper_noun_found,
            deep_connection_found=deep_grounding_connection_found,
        ),
        classification_info=ClassificationInfo(
            confidence=classification_confidence,
            secondary_candidates=list(classification_secondary_candidates or []),
            rationale=classification_rationale,
            misclassification_recovery_applied=misclassification_recovery_applied,
        ),
        length_info=LengthInfo(
            policy=length_policy,
            shortfall=length_shortfall,
            shortfall_bucket=length_shortfall_bucket,
            soft_min_floor_ratio=soft_min_floor_ratio,
            profile_id=length_profile_id,
            target_window_lower=target_window_lower,
            target_window_upper=target_window_upper,
            source_fill_ratio=source_fill_ratio,
            required_growth=required_growth,
            latest_failed_length=latest_failed_length,
            failure_code=length_failure_code,
        ),
        retry_info=RetryInfo(
            attempt_count=rewrite_attempt_count,
            generation_mode=rewrite_generation_mode,
            repair_dispatch_count=repair_dispatch_count,
            repair_dispatches=list(repair_dispatches or []),
            composite_retry_modes=list(composite_retry_modes or []),
            fallback_triggered=fallback_triggered,
            fallback_reason=fallback_reason,
            safe_rewrite_triggered=safe_rewrite_triggered,
            safe_rewrite_reason=safe_rewrite_reason,
            final_acceptance_source=final_acceptance_source,
        ),
    )


__all__ = [
    "_accumulate_review_token_usage",
    "_build_review_meta",
    "_empty_review_token_usage",
    "_evaluate_template_rag_availability",
    "_maybe_review_token_usage",
]
