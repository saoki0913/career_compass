"""Core Gakuchika question orchestration helpers."""

from __future__ import annotations

from typing import Any

from app.normalization.gakuchika_payload import (
    _build_coach_progress_message,
    _default_state,
    _estimate_remaining_questions,
    _sanitize_blocked_focuses,
)
from app.prompts.gakuchika_prompt_builder import (
    build_deepdive_prompt_text,
    build_es_prompt_text,
)
from app.services.gakuchika.models import Message, NextQuestionRequest
from app.utils.gakuchika_text import (
    CORE_BUILD_ELEMENTS,
    _classify_input_richness,
    _clean_string,
    _fallback_build_meta,
)
from app.utils.llm_prompt_safety import sanitize_user_prompt_text


NEXT_QUESTION_MAX_TOKENS = 420


def _format_conversation(messages: list[Message]) -> str:
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        content = sanitize_user_prompt_text(msg.content, max_length=3000) if msg.role == "user" else msg.content
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def _build_known_facts(messages: list[Message]) -> str:
    user_answers = [msg.content.strip() for msg in messages if msg.role == "user" and msg.content.strip()]
    if not user_answers:
        return "- まだ整理済みの事実は少ない"

    def _truncate(text: str, limit: int = 240) -> str:
        return text if len(text) <= limit else text[: limit - 1] + "…"

    if len(user_answers) <= 5:
        selected = user_answers
    else:
        selected = user_answers[:2] + user_answers[-3:]

    bullets = [f"- {_truncate(answer)}" for answer in selected]
    facts = "\n".join(bullets)

    total_cap = 1200
    if len(facts) <= total_cap:
        return facts

    truncated: list[str] = []
    running = 0
    for bullet in bullets:
        if running + len(bullet) + 1 > total_cap:
            break
        truncated.append(bullet)
        running += len(bullet) + 1
    return "\n".join(truncated) if truncated else bullets[0][: total_cap - 1] + "…"


def _build_user_corpus(
    messages: list[Message],
    *,
    initial_content: str | None = None,
    draft_text: str | None = None,
) -> str:
    parts: list[str] = []
    if initial_content:
        parts.append(initial_content.strip())
    parts.extend(msg.content.strip() for msg in messages if msg.role == "user" and msg.content.strip())
    if draft_text:
        parts.append(draft_text.strip())
    return "\n".join(part for part in parts if part)


def _determine_deepdive_phase(
    question_count: int,
    *,
    asked_focuses: list[str] | None = None,
    resolved_focuses: list[str] | None = None,
    blocked_focuses: list[str] | None = None,
    loop_blocked_focuses: list[str] | None = None,
) -> tuple[str, str, list[str]]:
    if question_count <= 2:
        phase_name, phase_desc, preferred_focuses = ("es_aftercare", "ES本文の骨格に対して判断理由と役割の解像度を上げる", ["challenge", "role", "action_reason"])
    elif question_count <= 5:
        phase_name, phase_desc, preferred_focuses = ("evidence_enhancement", "成果の根拠・信憑性・再現可能性を補強する", ["result_evidence", "credibility", "learning_transfer"])
    else:
        phase_name, phase_desc, preferred_focuses = ("interview_expansion", "将来展望や原体験まで含めて人物像を厚くする", ["future", "backstory", "learning_transfer"])

    if asked_focuses is not None:
        from app.normalization.gakuchika_question_planner import (
            _compute_group_coverage,
            _select_next_deepdive_focus_by_coverage,
        )
        coverage = _compute_group_coverage(
            asked_focuses,
            resolved_focuses or [],
            blocked_focuses or [],
            loop_blocked_focuses or [],
        )
        redirect = _select_next_deepdive_focus_by_coverage(
            coverage, preferred_focuses[0] if preferred_focuses else None, question_count,
        )
        if redirect and redirect not in preferred_focuses:
            preferred_focuses = [redirect, *preferred_focuses]

    return phase_name, phase_desc, preferred_focuses


def _resolve_next_action(state: dict[str, Any]) -> str:
    stage = _clean_string(state.get("stage")) or "es_building"
    draft_text = _clean_string(state.get("draft_text"))
    if stage == "interview_ready":
        return "show_interview_ready" if draft_text else "ask"
    if stage == "draft_ready":
        return "continue_deep_dive" if draft_text else "show_generate_draft_cta"
    return "ask"


def _is_deepdive_request(request: NextQuestionRequest) -> bool:
    state = request.conversation_state
    if not state:
        return False
    if not state.draft_text:
        return False
    return state.stage in {
        "draft_ready",
        "deep_dive_active",
        "interview_ready",
    }


def _build_es_prompt(request: NextQuestionRequest) -> tuple[str, str]:
    input_richness_mode = (
        request.conversation_state.input_richness_mode
        if request.conversation_state and request.conversation_state.input_richness_mode
        else _classify_input_richness(request.gakuchika_content or request.gakuchika_title)
    )
    state = request.conversation_state
    asked = list(state.asked_focuses) if state else []
    blocked = _sanitize_blocked_focuses(
        state.blocked_focuses if state else [],
        stage=state.stage if state else "es_building",
        missing_elements=list(state.missing_elements) if state else [],
    )
    loop_blocked = list(state.loop_blocked_focuses) if state else []
    return build_es_prompt_text(
        gakuchika_title=request.gakuchika_title,
        conversation_text=_format_conversation(request.conversation_history),
        known_facts=_build_known_facts(request.conversation_history),
        input_richness_mode=input_richness_mode,
        asked_focuses=asked,
        blocked_focuses=list(dict.fromkeys([*blocked, *loop_blocked])),
    )


def _build_deepdive_prompt(request: NextQuestionRequest) -> tuple[str, str]:
    state = request.conversation_state
    draft_text = state.draft_text if state else ""
    ext_round = int(state.extended_deep_dive_round or 0) if state else 0
    asked = list(state.asked_focuses) if state else []
    resolved = list(state.resolved_focuses) if state else []
    blocked = _sanitize_blocked_focuses(
        state.blocked_focuses if state else [],
        stage=state.stage if state else "deep_dive_active",
        missing_elements=list(state.missing_elements) if state else [],
    )
    loop_blocked = list(state.loop_blocked_focuses) if state else []

    deepdive_turn_count = max(
        0,
        len([focus for focus in asked if focus not in CORE_BUILD_ELEMENTS]),
    )
    phase_name, phase_description, preferred_focuses = _determine_deepdive_phase(
        deepdive_turn_count,
        asked_focuses=asked,
        resolved_focuses=resolved,
        blocked_focuses=blocked,
        loop_blocked_focuses=loop_blocked,
    )

    from app.normalization.gakuchika_question_planner import (
        _compute_group_coverage,
        _render_coverage_summary,
    )
    coverage = _compute_group_coverage(asked, resolved, blocked, loop_blocked)
    coverage_summary = _render_coverage_summary(coverage)

    return build_deepdive_prompt_text(
        gakuchika_title=request.gakuchika_title,
        draft_text=draft_text or "",
        conversation_text=_format_conversation(request.conversation_history),
        phase_name=phase_name,
        phase_description=phase_description,
        preferred_focuses=preferred_focuses,
        extended_deep_dive_round=ext_round,
        strength_tags=list(state.strength_tags) if state else [],
        issue_tags=list(state.issue_tags) if state else [],
        deepdive_recommendation_tags=list(state.deepdive_recommendation_tags) if state else [],
        credibility_risk_tags=list(state.credibility_risk_tags) if state else [],
        asked_focuses=asked,
        blocked_focuses=list(dict.fromkeys([*blocked, *loop_blocked])),
        coverage_summary=coverage_summary,
    )


def _build_initial_fallback_response(
    *,
    focus_key: str,
    input_richness_mode: str,
    question_count: int,
) -> tuple[str, dict[str, Any]]:
    fallback = _fallback_build_meta(focus_key)
    missing_elements = list(CORE_BUILD_ELEMENTS)
    coach_message = _build_coach_progress_message(
        stage="es_building",
        resolved_focuses=[],
        missing_elements=missing_elements,
        focus_key=focus_key,
        ready_for_draft=False,
    )
    remaining_estimate = _estimate_remaining_questions(
        stage="es_building",
        question_count=question_count,
        missing_elements=missing_elements,
        quality_checks={},
        causal_gaps=[],
        ready_for_draft=False,
        role_required=False,
    )
    state = _default_state(
        "es_building",
        focus_key=focus_key,
        progress_label=fallback["progress_label"],
        answer_hint=fallback["answer_hint"],
        input_richness_mode=input_richness_mode,
        missing_elements=missing_elements,
        draft_quality_checks={},
        causal_gaps=[],
        ready_for_draft=False,
        draft_text=None,
        coach_progress_message=coach_message,
        remaining_questions_estimate=remaining_estimate,
    )
    return fallback["question"], state
