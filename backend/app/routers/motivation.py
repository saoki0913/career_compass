"""Motivation router facade with slim endpoints and helper re-exports."""

from __future__ import annotations

import asyncio
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.limiter import limiter
from app.prompts.es_templates import (
    build_template_draft_generation_prompt,
    draft_synthetic_question_company_motivation,
    get_company_honorific,
)
from app.prompts.reference_es import build_reference_quality_block
from app.security.career_principal import (
    CareerPrincipal,
    require_career_principal,
    require_tenant_key,
)
from app.security.sse_concurrency import SseConcurrencyExceeded, SseLease
from app.utils.es_draft_text import normalize_es_draft_single_paragraph
from app.utils import llm_model_routing
from app.utils.llm import (
    call_llm_with_error,
    consume_request_llm_cost_summary,
)
from app.utils.llm_prompt_safety import PromptSafetyError, sanitize_prompt_input
from app.utils.secure_logger import get_logger

from app.routers.motivation_summarize import (
    append_summary_to_system_prompt,
    maybe_summarize_older_messages,
)
from app.routers.motivation_models import (
    GenerateDraftFromProfileRequest,
    GenerateDraftRequest,
    GenerateDraftResponse,
    Message,
    NextQuestionRequest,
    NextQuestionResponse,
)
from app.routers.motivation_sanitizers import (
    format_conversation as _format_conversation,
    prompt_safety_http_error as _prompt_safety_http_error,
    sanitize_generate_draft_from_profile_request as _sanitize_generate_draft_from_profile_request,
    sanitize_generate_draft_request as _sanitize_generate_draft_request,
    sanitize_next_question_request as _sanitize_next_question_request,
)
from app.routers.motivation_context import (
    CONVERSATION_MODE_DEEPDIVE,  # noqa: F401
    CONVERSATION_MODE_SLOT_FILL,  # noqa: F401
    CONTRADICTION_PATTERNS,  # noqa: F401
    SLOT_STATE_VALUES,  # noqa: F401
    UNRESOLVED_PATTERNS,  # noqa: F401
    _answer_is_confirmed_for_stage,  # noqa: F401
    _default_slot_states,  # noqa: F401
    _normalize_conversation_context,  # noqa: F401
    _normalize_slot_state,  # noqa: F401
    _normalize_slot_status_v2,  # noqa: F401
)
from app.routers.motivation_planner import (
    DEEPDIVE_INTENT_BY_GAP_ID,  # noqa: F401
    NEXT_ADVANCE_CONDITION_BY_SLOT,  # noqa: F401
    _build_progress_payload,  # noqa: F401
    _compute_deterministic_causal_gaps,  # noqa: F401
    _determine_next_turn,  # noqa: F401
    _slot_label,  # noqa: F401
)
from app.routers.motivation_prompt_fmt import (
    _build_draft_primary_material,  # noqa: F401
    _build_question_messages,  # noqa: F401
    _build_question_user_message,  # noqa: F401
    _build_slot_summary_section,  # noqa: F401
    _extract_motivation_student_expressions,  # noqa: F401
    _format_evidence_cards_for_prompt,  # noqa: F401
    _format_gakuchika_for_prompt,  # noqa: F401
    _format_profile_for_prompt,  # noqa: F401
)
from app.routers.motivation_company import (
    _build_evidence_cards_from_sources,  # noqa: F401
    _build_evidence_summary_from_sources,  # noqa: F401
    _resolve_motivation_draft_metadata,  # noqa: F401
)
from app.routers.motivation_validation import (
    _build_question_fallback_candidates,  # noqa: F401
    _is_semantically_duplicate_question,  # noqa: F401
    _validate_or_repair_question,  # noqa: F401
)
from app.routers.motivation_question import (
    _assemble_regular_next_question_response,  # noqa: F401
    _build_draft_ready_telemetry,  # noqa: F401
    _build_draft_ready_response,  # noqa: F401
    _build_draft_ready_unlock_response,  # noqa: F401
    _deepdive_area_to_stage,  # noqa: F401
    _deepdive_area_to_weakness_tag,  # noqa: F401
    _build_motivation_deepdive_system_prompt,  # noqa: F401
    _build_motivation_question_system_prompt,  # noqa: F401
    _classify_draft_ready_source,  # noqa: F401
    _coerce_motivation_stage_for_ui,  # noqa: F401
    _get_next_stage,  # noqa: F401
    _infer_weakness_tag_from_eval,  # noqa: F401
    _normalize_question_focus,  # noqa: F401
    _retry_question_generation_if_needed,  # noqa: F401
    _should_use_deepdive_mode,  # noqa: F401
)
from app.routers.motivation_pipeline import (
    _apply_semantic_confirmation_post_capture,  # noqa: F401
    _evaluate_motivation_internal,  # noqa: F401
    _get_company_context,  # noqa: F401
    _normalize_slot_status_with_confidence,  # noqa: F401
    _prepare_motivation_next_question,  # noqa: F401
    _semantic_answer_confirmation,  # noqa: F401
)
from app.routers.motivation_draft import (
    _CONCLUSION_KEYWORDS,  # noqa: F401
    _apply_multipass_refinement,  # noqa: F401
    _build_multipass_refinement_hints,  # noqa: F401
    _build_motivation_grounding_answer,
    _build_motivation_grounding_answer_from_profile,
    _build_user_origin_from_conversation,  # noqa: F401
    _check_conclusion_first,  # noqa: F401
    _extract_company_anchor_keywords,  # noqa: F401
    _maybe_retry_for_ai_smell,  # noqa: F401
    _resolve_motivation_draft_grounding,
    _resolve_motivation_grounding_mode,  # noqa: F401
    _select_motivation_draft,  # noqa: F401
)
from app.routers.motivation_retry import (
    _collect_draft_quality_failure_codes as _retry_collect_draft_quality_failure_codes,
    _maybe_retry_for_draft_quality,
)

router = APIRouter(prefix="/api/motivation", tags=["motivation"])
logger = get_logger(__name__)


def _motivation_question_error_type(error_type: str | None) -> str:
    if error_type == "parse":
        return "question_parse_failure"
    return "question_provider_failure"


def _motivation_question_parse_fallback_model(provider: str) -> str | None:
    if provider not in ("anthropic", "openai", "google"):
        return None

    fallback_model = llm_model_routing._feature_cross_fallback_model("motivation", provider)
    if fallback_model:
        return fallback_model

    primary_model = llm_model_routing.get_model_config().get("motivation", "")
    if (
        provider == "anthropic"
        and llm_model_routing._capability_class(primary_model) == "haiku_tier"
        and llm_model_routing._provider_has_api_key("anthropic")
    ):
        return "claude-sonnet"

    return None


async def _retry_motivation_question_parse_fallback(
    *,
    llm_result: Any,
    prompt: str,
    user_message: str,
    messages: list[dict] | None,
) -> Any:
    error = getattr(llm_result, "error", None)
    if getattr(error, "error_type", None) != "parse":
        return llm_result

    provider = getattr(error, "provider", "anthropic")
    fallback_model = _motivation_question_parse_fallback_model(provider)
    if not fallback_model:
        return llm_result

    logger.warning(
        "[Motivation] question parse failure; retrying with fallback model %s",
        fallback_model,
    )
    retry_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=700,
        temperature=0.4,
        model=fallback_model,
        feature="motivation",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if retry_result.success and retry_result.data:
        return retry_result
    return llm_result


@router.post("/evaluate")
@limiter.limit("60/minute")
async def evaluate_motivation_endpoint(payload: NextQuestionRequest, request: Request) -> dict:
    request = payload
    return await _evaluate_motivation_internal(request)


@router.post("/next-question", response_model=NextQuestionResponse)
@limiter.limit("60/minute")
async def get_next_question(
    payload: NextQuestionRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    request = payload
    if not request.company_name:
        raise HTTPException(status_code=400, detail="企業名が指定されていません")
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    if request.company_id and principal.company_id != request.company_id:
        raise HTTPException(status_code=403, detail="career principal company_id mismatch")
    tenant_key = require_tenant_key(principal) if request.company_id else None

    trimmed_messages, summary_text = await maybe_summarize_older_messages(
        request.conversation_history,
        request.conversation_context,
        company_name=request.company_name,
    )

    prep = await _prepare_motivation_next_question(request, tenant_key=tenant_key)
    if prep.is_complete and not prep.was_draft_ready:
        return _build_draft_ready_unlock_response(prep=prep)
    if prep.is_complete:
        return _build_draft_ready_response(prep=prep)
    if prep.was_draft_ready and not prep.has_generated_draft:
        return _build_draft_ready_response(prep=prep)

    prompt = (
        _build_motivation_deepdive_system_prompt(request=request, prep=prep)
        if _should_use_deepdive_mode(prep)
        else _build_motivation_question_system_prompt(request=request, prep=prep)
    )
    prompt = append_summary_to_system_prompt(prompt, summary_text)
    messages = _build_question_messages(trimmed_messages)
    user_message = _build_question_user_message(trimmed_messages)

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=700,
        temperature=0.5,
        feature="motivation",
        retry_on_parse=True,
        disable_fallback=True,
    )
    llm_result = await _retry_motivation_question_parse_fallback(
        llm_result=llm_result,
        prompt=prompt,
        user_message=user_message,
        messages=messages,
    )

    if not llm_result.success:
        error = llm_result.error
        upstream_error_type = error.error_type if error else None
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "AIサービスに接続できませんでした。",
                "error_type": _motivation_question_error_type(upstream_error_type),
                "upstream_error_type": upstream_error_type or "unknown",
            },
        )

    data = llm_result.data
    if not data or not data.get("question"):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIから有効な質問を取得できませんでした。",
                "error_type": "question_parse_failure",
            },
        )

    return await _assemble_regular_next_question_response(request=request, prep=prep, data=data)


@router.post("/next-question/stream")
@limiter.limit("60/minute")
async def get_next_question_stream(
    payload: NextQuestionRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    request = payload
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    if request.company_id and principal.company_id != request.company_id:
        raise HTTPException(status_code=403, detail="career principal company_id mismatch")

    from app.routers.motivation_streaming import (
        _generate_next_question_progress as _generate_next_question_progress_canonical,
    )

    try:
        lease = await SseLease.acquire(actor_id=principal.actor_id, plan=principal.plan)
    except SseConcurrencyExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "sse_concurrency_exceeded",
                "limit": exc.rejection.limit,
            },
            headers={"Retry-After": str(exc.rejection.retry_after_seconds)},
        )

    tenant_key = require_tenant_key(principal) if request.company_id else None

    async def _stream_with_lease() -> AsyncGenerator[str, None]:
        async with lease:
            async for chunk in _generate_next_question_progress_canonical(
                request,
                tenant_key=tenant_key,
            ):
                await lease.heartbeat_if_due()
                yield chunk

    return StreamingResponse(
        _stream_with_lease(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate-draft", response_model=GenerateDraftResponse)
@limiter.limit("60/minute")
async def generate_draft(
    payload: GenerateDraftRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    request = payload
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")
    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")
    try:
        _sanitize_generate_draft_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    trimmed_messages, summary_text = await maybe_summarize_older_messages(
        request.conversation_history,
        None,
        company_name=request.company_name,
    )
    if principal.company_id != request.company_id:
        raise HTTPException(status_code=403, detail="career principal company_id mismatch")
    tenant_key = require_tenant_key(principal)
    company_context, company_sources = await _get_company_context(
        request.company_id,
        tenant_key=tenant_key,
    )
    conversation_text = _format_conversation(trimmed_messages)
    if summary_text:
        conversation_text = f"【会話前半の要約】\n{summary_text}\n\n{conversation_text}"
    char_min = int(request.char_limit * 0.9)
    industry_s = sanitize_prompt_input(request.industry or "不明", max_length=100)
    honorific = get_company_honorific(industry_s)
    synthetic_q = draft_synthetic_question_company_motivation(honorific)
    ref_body = (company_context or "").strip() or None

    role_name = (request.selected_role or "").strip() or None
    grounding_answer = _build_motivation_grounding_answer(
        slot_summaries=request.slot_summaries,
        selected_role=role_name,
    )
    has_rag, grounding_mode, evidence_cards, evidence_coverage_level = _resolve_motivation_draft_grounding(
        template_type="company_motivation",
        company_sources=company_sources,
        synthetic_question=synthetic_q,
        grounding_answer=grounding_answer,
        role_name=role_name,
    )
    reference_quality_block = build_reference_quality_block(
        "company_motivation",
        char_max=request.char_limit,
        company_name=request.company_name,
    )
    student_expressions = _extract_motivation_student_expressions(request.conversation_history)

    primary_material_heading, primary_material_body = _build_draft_primary_material(
        conversation_text=conversation_text,
        slot_summaries=request.slot_summaries,
        slot_evidence_sentences=request.slot_evidence_sentences,
    )

    system_prompt, user_prompt = build_template_draft_generation_prompt(
        "company_motivation",
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=industry_s,
        question=synthetic_q,
        char_min=char_min,
        char_max=request.char_limit,
        primary_material_heading=primary_material_heading,
        primary_material_body=primary_material_body,
        company_reference_heading="【企業参考情報（要約）】",
        company_reference_body=ref_body,
        output_json_kind="motivation",
        role_name=role_name,
        company_evidence_cards=evidence_cards,
        has_rag=has_rag,
        grounding_mode=grounding_mode,
        reference_quality_block=reference_quality_block,
        evidence_coverage_level=evidence_coverage_level,
        student_expressions=student_expressions,
    )

    llm_result = None
    max_draft_attempts = 3
    for attempt in range(max_draft_attempts):
        llm_result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=1800,
            temperature=0.3,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if llm_result.success and llm_result.data is not None:
            break
        if attempt < max_draft_attempts - 1:
            backoff = min(8.0, 1.5 * (2**attempt))
            await asyncio.sleep(backoff)

    if llm_result is None:
        raise HTTPException(status_code=503, detail={"error": "ES生成中にエラーが発生しました。"})
    if not llm_result.success or llm_result.data is None:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={"error": error.message if error else "ES生成中にエラーが発生しました。"},
        )

    data = llm_result.data
    draft = normalize_es_draft_single_paragraph(str(data.get("draft", "")))
    user_origin_text = _build_user_origin_from_conversation(request.conversation_history)
    anchor_keywords = _extract_company_anchor_keywords(
        company_context,
        company_sources,
        evidence_cards,
    )

    def _build_quality_retry_prompt(hints: list[str]) -> tuple[str, str]:
        if not hints:
            return system_prompt, user_prompt
        return (
            system_prompt + "\n\n## 品質再生成指示\n" + "\n".join(f"- {hint}" for hint in hints),
            user_prompt,
        )

    async def _quality_retry_call(retry_system_prompt: str, retry_user_prompt: str) -> str | None:
        retry_result = await call_llm_with_error(
            system_prompt=retry_system_prompt,
            user_message=retry_user_prompt,
            max_tokens=1800,
            temperature=0.3,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if not (retry_result.success and retry_result.data is not None):
            return None
        retry_text = str(retry_result.data.get("draft", "")).strip()
        if not retry_text:
            return None
        return normalize_es_draft_single_paragraph(retry_text)

    draft, adopted_smell, quality_failure_codes, quality_telemetry = await _maybe_retry_for_draft_quality(
        initial_draft=draft,
        user_origin_text=user_origin_text,
        template_type="company_motivation",
        char_min=char_min,
        char_max=request.char_limit,
        anchor_keywords=anchor_keywords,
        retry_prompt_builder=_build_quality_retry_prompt,
        llm_call_fn=_quality_retry_call,
    )
    if quality_failure_codes:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "志望動機の品質基準を満たす下書きを生成できませんでした。",
                "error_type": "motivation_draft_quality_failed",
                "failure_codes": quality_failure_codes,
            },
        )

    async def _refinement_call(refined_prompt: str) -> str:
        refined_result = await call_llm_with_error(
            system_prompt=refined_prompt,
            user_message=user_prompt,
            max_tokens=1800,
            temperature=0.35,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if not (refined_result.success and refined_result.data is not None):
            raise RuntimeError("refined LLM call failed")
        refined_text = str(refined_result.data.get("draft", "")).strip()
        return normalize_es_draft_single_paragraph(refined_text)

    draft, refinement_telemetry = await _apply_multipass_refinement(
        initial_draft=draft,
        initial_smell_score=adopted_smell,
        initial_within_limits=True,
        company_context=company_context,
        company_sources=company_sources,
        evidence_cards=evidence_cards,
        user_origin_text=user_origin_text,
        char_min=char_min,
        char_max=request.char_limit,
        template_type="company_motivation",
        base_system_prompt=system_prompt,
        llm_call_fn=_refinement_call,
        settings=settings,
    )
    final_failure_codes, final_smell, _ = _retry_collect_draft_quality_failure_codes(
        draft_text=draft,
        user_origin_text=user_origin_text,
        template_type="company_motivation",
        char_min=char_min,
        char_max=request.char_limit,
        anchor_keywords=anchor_keywords,
    )
    if final_failure_codes:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "志望動機の品質基準を満たす下書きを生成できませんでした。",
                "error_type": "motivation_draft_quality_failed",
                "failure_codes": final_failure_codes,
            },
        )

    key_points, company_keywords = _resolve_motivation_draft_metadata(
        slot_summaries=request.slot_summaries,
        llm_key_points=data.get("key_points", []),
        llm_company_keywords=data.get("company_keywords", []),
        company_context=company_context,
        company_sources=company_sources,
        selected_role=request.selected_role,
    )

    base_telemetry = consume_request_llm_cost_summary("motivation_draft") or {}
    base_telemetry.update(quality_telemetry)
    base_telemetry.update(refinement_telemetry)
    base_telemetry["ai_smell_score"] = float(final_smell.get("score", 0.0))
    base_telemetry["ai_smell_tier"] = int(final_smell.get("tier", 0) or 0)
    return GenerateDraftResponse(
        draft=draft,
        char_count=len(draft),
        key_points=key_points,
        company_keywords=company_keywords,
        internal_telemetry=base_telemetry,
    )


@router.post("/generate-draft-from-profile", response_model=GenerateDraftResponse)
@limiter.limit("60/minute")
async def generate_draft_from_profile(
    payload: GenerateDraftFromProfileRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    request = payload
    role = (request.selected_role or "").strip()
    if not role:
        raise HTTPException(status_code=400, detail="志望職種が指定されていません")
    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")
    try:
        _sanitize_generate_draft_from_profile_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    if principal.company_id != request.company_id:
        raise HTTPException(status_code=403, detail="career principal company_id mismatch")
    tenant_key = require_tenant_key(principal)
    company_context, company_sources = await _get_company_context(
        request.company_id,
        tenant_key=tenant_key,
    )
    char_min = int(request.char_limit * 0.9)
    profile_section = _format_profile_for_prompt(request.profile_context)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    industry_s = sanitize_prompt_input(request.industry or "不明", max_length=100)
    honorific = get_company_honorific(industry_s)
    synthetic_q = draft_synthetic_question_company_motivation(honorific)
    material_parts = [
        p.strip()
        for p in (
            profile_section.strip() if profile_section else "",
            gakuchika_section.strip() if gakuchika_section else "",
        )
        if p and str(p).strip()
    ]
    primary_material = "\n\n".join(material_parts) if material_parts else "（追加材料なし）"
    ref_body = (company_context or "").strip() or None

    role_name = request.selected_role.strip()
    grounding_answer = _build_motivation_grounding_answer_from_profile(
        role_name=role_name,
        gakuchika_section=gakuchika_section or "",
        profile_summary=profile_section or "",
    )
    has_rag, grounding_mode, evidence_cards, evidence_coverage_level = _resolve_motivation_draft_grounding(
        template_type="company_motivation",
        company_sources=company_sources,
        synthetic_question=synthetic_q,
        grounding_answer=grounding_answer,
        role_name=role_name,
    )
    reference_quality_block = build_reference_quality_block(
        "company_motivation",
        char_max=request.char_limit,
        company_name=request.company_name,
    )
    draft_material_messages = []
    if gakuchika_section:
        draft_material_messages.append(Message(role="user", content=gakuchika_section))
    if profile_section:
        draft_material_messages.append(Message(role="user", content=profile_section))
    student_expressions = _extract_motivation_student_expressions(draft_material_messages)

    system_prompt, user_prompt = build_template_draft_generation_prompt(
        "company_motivation",
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=industry_s,
        question=synthetic_q,
        char_min=char_min,
        char_max=request.char_limit,
        primary_material_heading="【材料（職種・プロフィール・ガクチカ要約）】",
        primary_material_body=primary_material,
        company_reference_heading="【企業参考情報（要約）】",
        company_reference_body=ref_body,
        output_json_kind="motivation",
        role_name=role_name,
        company_evidence_cards=evidence_cards,
        has_rag=has_rag,
        grounding_mode=grounding_mode,
        reference_quality_block=reference_quality_block,
        evidence_coverage_level=evidence_coverage_level,
        student_expressions=student_expressions,
    )

    llm_result = None
    for attempt in range(3):
        llm_result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=1200,
            temperature=0.3,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if llm_result.success and llm_result.data is not None:
            break
        if attempt < 2:
            await asyncio.sleep(1.5 * (attempt + 1))

    if llm_result is None or not llm_result.success or llm_result.data is None:
        err = llm_result.error if llm_result else None
        raise HTTPException(
            status_code=503,
            detail={"error": err.message if err else "ES生成中にエラーが発生しました。"},
        )

    data = llm_result.data
    draft = normalize_es_draft_single_paragraph(str(data.get("draft", "")))
    user_origin_text = (gakuchika_section or "")[:300]
    anchor_keywords = _extract_company_anchor_keywords(
        company_context,
        company_sources,
        evidence_cards,
    )

    def _build_profile_quality_retry_prompt(hints: list[str]) -> tuple[str, str]:
        if not hints:
            return system_prompt, user_prompt
        return (
            system_prompt + "\n\n## 品質再生成指示\n" + "\n".join(f"- {hint}" for hint in hints),
            user_prompt,
        )

    async def _profile_quality_retry_call(retry_system_prompt: str, retry_user_prompt: str) -> str | None:
        retry_result = await call_llm_with_error(
            system_prompt=retry_system_prompt,
            user_message=retry_user_prompt,
            max_tokens=1200,
            temperature=0.3,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if not (retry_result.success and retry_result.data is not None):
            return None
        retry_text = str(retry_result.data.get("draft", "")).strip()
        if not retry_text:
            return None
        return normalize_es_draft_single_paragraph(retry_text)

    draft, adopted_smell, quality_failure_codes, quality_telemetry = await _maybe_retry_for_draft_quality(
        initial_draft=draft,
        user_origin_text=user_origin_text,
        template_type="company_motivation",
        char_min=char_min,
        char_max=request.char_limit,
        anchor_keywords=anchor_keywords,
        retry_prompt_builder=_build_profile_quality_retry_prompt,
        llm_call_fn=_profile_quality_retry_call,
    )
    if quality_failure_codes:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "志望動機の品質基準を満たす下書きを生成できませんでした。",
                "error_type": "motivation_draft_quality_failed",
                "failure_codes": quality_failure_codes,
            },
        )

    async def _refinement_call_profile(refined_prompt: str) -> str:
        refined_result = await call_llm_with_error(
            system_prompt=refined_prompt,
            user_message=user_prompt,
            max_tokens=1200,
            temperature=0.35,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if not (refined_result.success and refined_result.data is not None):
            raise RuntimeError("refined LLM call failed")
        refined_text = str(refined_result.data.get("draft", "")).strip()
        return normalize_es_draft_single_paragraph(refined_text)

    draft, refinement_telemetry = await _apply_multipass_refinement(
        initial_draft=draft,
        initial_smell_score=adopted_smell,
        initial_within_limits=True,
        company_context=company_context,
        company_sources=company_sources,
        evidence_cards=evidence_cards,
        user_origin_text=user_origin_text,
        char_min=char_min,
        char_max=request.char_limit,
        template_type="company_motivation",
        base_system_prompt=system_prompt,
        llm_call_fn=_refinement_call_profile,
        settings=settings,
    )
    final_failure_codes, final_smell, _ = _retry_collect_draft_quality_failure_codes(
        draft_text=draft,
        user_origin_text=user_origin_text,
        template_type="company_motivation",
        char_min=char_min,
        char_max=request.char_limit,
        anchor_keywords=anchor_keywords,
    )
    if final_failure_codes:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "志望動機の品質基準を満たす下書きを生成できませんでした。",
                "error_type": "motivation_draft_quality_failed",
                "failure_codes": final_failure_codes,
            },
        )

    key_points, company_keywords = _resolve_motivation_draft_metadata(
        slot_summaries=None,
        llm_key_points=data.get("key_points", []) or [],
        llm_company_keywords=data.get("company_keywords", []) or [],
        company_context=company_context,
        company_sources=company_sources,
        selected_role=request.selected_role,
        include_experience_anchor=bool(gakuchika_context),
    )

    base_telemetry = consume_request_llm_cost_summary("motivation_draft") or {}
    base_telemetry.update(quality_telemetry)
    base_telemetry.update(refinement_telemetry)
    base_telemetry["ai_smell_score"] = float(final_smell.get("score", 0.0))
    base_telemetry["ai_smell_tier"] = int(final_smell.get("tier", 0) or 0)
    return GenerateDraftResponse(
        draft=draft,
        char_count=len(draft),
        key_points=key_points,
        company_keywords=company_keywords,
        internal_telemetry=base_telemetry,
    )
