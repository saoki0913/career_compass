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

from app.utils.secure_logger import get_logger
from app.utils.telemetry import record_parse_failure
from app.routers.es_review_fact_guard import _compute_hallucination_score

# -- models --
from app.routers.es_review_models import (
    ReviewContext,
    ReviewRequest,
    ReviewResponse,
    ReviewTokenUsage,
    RewriteLoopResult,
    RecoveryResult,
    TemplateRequest,
)

# -- pipeline helpers --
from app.routers.es_review_pipeline import (
    _build_review_meta,
    _empty_review_token_usage,
    _accumulate_review_token_usage,
    _maybe_review_token_usage,
)

# -- validation --
from app.routers.es_review_validation import (
    _has_unfinished_tail,
    _normalize_repaired_text,
    _coerce_degraded_rewrite_dearu_style,
    _validate_rewrite_candidate,
    _char_limit_distance,
    _uses_tight_length_control,
    _compute_ai_smell_score,
)

# -- retry --
from app.routers.es_review_retry import (
    LENGTH_FIX_REWRITE_ATTEMPTS,
    _total_rewrite_attempts,
    _resolve_rewrite_focus_modes,
    _resolve_rewrite_length_control_mode,
    _retry_hints_from_codes,
    _es_review_temperature,
    _rewrite_max_tokens,
    _should_attempt_length_fix,
    _should_short_circuit_to_length_fix,
    _length_profile_stage_from_mode,
    _serialize_focus_modes,
    _primary_retry_code,
    _best_effort_rewrite_admissible,
    _build_ai_smell_retry_hints,
    _build_hallucination_retry_hints,
    _rewrite_validation_degraded_hint,
    _rewrite_validation_soft_hint,
    _describe_retry_reason,
    _length_shortfall_bucket,
    _select_rewrite_prompt_context,
)

# -- grounding --
from app.routers.es_review_grounding import (
    _build_allowed_user_facts,
    _select_prompt_user_facts,
    _build_company_evidence_cards,
    _assess_company_evidence_coverage,
    _collect_user_context_sources,
    _is_generic_role_label,
)

# -- stream --
from app.routers.es_review_stream import (
    _queue_progress_event,
    _stream_final_rewrite,
    _stream_source_links,
)

# -- prompts --
from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    build_template_rewrite_prompt,
    build_template_fallback_rewrite_prompt,
    build_template_length_fix_prompt,
    grounding_level_to_policy,
    resolve_length_control_profile,
)
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


# ---------------------------------------------------------------------------
# Helper functions that live in es_review.py -- imported lazily to avoid
# circular dependencies.
# ---------------------------------------------------------------------------

def _lazy_es_review():
    """Lazy import of the main es_review module."""
    from app.routers import es_review as _mod
    return _mod


def _get_default_grounding_level(template_type: str) -> str:
    return _lazy_es_review()._get_default_grounding_level(template_type)


def _get_company_grounding_policy(template_type: str) -> str:
    return _lazy_es_review()._get_company_grounding_policy(template_type)


def _resolve_effective_grounding_level(**kwargs) -> str:
    return _lazy_es_review()._resolve_effective_grounding_level(**kwargs)


def _build_template_review_response(**kwargs):
    return _lazy_es_review()._build_template_review_response(**kwargs)


def _format_evidence_card_log_lines(cards):
    return _lazy_es_review()._format_evidence_card_log_lines(cards)


def _format_rejected_source_log_lines(sources):
    return _lazy_es_review()._format_rejected_source_log_lines(sources)


def _format_source_log_lines(sources):
    return _lazy_es_review()._format_source_log_lines(sources)


def _append_rewrite_attempt_trace(trace, **kwargs):
    return _lazy_es_review()._append_rewrite_attempt_trace(trace, **kwargs)


def _filter_verified_company_rag_sources(rag_sources, *, company_name):
    return _lazy_es_review()._filter_verified_company_rag_sources(rag_sources, company_name=company_name)


def _template_source_family_priority_name(template_type: str):
    return _lazy_es_review()._template_source_family_priority_name(template_type)


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
    _ = json_caller
    # Resolve default text_caller from es_review module (the monkeypatch target)
    if text_caller is None:
        text_caller = _lazy_es_review().call_llm_text_with_error
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

    # -- Grounding setup --
    company_grounding = _get_company_grounding_policy(template_type)
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

    # -- Company evidence cards --
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

    retrieval_profile_name = _template_source_family_priority_name(template_type)
    priority_source_match_count = sum(
        1
        for source in verified_rag_sources
        if str(source.get("source_url") or "") in user_priority_urls
    )

    return ReviewContext(
        template_type=template_type,
        template_request=template_request,
        request=request,
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
        generic_role_mode=generic_role_mode,
        user_priority_urls=user_priority_urls,
        use_tight_length_control=use_tight_length_control,
        review_token_usage=review_token_usage,
        triggered_enrichment=triggered_enrichment,
        enrichment_completed=enrichment_completed,
        enrichment_sources_added=enrichment_sources_added,
        retrieval_profile_name=retrieval_profile_name,
        priority_source_match_count=priority_source_match_count,
    )


# ---------------------------------------------------------------------------
# Stage 2: execute_rewrite_loop
# ---------------------------------------------------------------------------

async def execute_rewrite_loop(ctx: ReviewContext) -> RewriteLoopResult:
    """Run the main rewrite attempt loop (up to N retries)."""
    result = RewriteLoopResult()
    improvement_payload: list[dict[str, Any]] = []

    retry_reason = ""
    last_ai_smell_warnings: list[dict[str, str]] = []
    last_hallucination_warnings: list[dict[str, str]] = []
    last_under_min_length: int | None = None

    total_attempts = _total_rewrite_attempts(ctx.review_variant)
    template_request = ctx.template_request

    for attempt in range(total_attempts):
        result.executed_rewrite_attempts = attempt + 1
        focus_modes = (
            ["normal"]
            if attempt == 0
            else _resolve_rewrite_focus_modes(
                retry_code=result.retry_code,
                failure_codes=result.retry_failure_codes,
            )
        )
        focus_mode = focus_modes[0]
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
        if last_ai_smell_warnings:
            smell_hints = _build_ai_smell_retry_hints(last_ai_smell_warnings)
            retry_hints = [*retry_hints, *smell_hints]
        if last_hallucination_warnings:
            hallucination_hints = _build_hallucination_retry_hints(
                last_hallucination_warnings
            )
            retry_hints = [*retry_hints, *hallucination_hints]
        length_shortfall = (
            max(0, ctx.char_min - result.best_rejected_length)
            if ctx.char_min and result.best_rejected_length and result.best_rejected_length < ctx.char_min
            else None
        )
        rewrite_source_answer = result.best_rejected_candidate or template_request.answer
        if attempt == 0:
            rewrite_source_answer = template_request.answer
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
        )

        logger.info(
            "[ES添削/テンプレート] rewrite %s attempt=%s/%s mode=%s",
            ctx.template_type,
            attempt + 1,
            total_attempts,
            focus_mode,
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
                review_variant=ctx.review_variant,
                llm_model=ctx.llm_model,
            ),
            temperature=_es_review_temperature(
                ctx.llm_model,
                stage="rewrite",
                focus_mode=focus_mode,
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
        validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
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
            company_evidence_cards=ctx.prompt_company_evidence_cards,
            review_variant=ctx.review_variant,
            soft_validation_mode="strict",
            user_answer=template_request.answer,
        )
        _append_rewrite_attempt_trace(
            result.rewrite_attempt_trace,
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
            result.retry_failure_codes = failure_codes
            result.retry_code = retry_code
            normalized_candidate = _normalize_repaired_text(candidate)
            current_length = len(normalized_candidate)
            candidate_distance = _char_limit_distance(
                normalized_candidate,
                char_min=ctx.char_min,
                char_max=ctx.char_max,
            )
            if result.best_rejected_distance is None or candidate_distance <= result.best_rejected_distance:
                result.best_rejected_candidate = normalized_candidate
                result.best_rejected_length = len(result.best_rejected_candidate)
                result.best_rejected_distance = candidate_distance
                result.best_retry_code = _primary_retry_code(
                    retry_code=retry_code,
                    failure_codes=failure_codes,
                )
                result.best_failure_codes = failure_codes
                result.best_rejected_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
                result.best_rejected_hallucination_warnings = list(
                    retry_meta.get("hallucination_warnings") or []
                )
            last_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
            last_hallucination_warnings = list(
                retry_meta.get("hallucination_warnings") or []
            )
            primary_rc = _primary_retry_code(
                retry_code=retry_code,
                failure_codes=failure_codes,
            )
            result.accepted_length_failure_code = primary_rc
            if primary_rc == "under_min":
                if _should_short_circuit_to_length_fix(
                    retry_code=primary_rc,
                    current_length=current_length,
                    last_under_min_length=last_under_min_length,
                    attempt_number=attempt + 1,
                    llm_model=ctx.llm_model,
                    char_min=ctx.char_min,
                    char_max=ctx.char_max,
                    rewrite_source_answer=rewrite_source_answer,
                ):
                    last_under_min_length = current_length
                    result.attempt_failures.append(retry_reason)
                    logger.warning(
                        "[ES添削/テンプレート] rewrite %s attempt=%s/%s 失敗: %s",
                        ctx.template_type,
                        attempt + 1,
                        total_attempts,
                        _describe_retry_reason(retry_reason),
                    )
                    logger.info(
                        "[ES添削/テンプレート] rewrite %s attempt=%s/%s under_min が連続したため早期に length-fix へ移行",
                        ctx.template_type,
                        attempt + 1,
                        total_attempts,
                    )
                    break
                last_under_min_length = current_length
            else:
                last_under_min_length = None
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
        result.accepted_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
        result.accepted_hallucination_warnings = list(
            retry_meta.get("hallucination_warnings") or []
        )
        result.rewrite_generation_mode = _serialize_focus_modes(focus_modes)
        break

    return result


# ---------------------------------------------------------------------------
# Stage 3: execute_recovery_pipeline
# ---------------------------------------------------------------------------

async def execute_recovery_pipeline(
    ctx: ReviewContext,
    loop_result: RewriteLoopResult,
) -> RecoveryResult:
    """Fallback rewrite, length-fix passes, and best-effort adoption."""
    recovery = RecoveryResult()

    # If loop already succeeded, nothing to recover.
    if loop_result.final_rewrite:
        return recovery

    template_request = ctx.template_request
    total_attempts = _total_rewrite_attempts(ctx.review_variant)

    # Carry over attempt_failures and trace from loop for final assembly.
    recovery.attempt_failures = list(loop_result.attempt_failures)
    recovery.rewrite_attempt_trace = list(loop_result.rewrite_attempt_trace)

    # -----------------------------------------------------------------------
    # Fallback rewrite (non length-only failures)
    # -----------------------------------------------------------------------
    if (
        loop_result.best_rejected_candidate
        and any(code not in {"under_min", "over_max"} for code in loop_result.best_failure_codes)
    ):
        recovery.fallback_triggered = True
        recovery.fallback_reason = loop_result.best_retry_code or "generic"
        fallback_hints = [*ctx.classification_hints, *loop_result.attempt_failures[-2:]]
        if loop_result.best_rejected_ai_smell_warnings:
            smell_hints = _build_ai_smell_retry_hints(loop_result.best_rejected_ai_smell_warnings)
            fallback_hints = [*fallback_hints, *smell_hints]
        if loop_result.best_rejected_hallucination_warnings:
            hallucination_hints = _build_hallucination_retry_hints(
                loop_result.best_rejected_hallucination_warnings
            )
            fallback_hints = [*fallback_hints, *hallucination_hints]
        system_prompt, user_prompt = build_template_fallback_rewrite_prompt(
            template_type=ctx.template_type,
            company_name=template_request.company_name,
            industry=template_request.industry,
            question=template_request.question,
            answer=loop_result.best_rejected_candidate,
            char_min=ctx.char_min,
            char_max=ctx.char_max,
            company_evidence_cards=ctx.prompt_company_evidence_cards,
            has_rag=ctx.effective_company_rag_available,
            allowed_user_facts=ctx.prompt_user_facts,
            intern_name=template_request.intern_name,
            role_name=ctx.effective_role_name,
            grounding_mode=ctx.effective_grounding_mode,
            retry_hints=fallback_hints,
            reference_quality_block=ctx.reference_quality_block,
            generic_role_mode=ctx.generic_role_mode,
            evidence_coverage_level=ctx.evidence_coverage_level,
            length_control_mode="under_min_recovery" if loop_result.best_retry_code == "under_min" else "default",
            length_shortfall=max(0, (ctx.char_min or 0) - len(loop_result.best_rejected_candidate)) if ctx.char_min else None,
            focus_modes=_resolve_rewrite_focus_modes(
                retry_code=loop_result.best_retry_code,
                failure_codes=loop_result.best_failure_codes,
            ),
            company_grounding_override=ctx.effective_company_grounding,
            grounding_level_override=ctx.effective_grounding_level,
            llm_model=ctx.llm_model,
        )
        fallback_result = await ctx.text_caller(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=_rewrite_max_tokens(
                ctx.char_max,
                review_variant=ctx.review_variant,
                llm_model=ctx.llm_model,
            ),
            temperature=_es_review_temperature(ctx.llm_model, stage="rewrite", focus_mode="normal"),
            model=ctx.llm_model,
            feature=ctx.review_feature,
            disable_fallback=True,
        )
        _accumulate_review_token_usage(ctx.review_token_usage, fallback_result, call_kind="text")
        fallback_candidate = (
            fallback_result.data.get("text", "")
            if fallback_result.success and isinstance(fallback_result.data, dict)
            else str(fallback_result.data) if fallback_result.success and fallback_result.data else ""
        )
        validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
            fallback_candidate,
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
            company_evidence_cards=ctx.prompt_company_evidence_cards,
            review_variant=ctx.review_variant,
            soft_validation_mode="strict",
            user_answer=template_request.answer,
        )
        _append_rewrite_attempt_trace(
            recovery.rewrite_attempt_trace,
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
            recovery.final_rewrite = validated_candidate
            recovery.accepted_attempt = total_attempts + 1
            recovery.accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
            recovery.accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
            recovery.accepted_soft_min_floor_ratio = retry_meta.get("soft_min_floor_ratio")
            fallback_profile = resolve_length_control_profile(
                ctx.char_min,
                ctx.char_max,
                stage="under_min_recovery" if loop_result.best_retry_code == "under_min" else "default",
                original_len=len(loop_result.best_rejected_candidate),
                llm_model=ctx.llm_model,
                latest_failed_len=len(loop_result.best_rejected_candidate),
            )
            recovery.accepted_length_profile_id = fallback_profile.profile_id
            recovery.accepted_target_window_lower = fallback_profile.target_lower
            recovery.accepted_target_window_upper = fallback_profile.target_upper
            recovery.accepted_source_fill_ratio = fallback_profile.source_fill_ratio
            recovery.accepted_required_growth = fallback_profile.required_growth
            recovery.accepted_latest_failed_length = fallback_profile.latest_failed_length
            recovery.accepted_length_failure_code = None
            recovery.accepted_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
            recovery.accepted_hallucination_warnings = list(
                retry_meta.get("hallucination_warnings") or []
            )
            recovery.rewrite_generation_mode = "fallback_safe_rewrite"
            return recovery
        else:
            recovery.attempt_failures.append(retry_reason)

    # -----------------------------------------------------------------------
    # Length-fix passes
    # -----------------------------------------------------------------------
    if (
        loop_result.best_rejected_candidate
        and loop_result.best_retry_code in {"under_min", "over_max", "style", "grounding"}
        and _should_attempt_length_fix(
            loop_result.best_rejected_candidate,
            char_min=ctx.char_min,
            char_max=ctx.char_max,
            use_tight_length_control=ctx.use_tight_length_control,
            primary_failure_code=loop_result.best_retry_code,
            failure_codes=loop_result.best_failure_codes,
        )
    ):
        recovery.length_fix_attempted = True
        length_fix_source = loop_result.best_rejected_candidate
        length_fix_code = loop_result.best_retry_code
        length_fix_failure_codes = list(loop_result.best_failure_codes or [loop_result.best_retry_code])
        recovery.length_fix_result = "failed"
        for fix_pass in range(LENGTH_FIX_REWRITE_ATTEMPTS):
            length_fix_focus_modes = _resolve_rewrite_focus_modes(
                retry_code=length_fix_code,
                failure_codes=length_fix_failure_codes,
            )
            logger.info(
                "[ES添削/テンプレート] length-fix attempt: template=%s mode=%s pass=%s/%s",
                ctx.template_type,
                _serialize_focus_modes(length_fix_focus_modes),
                fix_pass + 1,
                LENGTH_FIX_REWRITE_ATTEMPTS,
            )
            system_prompt, user_prompt = build_template_length_fix_prompt(
                template_type=ctx.template_type,
                current_text=length_fix_source,
                char_min=ctx.char_min,
                char_max=ctx.char_max,
                fix_mode=length_fix_code,
                focus_modes=length_fix_focus_modes,
                length_control_mode=(
                    "under_min_recovery"
                    if ctx.use_tight_length_control and length_fix_code in {"under_min", "over_max"}
                    else "default"
                ),
                llm_model=ctx.llm_model,
                effective_company_grounding=ctx.effective_company_grounding,
                grounding_mode=ctx.effective_grounding_mode,
            )
            rewrite_result = await ctx.text_caller(
                system_prompt=system_prompt,
                user_message=user_prompt,
                max_tokens=_rewrite_max_tokens(
                    ctx.char_max,
                    length_fix_mode=True,
                    review_variant=ctx.review_variant,
                    llm_model=ctx.llm_model,
                ),
                temperature=_es_review_temperature(ctx.llm_model, stage="length_fix"),
                model=ctx.llm_model,
                feature=ctx.review_feature,
                disable_fallback=True,
            )
            _accumulate_review_token_usage(ctx.review_token_usage, rewrite_result, call_kind="text")
            if not rewrite_result.success or not rewrite_result.data:
                _append_rewrite_attempt_trace(
                    recovery.rewrite_attempt_trace,
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
                company_evidence_cards=ctx.prompt_company_evidence_cards,
                review_variant=ctx.review_variant,
                soft_validation_mode="final_soft",
                user_answer=template_request.answer,
            )
            if validated_candidate:
                _append_rewrite_attempt_trace(
                    recovery.rewrite_attempt_trace,
                    stage="length_fix",
                    text=str(candidate),
                    accepted=True,
                    prompt_mode=_serialize_focus_modes(length_fix_focus_modes),
                    prompt_modes=length_fix_focus_modes,
                    fix_pass=fix_pass + 1,
                    length_fix_total=LENGTH_FIX_REWRITE_ATTEMPTS,
                )
                recovery.final_rewrite = validated_candidate
                recovery.accepted_attempt = loop_result.executed_rewrite_attempts + fix_pass + 1
                recovery.accepted_length_policy = str(retry_meta.get("length_policy") or "strict")
                recovery.accepted_length_shortfall = int(retry_meta.get("length_shortfall") or 0)
                recovery.accepted_soft_min_floor_ratio = retry_meta.get("soft_min_floor_ratio")
                recovery.accepted_ai_smell_warnings = list(retry_meta.get("ai_smell_warnings") or [])
                length_fix_profile = resolve_length_control_profile(
                    ctx.char_min,
                    ctx.char_max,
                    stage="under_min_recovery" if length_fix_code == "under_min" else "tight_length",
                    original_len=len(length_fix_source),
                    llm_model=ctx.llm_model,
                    latest_failed_len=len(length_fix_source),
                )
                recovery.accepted_length_profile_id = length_fix_profile.profile_id
                recovery.accepted_target_window_lower = length_fix_profile.target_lower
                recovery.accepted_target_window_upper = length_fix_profile.target_upper
                recovery.accepted_source_fill_ratio = length_fix_profile.source_fill_ratio
                recovery.accepted_required_growth = length_fix_profile.required_growth
                recovery.accepted_latest_failed_length = len(length_fix_source)
                recovery.accepted_length_failure_code = "under_min" if length_fix_code == "under_min" else retry_code
                if retry_code == "soft_ok":
                    recovery.rewrite_validation_status = "soft_ok"
                    recovery.rewrite_validation_codes = list(
                        retry_meta.get("soft_validation_codes") or ["under_min"]
                    )
                    recovery.rewrite_validation_user_hint = _rewrite_validation_soft_hint(
                        recovery.rewrite_validation_codes
                    )
                    recovery.length_fix_result = "soft_recovered"
                else:
                    recovery.length_fix_result = "strict_recovered"
                recovery.accepted_hallucination_warnings = list(
                    retry_meta.get("hallucination_warnings") or []
                )
                return recovery
            _append_rewrite_attempt_trace(
                recovery.rewrite_attempt_trace,
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
    ):
        recovery.final_rewrite = _coerce_degraded_rewrite_dearu_style(loop_result.best_rejected_candidate)
        recovery.rewrite_validation_status = "degraded"
        recovery.rewrite_validation_codes = list(
            loop_result.best_failure_codes
            or ([loop_result.best_retry_code] if loop_result.best_retry_code != "generic" else [])
        )
        recovery.rewrite_validation_user_hint = _rewrite_validation_degraded_hint(recovery.rewrite_validation_codes)
        recovery.accepted_ai_smell_warnings = loop_result.best_rejected_ai_smell_warnings
        recovery.accepted_hallucination_warnings = (
            loop_result.best_rejected_hallucination_warnings
        )
        if recovery.accepted_ai_smell_warnings:
            smell_details = "; ".join(w["detail"] for w in recovery.accepted_ai_smell_warnings[:3])
            recovery.rewrite_validation_user_hint += f" また、以下のAI的表現が検出されました: {smell_details}"
        recovery.rewrite_generation_mode = "degraded_best_effort"
        recovery.accepted_attempt = loop_result.executed_rewrite_attempts + (
            LENGTH_FIX_REWRITE_ATTEMPTS if recovery.length_fix_attempted else 0
        )
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
    GENERIC_REWRITE_VALIDATION_ERROR = _lazy_es_review().GENERIC_REWRITE_VALIDATION_ERROR
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
    total_attempts = _total_rewrite_attempts(ctx.review_variant)
    template_request = ctx.template_request

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
        accepted_ai_smell_warnings = recovery.accepted_ai_smell_warnings
        rewrite_generation_mode = recovery.rewrite_generation_mode
        rewrite_validation_status = recovery.rewrite_validation_status
        rewrite_validation_codes = recovery.rewrite_validation_codes
        rewrite_validation_user_hint = recovery.rewrite_validation_user_hint
        fallback_triggered = recovery.fallback_triggered
        fallback_reason = recovery.fallback_reason
        length_fix_attempted = recovery.length_fix_attempted
        length_fix_result = recovery.length_fix_result
        attempt_failures = recovery.attempt_failures
        rewrite_attempt_trace = recovery.rewrite_attempt_trace
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
        accepted_ai_smell_warnings = loop_result.accepted_ai_smell_warnings
        rewrite_generation_mode = loop_result.rewrite_generation_mode
        rewrite_validation_status = loop_result.rewrite_validation_status
        rewrite_validation_codes = loop_result.rewrite_validation_codes
        rewrite_validation_user_hint = loop_result.rewrite_validation_user_hint
        fallback_triggered = False
        fallback_reason = None
        length_fix_attempted = False
        length_fix_result = "not_needed"
        attempt_failures = loop_result.attempt_failures
        rewrite_attempt_trace = loop_result.rewrite_attempt_trace

    total_logged_attempts = total_attempts + (LENGTH_FIX_REWRITE_ATTEMPTS if length_fix_attempted else 0)
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
    _ai_smell_warnings_for_tier = (
        recovery.accepted_ai_smell_warnings if recovery.final_rewrite
        else loop_result.accepted_ai_smell_warnings
    )
    _ai_smell_result = _compute_ai_smell_score(
        _ai_smell_warnings_for_tier,
        template_type=ctx.template_type,
        char_max=ctx.char_max,
    )
    _ai_smell_tier = int(_ai_smell_result.get("tier", 0))
    _hallucination_warnings_for_tier = (
        recovery.accepted_hallucination_warnings if recovery.final_rewrite
        else loop_result.accepted_hallucination_warnings
    )
    _hallucination_result = _compute_hallucination_score(
        _hallucination_warnings_for_tier,
        template_type=ctx.template_type,
    )
    _hallucination_tier = int(_hallucination_result.get("tier", 0))

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
            rewrite_attempt_count=accepted_attempt,
            reference_es_count=len(ctx.reference_examples),
            reference_quality_profile_used=bool(ctx.reference_quality_block),
            reference_outline_used=ctx.reference_outline_used,
            reference_hint_count=len((ctx.reference_quality_profile or {}).get("quality_hints") or [])
            + len((ctx.reference_quality_profile or {}).get("conditional_hints") or []),
            reference_conditional_hints_applied=bool(
                (ctx.reference_quality_profile or {}).get("conditional_hints_applied")
            ),
            reference_profile_variance=(ctx.reference_quality_profile or {}).get("variance_band"),
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
            grounding_repair_applied=ctx.grounding_repair_applied,
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
            concrete_marker_count=_concrete_count,
            opening_conclusion_chars=_opening_conclusion_chars,
            rewrite_sentence_count=_rewrite_sentence_count,
        ),
    )
