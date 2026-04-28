"""Preparation and evaluation pipeline helpers for motivation router."""

from __future__ import annotations

import asyncio
import copy
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Optional

from fastapi import HTTPException

from app.config import settings
from app.prompts.motivation_prompts import MOTIVATION_EVALUATION_PROMPT
from app.utils.llm import call_llm_with_error
from app.utils.llm_prompt_safety import sanitize_prompt_input
from app.utils.secure_logger import get_logger
from app.rag.vector_store import get_enhanced_context_for_review_with_sources
from app.routers.motivation_context import (
    CONVERSATION_MODE_DEEPDIVE,
    CONVERSATION_MODE_SLOT_FILL,
    _answer_signals_contradiction,
    _answer_signals_unresolved,
    _build_open_slots_from_confirmed_facts,
    _capture_answer_into_context,
    _coerce_risk_flags,
    _coerce_string_list,
    _confirmed_fact_key_for_stage,
    _default_confirmed_facts,
    _legacy_slot_state,
    _normalize_conversation_context,
    _normalize_slot_state,
    _normalize_slot_status_v2,
    _sanitize_existing_grounding_candidates,
)
from app.routers.motivation_models import MotivationScores, NextQuestionRequest
from app.routers.motivation_planner import (
    _build_progress_payload,
    _compute_deterministic_causal_gaps,
    _determine_next_turn,
    _slot_label,
)
from app.routers.motivation_sanitizers import format_conversation as _format_conversation
from app.routers.motivation_question import (
    _augment_rag_query_with_role,
    _build_adaptive_rag_query,
    _coerce_motivation_stage_for_ui,
    _compute_draft_gate,
    _role_hint_for_rag,
    _slot_to_legacy_element,
)
from app.routers.motivation_company import (
    _extract_company_features,
    _extract_company_keywords,
    _extract_profile_job_types,
    _extract_role_candidates_from_context,
    _extract_work_candidates_from_context,
    _merge_candidate_lists,
)
from app.routers.motivation_prompt_fmt import (
    _format_recent_conversation_for_prompt,
    _trim_conversation_for_evaluation,
)

logger = get_logger(__name__)


@dataclass
class _MotivationQuestionPrep:
    conversation_context: dict[str, Any]
    industry: str
    generated_draft: str | None
    company_context: str
    company_sources: list[dict]
    company_features: list[str]
    role_candidates: list[str]
    work_candidates: list[str]
    eval_result: dict[str, Any]
    scores: MotivationScores
    weakest_element: str
    is_complete: bool
    missing_slots: list[str]
    stage: str
    was_draft_ready: bool
    has_generated_draft: bool
    conversation_mode: str
    current_slot: str | None
    current_intent: str | None
    next_advance_condition: str | None
    unlock_reason: str | None
    progress: dict[str, Any]
    causal_gaps: list[dict[str, str]]


def _resolve_call_llm_with_error():
    try:
        from app.routers import motivation as motivation_router

        return getattr(motivation_router, "call_llm_with_error", call_llm_with_error)
    except Exception:  # noqa: BLE001
        return call_llm_with_error


def _resolve_facade_attr(name: str, default: Any) -> Any:
    try:
        from app.routers import motivation as motivation_router

        return getattr(motivation_router, name, default)
    except Exception:  # noqa: BLE001
        return default


async def _get_company_context(
    company_id: str,
    query: str = "",
    scores: Optional[MotivationScores] = None,
    role_hint: str | None = None,
    tenant_key: str | None = None,
) -> tuple[str, list[dict]]:
    """Get company RAG context for motivation questions."""
    if not tenant_key:
        logger.warning("[Motivation] tenant_key missing; skipping company RAG context")
        return "", []
    try:
        if not query:
            query = _build_adaptive_rag_query(scores, query)
        query = _augment_rag_query_with_role(query, role_hint)
        context, sources = await get_enhanced_context_for_review_with_sources(
            company_id=company_id,
            es_content=query,
            max_context_length=2000,
            tenant_key=tenant_key,
        )
        return context, sources
    except Exception as e:
        logger.error(f"[Motivation] RAG context error: {e}")
        return "", []


def _normalize_slot_status_with_confidence(
    raw_slot_status: dict | None,
) -> tuple[dict[str, str], dict[str, float]]:
    states: dict[str, str] = {}
    confidences: dict[str, float] = {}
    for slot, val in (raw_slot_status or {}).items():
        if isinstance(val, dict):
            state = str(val.get("state") or "missing")
            try:
                confidence = float(val.get("confidence", 1.0))
            except (TypeError, ValueError):
                confidence = 1.0
        else:
            state = str(val or "missing")
            confidence = 1.0
        if state in ("filled", "filled_strong") and confidence < 0.6:
            state = "partial"
        states[slot] = _normalize_slot_state(state)
        confidences[slot] = confidence
    return states, confidences


async def _evaluate_motivation_internal(
    request: NextQuestionRequest,
    company_context: str | None = None,
    conversation_context: dict[str, Any] | None = None,
    tenant_key: str | None = None,
) -> dict:
    normalized_context = _normalize_conversation_context(
        conversation_context if conversation_context is not None else request.conversation_context
    )

    if not request.conversation_history:
        return {
            "evaluation_status": "ok",
            "scores": {
                "company_understanding": 0,
                "self_analysis": 0,
                "career_vision": 0,
                "differentiation": 0,
            },
            "weakest_element": "company_reason",
            "is_complete": False,
            "slot_status": {
                "industry_reason": "missing",
                "company_reason": "missing",
                "self_connection": "missing",
                "desired_work": "missing",
                "value_contribution": "missing",
                "differentiation": "missing",
            },
            "slot_status_v2": {
                "industry_reason": "missing",
                "company_reason": "missing",
                "self_connection": "missing",
                "desired_work": "missing",
                "value_contribution": "missing",
                "differentiation": "missing",
            },
            "missing_slots": [
                "industry_reason",
                "company_reason",
                "self_connection",
                "desired_work",
                "value_contribution",
                "differentiation",
            ],
            "weak_slots": [],
            "do_not_ask_slots": [],
            "ready_for_draft": False,
            "draft_readiness_reason": "志望動機の骨格がまだ揃っていないため",
            "draft_blockers": ["company_reason", "desired_work", "differentiation", "self_connection"],
            "conversation_warnings": [],
            "missing_aspects": {},
            "risk_flags": [],
        }

    trimmed_history = _trim_conversation_for_evaluation(request.conversation_history)
    if settings.debug and len(trimmed_history) != len(request.conversation_history):
        logger.debug(
            "[Motivation] Evaluation conversation trimmed: "
            f"{len(request.conversation_history)} -> {len(trimmed_history)}"
        )

    if company_context is None:
        role_hint = _role_hint_for_rag(normalized_context, request.application_job_candidates)
        company_context, _ = await _get_company_context(
            request.company_id,
            _format_conversation(trimmed_history),
            role_hint=role_hint,
            tenant_key=tenant_key,
        )

    conversation_text = _format_conversation(trimmed_history)
    summaries = normalized_context.get("slotSummaries", {})
    summary_lines = [f"- {k}: {v}" for k, v in summaries.items() if v]
    slot_summaries_section = "\n".join(summary_lines) if summary_lines else "（まだ確認済みのスロットはありません）"
    prompt = MOTIVATION_EVALUATION_PROMPT.format(
        conversation=conversation_text,
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
        selected_role_line="志望職種（確定）: 会話コンテキストの「志望職種」を必ず参照すること",
        company_context=company_context or "（企業情報なし）",
        slot_summaries_section=slot_summaries_section,
    )
    prompt = (
        f"{prompt}\n\n"
        "## 追加評価ルール\n"
        "- slot_status は missing / partial / filled_weak / filled_strong の4段階で返す\n"
        "- filled_strong は再質問禁止、filled_weak は必要なら1回だけ補強対象とみなす\n"
        "- missing_slots には missing と partial の slot だけを入れる\n"
        "- weak_slots には filled_weak の slot を入れる\n"
        "- do_not_ask_slots には filled_strong の slot を入れる\n"
        "- self_connection が strong でも、経験・価値観・強みが志望理由ややりたい仕事と因果でつながらない場合は draft_ready を true にしない\n"
        "- 会話が十分進み、骨格がおおむね揃っていれば ready_for_draft を true にしてよい（完璧な言語化は不要）"
    )

    parse_retry_instructions = (
        "JSON以外は一切出力しないでください。"
        "コードブロックや説明文は禁止です。"
        "必ず必要なキーをすべて含め、配列は空配列でも可とします。"
    )

    llm_call = _resolve_call_llm_with_error()
    llm_result = await llm_call(
        system_prompt=prompt,
        user_message="上記の会話を評価してください。",
        max_tokens=1024,
        temperature=0.3,
        feature="motivation",
        retry_on_parse=True,
        parse_retry_instructions=parse_retry_instructions,
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        if llm_result.error and getattr(llm_result.error, "error_type", None) == "parse":
            evaluation_status = "parse_failure"
        else:
            evaluation_status = "provider_failure"
        logger.warning(
            "[Motivation] Evaluation LLM call failed: status=%s, error=%s",
            evaluation_status,
            llm_result.error.message if llm_result.error else "unknown",
        )
        scores = MotivationScores()
        return {
            "evaluation_status": evaluation_status,
            "scores": scores.model_dump(),
            "weakest_element": "company_reason",
            "is_complete": False,
            "slot_status": {
                "industry_reason": "missing",
                "company_reason": "missing",
                "self_connection": "missing",
                "desired_work": "missing",
                "value_contribution": "missing",
                "differentiation": "missing",
            },
            "slot_status_v2": {
                "industry_reason": "missing",
                "company_reason": "missing",
                "self_connection": "missing",
                "desired_work": "missing",
                "value_contribution": "missing",
                "differentiation": "missing",
            },
            "missing_slots": [
                "industry_reason",
                "company_reason",
                "self_connection",
                "desired_work",
                "value_contribution",
                "differentiation",
            ],
            "weak_slots": [],
            "do_not_ask_slots": [],
            "ready_for_draft": False,
            "draft_readiness_reason": "評価に失敗したため骨格未確認",
            "draft_blockers": ["company_reason", "desired_work", "differentiation", "self_connection"],
            "conversation_warnings": [],
            "missing_aspects": {},
            "risk_flags": [],
        }

    data = llm_result.data
    raw_slot_status = data.get("slot_status") or {}
    confidence_normalized_states, slot_confidences = _normalize_slot_status_with_confidence(raw_slot_status)
    slot_status_v2 = _normalize_slot_status_v2(confidence_normalized_states)
    slot_status = {
        slot: _legacy_slot_state(state)
        for slot, state in slot_status_v2.items()
    }
    missing_slots = [
        slot for slot, state in slot_status_v2.items()
        if state in {"missing", "partial"}
    ]
    weak_slots = [
        slot for slot, state in slot_status_v2.items()
        if state == "filled_weak"
    ]
    do_not_ask_slots = [
        slot for slot, state in slot_status_v2.items()
        if state == "filled_strong"
    ]
    gated_ready_for_draft, draft_blockers = _compute_draft_gate(
        slot_status_v2=slot_status_v2,
        conversation_context=normalized_context,
    )
    ready_for_draft = bool(data.get("ready_for_draft", False)) and gated_ready_for_draft
    weakest_element = _slot_to_legacy_element(missing_slots[0] if missing_slots else "differentiation")

    return {
        "evaluation_status": "ok",
        "scores": {
            "company_understanding": 0,
            "self_analysis": 0,
            "career_vision": 0,
            "differentiation": 0,
        },
        "weakest_element": weakest_element,
        "is_complete": ready_for_draft,
        "slot_status": slot_status,
        "slot_status_v2": slot_status_v2,
        "missing_slots": missing_slots,
        "weak_slots": weak_slots,
        "do_not_ask_slots": do_not_ask_slots,
        "ready_for_draft": ready_for_draft,
        "draft_readiness_reason": (
            str(data.get("draft_readiness_reason") or "")
            if ready_for_draft
            else " / ".join(_slot_label(slot) for slot in draft_blockers)
        ),
        "draft_blockers": draft_blockers,
        "conversation_warnings": _coerce_string_list(data.get("conversation_warnings"), max_items=4),
        "missing_aspects": {},
        "risk_flags": _coerce_risk_flags(data.get("risk_flags"), max_items=2),
        "slot_confidences": slot_confidences,
    }


async def _semantic_answer_confirmation(
    answer: str,
    stage: str,
    *,
    timeout_seconds: float = 2.0,
) -> bool:
    label = stage
    prompt = (
        f"以下の回答は「{label}」に対する実質的な回答ですか？"
        " 'yes' か 'no' のどちらか1単語のみで答えてください。\n回答: "
        f"{answer}"
    )
    llm_call = _resolve_call_llm_with_error()
    try:
        result = await asyncio.wait_for(
            llm_call(
                system_prompt=prompt,
                user_message="",
                model="gpt-nano",
                max_tokens=10,
                temperature=0,
                feature="motivation_semantic_confirm",
                response_format="text",
                disable_fallback=True,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning("[Motivation] semantic_confirmation timeout stage=%s", stage)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("[Motivation] semantic_confirmation error stage=%s: %s", stage, exc)
        return False
    if not result.success:
        return False
    raw = (result.raw_text or "").strip().lower()
    return raw.startswith("yes")


async def _apply_semantic_confirmation_post_capture(
    context: dict[str, Any],
    answer: str | None,
    *,
    settings,
) -> dict[str, Any]:
    if not getattr(settings, "motivation_semantic_confirm", False):
        return context
    trimmed = (answer or "").strip()
    if not trimmed or len(trimmed) < 14:
        return context
    stage = context.get("questionStage")
    if not stage:
        return context
    fact_key = _confirmed_fact_key_for_stage(stage)
    if not fact_key:
        return context
    confirmed_facts = dict(context.get("confirmedFacts") or {})
    if confirmed_facts.get(fact_key):
        return context
    if _answer_signals_unresolved(trimmed) or _answer_signals_contradiction(trimmed):
        return context
    cache = context.setdefault("semanticConfirmationCache", {})
    cache_key = f"{stage}:{' '.join(trimmed.split())[:200]}"
    semantic_confirmation = _resolve_facade_attr(
        "_semantic_answer_confirmation", _semantic_answer_confirmation
    )
    if cache_key in cache:
        is_confirmed = bool(cache[cache_key])
    else:
        is_confirmed = await semantic_confirmation(trimmed, stage)
        cache[cache_key] = is_confirmed
    if not is_confirmed:
        return context
    confirmed_facts[fact_key] = True
    if stage == "self_connection":
        confirmed_facts["origin_experience_confirmed"] = True
        confirmed_facts["fit_connection_confirmed"] = True
    context["confirmedFacts"] = confirmed_facts
    context["openSlots"] = _build_open_slots_from_confirmed_facts(confirmed_facts)
    return context


async def _prepare_motivation_next_question(
    request: NextQuestionRequest,
    *,
    tenant_key: str | None = None,
) -> _MotivationQuestionPrep:
    conversation_context = _normalize_conversation_context(request.conversation_context)
    generated_draft = (request.generated_draft or "").strip() or None
    if conversation_context.get("draftReady") and generated_draft:
        conversation_context["conversationMode"] = CONVERSATION_MODE_DEEPDIVE
        conversation_context["generatedDraft"] = generated_draft
    latest_user_answer = next(
        (
            message.content
            for message in reversed(request.conversation_history)
            if message.role == "user" and message.content.strip()
        ),
        None,
    )
    pre_capture_context = copy.deepcopy(conversation_context)
    conversation_context = _capture_answer_into_context(
        conversation_context,
        latest_user_answer,
    )
    conversation_context = await _apply_semantic_confirmation_post_capture(
        conversation_context,
        latest_user_answer,
        settings=settings,
    )
    industry = request.industry or conversation_context["selectedIndustry"] or "この業界"
    role_hint = _role_hint_for_rag(conversation_context, request.application_job_candidates)
    company_context_resolver = _resolve_facade_attr("_get_company_context", _get_company_context)
    company_context, company_sources = await company_context_resolver(
        request.company_id,
        role_hint=role_hint,
        tenant_key=tenant_key,
    )
    company_features = _extract_company_features(company_context, company_sources, max_features=4)
    role_candidates = _merge_candidate_lists(
        request.application_job_candidates or [],
        request.company_role_candidates or [],
        _extract_role_candidates_from_context(company_context),
        _extract_profile_job_types(request.profile_context),
        max_items=4,
    )
    work_candidates = _merge_candidate_lists(
        _sanitize_existing_grounding_candidates(request.company_work_candidates, max_items=4, max_len=32),
        _extract_work_candidates_from_context(
            company_context,
            company_sources,
            selected_role=conversation_context["selectedRole"],
            max_items=4,
        ),
        max_items=4,
    )
    conversation_context["companyAnchorKeywords"] = _merge_candidate_lists(
        conversation_context["companyAnchorKeywords"],
        company_features,
        _extract_company_keywords(
            company_context,
            company_sources,
            selected_role=conversation_context["selectedRole"],
        ),
        max_items=6,
    )
    conversation_context["companyRoleCandidates"] = _merge_candidate_lists(
        conversation_context["companyRoleCandidates"],
        role_candidates,
        max_items=4,
    )
    conversation_context["companyWorkCandidates"] = _merge_candidate_lists(
        conversation_context["companyWorkCandidates"],
        work_candidates,
        max_items=4,
    )

    evaluator = _resolve_facade_attr("_evaluate_motivation_internal", _evaluate_motivation_internal)
    eval_result = await evaluator(
        request,
        company_context=company_context,
        conversation_context=conversation_context,
    )

    if eval_result.get("evaluation_status") != "ok":
        conversation_context = pre_capture_context
        logger.warning(
            "[Motivation] evaluation %s — context fully rolled back to pre-capture state",
            eval_result.get("evaluation_status"),
        )

        if eval_result.get("evaluation_status") == "provider_failure":
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "評価処理が一時的に利用できません",
                    "error_type": "evaluation_provider_failure",
                },
            )

        if eval_result.get("evaluation_status") == "parse_failure":
            risk_flags = list(eval_result.get("risk_flags", []))
            risk_flags.append("evaluation_parse_failure")
            eval_result["risk_flags"] = risk_flags

    scores = MotivationScores(**(eval_result.get("scores") or MotivationScores().model_dump()))
    weakest_element = eval_result["weakest_element"]
    missing_slots = list(eval_result.get("missing_slots") or [])
    was_draft_ready = bool(conversation_context.get("draftReady"))
    conversation_context["slotStatusV2"] = _normalize_slot_status_v2(eval_result.get("slot_status_v2"))
    conversation_context["draftBlockers"] = list(eval_result.get("draft_blockers") or [])

    if was_draft_ready and generated_draft:
        conversation_context["conversationMode"] = CONVERSATION_MODE_DEEPDIVE

    causal_gaps = _compute_deterministic_causal_gaps(conversation_context)
    conversation_context["causalGaps"] = causal_gaps
    turn_plan = _determine_next_turn(conversation_context)
    current_slot = turn_plan.get("target_slot")
    current_intent = turn_plan.get("intent")
    next_advance_condition = turn_plan.get("next_advance_condition")
    conversation_mode = str(turn_plan.get("mode") or CONVERSATION_MODE_SLOT_FILL)
    is_complete = bool(turn_plan.get("unlock"))
    unlock_reason = turn_plan.get("unlock_reason")

    conversation_context["conversationMode"] = conversation_mode
    conversation_context["currentIntent"] = current_intent
    conversation_context["nextAdvanceCondition"] = next_advance_condition
    if current_slot:
        previous_stage = conversation_context.get("questionStage") or "industry_reason"
        previous_attempt_count = int(conversation_context.get("stageAttemptCount") or 0)
        conversation_context["questionStage"] = current_slot
        conversation_context["stageAttemptCount"] = (
            previous_attempt_count + 1 if latest_user_answer and current_slot == previous_stage else 0
        )
    else:
        conversation_context["stageAttemptCount"] = 0

    if is_complete:
        conversation_context["draftReady"] = True
        conversation_context["unlockReason"] = unlock_reason
        conversation_context["draftReadyUnlockedAt"] = (
            conversation_context.get("draftReadyUnlockedAt") or datetime.now(ZoneInfo("Asia/Tokyo")).isoformat()
        )

    progress = _build_progress_payload(
        conversation_context,
        current_slot=current_slot,
        current_intent=current_intent,
        next_advance_condition=next_advance_condition,
    )

    return _MotivationQuestionPrep(
        conversation_context=conversation_context,
        industry=industry,
        generated_draft=generated_draft,
        company_context=company_context,
        company_sources=company_sources,
        company_features=company_features,
        role_candidates=role_candidates,
        work_candidates=work_candidates,
        eval_result=eval_result,
        scores=scores,
        weakest_element=weakest_element,
        is_complete=is_complete,
        missing_slots=missing_slots,
        stage=_coerce_motivation_stage_for_ui(
            current_slot or conversation_context.get("questionStage") or "industry_reason"
        ),
        was_draft_ready=was_draft_ready,
        has_generated_draft=bool(generated_draft),
        conversation_mode=conversation_mode,
        current_slot=current_slot,
        current_intent=current_intent,
        next_advance_condition=next_advance_condition,
        unlock_reason=unlock_reason,
        progress=progress,
        causal_gaps=causal_gaps,
    )
