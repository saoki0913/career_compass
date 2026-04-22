"""Draft-generation helper functions for motivation router."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, Optional

from fastapi import HTTPException
from app.config import settings
from app.prompts.es_templates import (
    build_template_draft_generation_prompt,
    draft_synthetic_question_company_motivation,
    get_company_honorific,
)
from app.prompts.reference_es import build_reference_quality_block
from app.routers.es_review_grounding import (
    _assess_company_evidence_coverage,
    _build_company_evidence_cards,
)
from app.routers.motivation_models import Message, NextQuestionResponse
from app.routers.motivation_prompt_fmt import (
    _build_draft_primary_material,
    _extract_motivation_student_expressions,
    _format_gakuchika_for_prompt,
    _format_profile_for_prompt,
)
from app.routers.motivation_company import _resolve_motivation_draft_metadata
from app.routers.motivation_pipeline import _get_company_context
from app.routers.motivation_retry import (
    _CONCLUSION_KEYWORDS,
    _apply_multipass_refinement,
    _build_multipass_refinement_hints,
    _check_conclusion_first,
    _extract_company_anchor_keywords,
    _maybe_retry_for_ai_smell,
    _maybe_retry_for_draft_quality,
    _collect_draft_quality_failure_codes as _retry_collect_draft_quality_failure_codes,
    _select_motivation_draft,
)
from app.routers.motivation_contract import build_stream_complete_event
from app.utils.es_draft_text import normalize_es_draft_single_paragraph
from app.utils.llm import call_llm_with_error, consume_request_llm_cost_summary
from app.utils.llm_prompt_safety import sanitize_prompt_input
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


def _sse_event(event_type: str, data: dict) -> str:
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _generate_next_question_progress(
    request: Any,
) -> AsyncGenerator[str, None]:
    raise RuntimeError("_generate_next_question_progress should be provided by motivation_streaming")


def _resolve_motivation_grounding_mode(
    *,
    rag_available: bool,
    company_sources: list[dict] | None,
    role_name: str | None,
    coverage_level: str,
) -> str:
    if not rag_available or not company_sources:
        return "none"
    if coverage_level in ("weak", "none"):
        return "none"
    role_name_stripped = (role_name or "").strip()
    if role_name_stripped and coverage_level == "strong":
        return "role_grounded"
    return "company_general"


def _build_motivation_grounding_answer(
    *,
    slot_summaries: dict[str, Optional[str]] | None,
    selected_role: str | None,
) -> str:
    if not slot_summaries:
        base = (selected_role or "").strip()
        return base
    parts: list[str] = []
    for key in ("company_reason", "desired_work", "differentiation"):
        value = slot_summaries.get(key)
        if value and str(value).strip():
            parts.append(str(value).strip())
    role = (selected_role or "").strip()
    if role:
        parts.append(role)
    return " ".join(parts)


def _build_motivation_grounding_answer_from_profile(
    *,
    role_name: str,
    gakuchika_section: str,
    profile_summary: str,
) -> str:
    parts: list[str] = [role_name.strip()] if role_name else []
    if gakuchika_section:
        parts.append(gakuchika_section[:300])
    if profile_summary:
        parts.append(profile_summary[:200])
    return "\n".join(p for p in parts if p)


def _resolve_motivation_draft_grounding(
    *,
    template_type: str,
    company_sources: list[dict] | None,
    synthetic_question: str,
    grounding_answer: str,
    role_name: str | None,
) -> tuple[bool, str, Optional[list[dict[str, str]]], str]:
    if not settings.motivation_rag_grounding:
        return False, "none", None, "none"
    if not company_sources:
        return False, "none", None, "none"
    try:
        preliminary_cards = _build_company_evidence_cards(
            company_sources,
            template_type=template_type,
            question=synthetic_question,
            answer=grounding_answer,
            role_name=role_name,
            intern_name=None,
            grounding_mode="company_general",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[Motivation] evidence card build failed, falling back to has_rag=False: %s", exc)
        return False, "none", None, "none"

    try:
        coverage_level, _ = _assess_company_evidence_coverage(
            template_type=template_type,
            role_name=role_name,
            company_rag_available=True,
            company_evidence_cards=preliminary_cards,
            grounding_mode="company_general",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[Motivation] coverage assessment failed: %s", exc)
        coverage_level = "weak"

    final_mode = _resolve_motivation_grounding_mode(
        rag_available=True,
        company_sources=company_sources,
        role_name=role_name,
        coverage_level=coverage_level,
    )
    if final_mode == "none" or not preliminary_cards:
        return False, "none", None, coverage_level
    return True, final_mode, preliminary_cards, coverage_level


def _build_user_origin_from_conversation(
    conversation_history: list[Message],
    *,
    max_messages: int = 3,
    max_chars: int = 1200,
) -> str:
    user_texts: list[str] = []
    for msg in reversed(conversation_history):
        if getattr(msg, "role", "") != "user":
            continue
        text = (msg.content or "").strip()
        if not text:
            continue
        user_texts.append(text)
        if len(user_texts) >= max_messages:
            break
    joined = "\n".join(reversed(user_texts))
    if len(joined) > max_chars:
        joined = joined[:max_chars]
    return joined


async def generate_draft_impl(request: Any) -> Any:
    company_context, company_sources = await _get_company_context(request.company_id)
    conversation_text = request._format_conversation(request.conversation_history)
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
    for attempt in range(3):
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
        if attempt < 2:
            await asyncio.sleep(min(8.0, 1.5 * (2**attempt)))

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
    anchor_keywords = _extract_company_anchor_keywords(company_context, company_sources, evidence_cards)

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
            status_code=422,
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
        return normalize_es_draft_single_paragraph(str(refined_result.data.get("draft", "")).strip())

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
            status_code=422,
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
    return {
        "draft": draft,
        "char_count": len(draft),
        "key_points": key_points,
        "company_keywords": company_keywords,
        "internal_telemetry": base_telemetry,
    }


async def generate_draft_from_profile_impl(request: Any) -> Any:
    company_context, company_sources = await _get_company_context(request.company_id)
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
    anchor_keywords = _extract_company_anchor_keywords(company_context, company_sources, evidence_cards)

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
            status_code=422,
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
        return normalize_es_draft_single_paragraph(str(refined_result.data.get("draft", "")).strip())

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
            status_code=422,
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
    return {
        "draft": draft,
        "char_count": len(draft),
        "key_points": key_points,
        "company_keywords": company_keywords,
        "internal_telemetry": base_telemetry,
    }


__all__ = [
    "_CONCLUSION_KEYWORDS",
    "_apply_multipass_refinement",
    "_build_multipass_refinement_hints",
    "_build_motivation_grounding_answer",
    "_build_motivation_grounding_answer_from_profile",
    "_build_user_origin_from_conversation",
    "_check_conclusion_first",
    "_extract_company_anchor_keywords",
    "generate_draft_from_profile_impl",
    "generate_draft_impl",
    "_maybe_retry_for_ai_smell",
    "_resolve_motivation_draft_grounding",
    "_resolve_motivation_grounding_mode",
    "_select_motivation_draft",
    "_sse_event",
]
