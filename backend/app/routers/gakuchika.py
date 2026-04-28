"""
Gakuchika (学生時代に力を入れたこと) router.

The authoring flow is split into:
- ES build: collect enough material to write a credible ES draft quickly
- Deep dive: after the draft exists, sharpen the story for interviews

Orchestration responsibilities that live in this module:
- Request / response Pydantic models (``NextQuestionRequest``, …)
- REST + SSE handlers (``get_next_question``, ``get_next_question_stream``,
  ``generate_structured_summary``, ``generate_es_draft``)
- Phase detection (``_determine_deepdive_phase``) and diagnostic tagging
  (``_build_draft_diagnostics``) — these are handler-side responsibilities
  per the Phase A.4 architecture gate decision
- Wiring between text helpers, evaluators, normalization and prompt
  templates (thin delegation wrappers preserved for test compatibility)
"""

from __future__ import annotations

import re
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.security.career_principal import (
    CareerPrincipal,
    require_career_principal,
)
from app.security.sse_concurrency import (
    SseConcurrencyExceeded,
    SseLease,
)

from app.limiter import limiter
from app.prompts.gakuchika_prompts import (
    DEEPDIVE_QUESTION_PRINCIPLES,
    REFERENCE_GUIDE_RUBRIC,
    STRUCTURED_SUMMARY_PROMPT,
    es_draft_few_shot_for,
)
from app.prompts.gakuchika_prompt_builder import (
    build_deepdive_prompt_text,
    build_es_prompt_text,
)
from app.prompts.es_templates import (
    DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
    build_template_draft_generation_prompt,
)
from app.evaluators.deepdive_completion import _evaluate_deepdive_completion
from app.evaluators.draft_quality import (
    _build_causal_gaps,
    _build_draft_quality_checks,
    _detect_gakuchika_critic_closing,
)
from app.routers.es_review_validation import (
    _compute_ai_smell_score,
    _detect_ai_smell_patterns,
    _is_within_char_limits,
)
from app.normalization.gakuchika_payload import (
    _build_coach_progress_message,
    _default_state,
    _estimate_remaining_questions,
    _extract_student_expressions,
    _normalize_deepdive_payload,
    _normalize_es_build_payload,
    _sanitize_blocked_focuses,
)
from app.routers.gakuchika_question_pipeline import (
    _generate_initial_question as _generate_initial_question_pipeline,
    _generate_next_question_progress as _generate_next_question_progress_pipeline,
    _sse_event as _sse_event_pipeline,
    _stream_schema_hints as _stream_schema_hints_pipeline,
)
from app.utils.gakuchika_text import (
    BUILD_FOCUS_FALLBACKS,
    CORE_BUILD_ELEMENTS,
    DEEPDIVE_FOCUS_FALLBACKS,
    ACTION_PATTERNS,
    ACTION_WEAK_PATTERNS,
    CONNECTIVE_PATTERNS,
    LEARNING_GENERIC_PATTERNS,
    LEARNING_PATTERNS,
    ROLE_CLARITY_PATTERNS,
    _classify_input_richness,
    _clean_string,
    _clean_string_list,
    _contains_any,
    _contains_digit,
    _fallback_build_meta,
    _normalize_text,
    _role_required,
)
from app.utils.llm import call_llm_with_error, consume_request_llm_cost_summary
from app.utils.llm_providers import _parse_json_response
from app.utils.llm_prompt_safety import (
    PromptSafetyError,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.utils.es_draft_text import normalize_es_draft_single_paragraph
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

NEXT_QUESTION_MAX_TOKENS = 420


def _check_fact_overlap(draft_text: str, student_expressions: list[str]) -> dict[str, Any]:
    if not student_expressions or not draft_text:
        return {"overlap_ok": True, "overlap_ratio": 0.0, "matched": []}
    matched = [expr for expr in student_expressions if expr in draft_text]
    ratio = len(matched) / len(student_expressions) if student_expressions else 0.0
    return {
        "overlap_ok": ratio >= 0.1,
        "overlap_ratio": round(ratio, 3),
        "matched": matched,
    }


def _format_draft_material(material: dict[str, Any] | None) -> str:
    if not isinstance(material, dict):
        return ""
    lines: list[str] = []
    readiness_reason = _clean_string(material.get("draft_readiness_reason"))
    if readiness_reason:
        lines.append(f"- 準備状況: {readiness_reason}")
    for key, label in (
        ("strength_tags", "強みタグ"),
        ("issue_tags", "注意タグ"),
        ("deferred_focuses", "追加で深掘りできる論点"),
    ):
        values = _clean_string_list(material.get(key), max_items=5)
        if values:
            lines.append(f"- {label}: {'、'.join(values)}")
    quality_checks = material.get("draft_quality_checks")
    if isinstance(quality_checks, dict):
        missing = [key for key, ok in quality_checks.items() if ok is False]
        if missing:
            lines.append(f"- 本文で補うべき観点: {'、'.join(missing[:5])}")
    return "\n".join(lines)


def _build_gakuchika_draft_quality_report(
    *,
    draft_text: str,
    user_origin_text: str,
    student_expressions: list[str],
    char_min: int,
    char_max: int,
) -> dict[str, Any]:
    ai_warnings = _detect_ai_smell_patterns(
        draft_text,
        user_origin_text,
        template_type="gakuchika",
        char_max=char_max,
    )
    smell_score = _compute_ai_smell_score(
        ai_warnings,
        template_type="gakuchika",
        char_max=char_max,
    )
    within_limits, length_detail = _is_within_char_limits(draft_text, char_min, char_max)
    critic_closing = _detect_gakuchika_critic_closing(draft_text, user_origin_text)
    fact_check = _check_fact_overlap(draft_text, student_expressions)
    failure_codes: list[str] = []
    warnings: list[str] = []
    if not within_limits:
        if str(length_detail).startswith("under_min"):
            failure_codes.append("under_char_min")
            warnings.append(f"本文が短めです（目安は{char_min}〜{char_max}字）。")
        elif str(length_detail).startswith("over_max"):
            failure_codes.append("over_char_max")
            warnings.append(f"本文が長めです（目安は{char_min}〜{char_max}字）。")
    if int(smell_score.get("tier", 0) or 0) >= 2:
        failure_codes.append("ai_smell_high")
        warnings.append("定型的・抽象的に見える表現が残っています。")
    if critic_closing.get("detected"):
        failure_codes.append("critic_closing")
        failure_codes.extend(str(code) for code in critic_closing.get("codes", []) if code)
        warnings.append("結びが評論調または結果のない学びに寄っているため、経験内の結果、または結果＋学びで締める確認が必要です。")
    if not fact_check["overlap_ok"]:
        failure_codes.append("low_fact_overlap")
        warnings.append("本人の言葉や具体表現の反映が弱い可能性があります。")
    return {
        "failure_codes": list(dict.fromkeys(failure_codes)),
        "warnings": list(dict.fromkeys(warnings)),
        "ai_warnings": ai_warnings,
        "ai_smell_score": smell_score,
        "within_limits": within_limits,
        "length_detail": length_detail,
        "critic_closing": critic_closing,
        "fact_overlap": fact_check,
    }


def _build_gakuchika_draft_retry_hints(report: dict[str, Any], *, char_min: int, char_max: int) -> list[str]:
    codes = set(report.get("failure_codes") or [])
    hints: list[str] = []
    if "under_char_min" in codes:
        hints.append(f"内容を保ったまま具体的な行動・結果を補い、{char_min}字以上にする")
    if "over_char_max" in codes:
        hints.append(f"冗長な抽象表現を削り、{char_max}字以内に収める")
    if "critic_closing" in codes or "resultless_closing" in codes:
        hints.append("結びは必ず経験内の結果、または結果を書いた直後の学びで締める")
    if "critic_closing" in codes:
        hints.append("「手法は〜に直結する」「〜と言える」「〜が重要である」のような一般論で終えない")
    if "resultless_closing" in codes:
        hints.append("最終2文のどちらかに、成果・数字・前後差・改善結果を明示する")
    if "ai_smell_high" in codes:
        hints.append("抽象名詞を主語にした一般論を避け、本人の経験内の具体事実・結果・学びを主語に戻す")
    if "low_fact_overlap" in codes:
        hints.append("会話中の本人の表現・数値・固有名を少なくとも1つ自然に残す")
    return list(dict.fromkeys(hints))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class ConversationStateInput(BaseModel):
    stage: str | None = Field(default=None, max_length=40)
    focus_key: str | None = Field(default=None, max_length=40)
    progress_label: str | None = Field(default=None, max_length=80)
    answer_hint: str | None = Field(default=None, max_length=160)
    input_richness_mode: str | None = Field(default=None, max_length=32)
    missing_elements: list[str] = Field(default_factory=list)
    draft_quality_checks: dict[str, bool] = Field(default_factory=dict)
    causal_gaps: list[str] = Field(default_factory=list)
    completion_checks: dict[str, bool] = Field(default_factory=dict)
    ready_for_draft: bool = False
    draft_readiness_reason: str | None = Field(default=None, max_length=240)
    draft_text: str | None = Field(default=None, max_length=3000)
    draft_document_id: str | None = Field(default=None, max_length=120)
    summary_stale: bool = False
    strength_tags: list[str] = Field(default_factory=list)
    issue_tags: list[str] = Field(default_factory=list)
    deepdive_recommendation_tags: list[str] = Field(default_factory=list)
    credibility_risk_tags: list[str] = Field(default_factory=list)
    deepdive_stage: str | None = Field(default=None, max_length=40)
    deepdive_complete: bool = False
    completion_reasons: list[str] = Field(default_factory=list)
    asked_focuses: list[str] = Field(default_factory=list)
    resolved_focuses: list[str] = Field(default_factory=list)
    deferred_focuses: list[str] = Field(default_factory=list)
    blocked_focuses: list[str] = Field(default_factory=list)
    recent_question_texts: list[str] = Field(default_factory=list)
    loop_blocked_focuses: list[str] = Field(default_factory=list)
    focus_attempt_counts: dict[str, int] = Field(default_factory=dict)
    last_question_signature: str | None = Field(default=None, max_length=120)
    extended_deep_dive_round: int = Field(default=0, ge=0, le=100)
    # Round-trip fields surfaced to the client via SSE (pass-through on resume).
    coach_progress_message: str | None = Field(default=None, max_length=120)
    paused_question: str | None = Field(default=None, max_length=300)
    remaining_questions_estimate: int | None = Field(default=None, ge=0, le=20)
    retry_degraded: bool = False

    model_config = {"extra": "ignore"}


class NextQuestionRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    gakuchika_content: Optional[str] = Field(default=None, max_length=5000)
    char_limit_type: Optional[str] = Field(default=None, pattern=r"^(300|400|500)$")
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    conversation_state: Optional[ConversationStateInput] = None


class NextQuestionResponse(BaseModel):
    question: str
    conversation_state: dict[str, Any]
    next_action: str = "ask"
    internal_telemetry: Optional[dict[str, object]] = None


class StructuredSummaryRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    draft_text: str = Field(max_length=3000)
    conversation_history: list[Message]


class StrengthItem(BaseModel):
    title: str
    description: str


class LearningItem(BaseModel):
    title: str
    description: str


class StructuredSummaryResponse(BaseModel):
    situation_text: str
    task_text: str
    action_text: str
    result_text: str
    strengths: list[StrengthItem]
    learnings: list[LearningItem]
    numbers: list[str]
    interviewer_hooks: list[str] = []
    decision_reasons: list[str] = []
    before_after_comparisons: list[str] = []
    credibility_notes: list[str] = []
    role_scope: str = ""
    reusable_principles: list[str] = []
    interview_supporting_details: list[str] = []
    future_outlook_notes: list[str] = []
    backstory_notes: list[str] = []
    one_line_core_answer: str = ""
    likely_followup_questions: list[str] = []
    weak_points_to_prepare: list[str] = []
    two_minute_version_outline: list[str] = []
    internal_telemetry: Optional[dict[str, object]] = None


class GakuchikaESDraftRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    conversation_history: list[Message]
    char_limit: int = Field(default=400, ge=300, le=500)
    known_facts: str | None = Field(default=None, max_length=3000)
    draft_material: dict[str, Any] | None = None


class GakuchikaESDraftResponse(BaseModel):
    draft: str
    char_count: int
    followup_suggestion: str = "更に深掘りする"
    draft_diagnostics: dict[str, list[str]] | None = None
    draft_quality: dict[str, Any] | None = None
    internal_telemetry: Optional[dict[str, object]] = None


# ---------------------------------------------------------------------------
# Request-scoped sanitisation / formatting helpers
# ---------------------------------------------------------------------------

def _format_conversation(messages: list[Message]) -> str:
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        content = sanitize_user_prompt_text(msg.content, max_length=3000) if msg.role == "user" else msg.content
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def _format_user_answers(messages: list[Message]) -> str:
    return "\n\n".join(
        sanitize_user_prompt_text(msg.content, max_length=3000)
        for msg in messages
        if msg.role == "user" and msg.content.strip()
    )


def _prompt_safety_http_error() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail="内部設定や秘匿情報に関する指示は受け付けられません。",
    )


def _sanitize_messages(messages: list[Message]) -> None:
    for msg in messages:
        if msg.role == "user":
            msg.content = sanitize_user_prompt_text(msg.content, max_length=3000)


def _sanitize_next_question_request(request: NextQuestionRequest) -> None:
    request.gakuchika_title = sanitize_user_prompt_text(request.gakuchika_title, max_length=200).strip()
    if request.gakuchika_content is not None:
        request.gakuchika_content = sanitize_user_prompt_text(
            request.gakuchika_content,
            max_length=5000,
            rich_text=True,
        )
    if request.conversation_state and request.conversation_state.draft_text is not None:
        request.conversation_state.draft_text = sanitize_user_prompt_text(
            request.conversation_state.draft_text,
            max_length=3000,
            rich_text=True,
        )
    _sanitize_messages(request.conversation_history)


def _sanitize_summary_request(request: StructuredSummaryRequest) -> None:
    request.gakuchika_title = sanitize_user_prompt_text(request.gakuchika_title, max_length=200).strip()
    request.draft_text = sanitize_user_prompt_text(request.draft_text, max_length=3000, rich_text=True)
    _sanitize_messages(request.conversation_history)


def _sanitize_es_draft_request(request: GakuchikaESDraftRequest) -> None:
    request.gakuchika_title = sanitize_user_prompt_text(request.gakuchika_title, max_length=200).strip()
    if request.known_facts is not None:
        request.known_facts = sanitize_user_prompt_text(request.known_facts, max_length=3000, rich_text=True)
    _sanitize_messages(request.conversation_history)


def _extract_question_from_text(raw_text: str) -> Optional[str]:
    if not raw_text:
        return None
    stripped = raw_text.strip()
    if not stripped or stripped.startswith("{") or stripped.startswith("```"):
        return None
    line = stripped.splitlines()[0].strip().strip('"')
    return line or None


def _parse_json_payload(raw_text: str) -> dict[str, Any]:
    parsed = _parse_json_response(raw_text)
    if isinstance(parsed, dict):
        return parsed
    question = _extract_question_from_text(raw_text)
    if question:
        return {"question": question}
    return {}


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


def _build_user_corpus(messages: list[Message], *, initial_content: str | None = None, draft_text: str | None = None) -> str:
    parts: list[str] = []
    if initial_content:
        parts.append(initial_content.strip())
    parts.extend(msg.content.strip() for msg in messages if msg.role == "user" and msg.content.strip())
    if draft_text:
        parts.append(draft_text.strip())
    return "\n".join(part for part in parts if part)


# ---------------------------------------------------------------------------
# Handler-side diagnostics / orchestration
# ---------------------------------------------------------------------------

def _build_draft_diagnostics(draft_text: str) -> dict[str, list[str]]:
    """Tag diagnostic attributes (strength / issue / recommendation / risk).

    Kept in the router layer because the output drives UX messaging +
    deep-dive prompt scaffolding, both of which are handler responsibilities.
    """
    normalized = _normalize_text(draft_text)
    strength_tags: list[str] = []
    issue_tags: list[str] = []
    deepdive_recommendation_tags: list[str] = []
    credibility_risk_tags: list[str] = []

    action_visible = _contains_any(normalized, ACTION_PATTERNS)
    result_visible = _contains_digit(normalized) or _contains_any(normalized, ("増", "減", "向上", "改善", "結果"))
    learning_visible = _contains_any(normalized, LEARNING_PATTERNS)

    if action_visible:
        strength_tags.append("action_visible")
    if result_visible:
        strength_tags.append("result_visible")
    if _contains_any(normalized, ROLE_CLARITY_PATTERNS):
        strength_tags.append("ownership_visible")
    if _contains_any(normalized, ("活か", "次", "今後", "再現")):
        strength_tags.append("learning_transfer_visible")

    if not action_visible or _contains_any(normalized, ACTION_WEAK_PATTERNS):
        issue_tags.append("action_specificity_weak")
        deepdive_recommendation_tags.append("deepen_action_reason")
    if not result_visible:
        issue_tags.append("result_evidence_thin")
        deepdive_recommendation_tags.append("collect_result_evidence")
    else:
        deepdive_recommendation_tags.append("result_traceability_check")
        if not _contains_any(normalized, CONNECTIVE_PATTERNS):
            issue_tags.append("result_traceability_weak")
    if not learning_visible:
        issue_tags.append("learning_missing")
        deepdive_recommendation_tags.append("learning_transfer")
    elif _contains_any(normalized, LEARNING_GENERIC_PATTERNS) and not _contains_any(
        normalized, ("活か", "今後", "再現", "原則")
    ):
        issue_tags.append("learning_generic")
        deepdive_recommendation_tags.append("deepen_learning_transfer")
    if _role_required(normalized) and not _contains_any(normalized, ROLE_CLARITY_PATTERNS):
        credibility_risk_tags.append("ownership_ambiguous")
        deepdive_recommendation_tags.append("clarify_role_scope")

    return {
        "strength_tags": list(dict.fromkeys(strength_tags)),
        "issue_tags": list(dict.fromkeys(issue_tags)),
        "deepdive_recommendation_tags": list(dict.fromkeys(deepdive_recommendation_tags)),
        "credibility_risk_tags": list(dict.fromkeys(credibility_risk_tags)),
    }


def _determine_deepdive_phase(
    question_count: int,
    *,
    asked_focuses: list[str] | None = None,
    resolved_focuses: list[str] | None = None,
    blocked_focuses: list[str] | None = None,
    loop_blocked_focuses: list[str] | None = None,
) -> tuple[str, str, list[str]]:
    """Map deep-dive question count to (phase_name, description, preferred_focuses).

    Orchestration: the handler decides which phase to drive and passes the
    tuple to the prompt-template builder.
    """
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


# ---------------------------------------------------------------------------
# Prompt-builder wrappers (thin orchestration layer)
# ---------------------------------------------------------------------------

def _build_es_prompt(request: NextQuestionRequest) -> tuple[str, str]:
    """Orchestrate ES-build prompt: derive primitives, delegate formatting.

    Returns ``(system_prompt, user_message)``.  The system half is stable
    across turns (persona + rules + few-shot) and safe to cache; the user
    half carries the per-turn dynamic content (conversation, known
    facts, asked / blocked focuses).
    """
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
    """Orchestrate deep-dive prompt: decide phase, collect diagnostic tags,
    delegate template formatting to ``prompts.gakuchika_prompt_builder``.

    Returns ``(system_prompt, user_message)``.
    """
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
    """Assemble (question, state) for an initial-question fallback.

    Shared between the empty-content early return and the LLM-failure path so
    both hands emit the same shape (coach message + remaining questions +
    missing_elements).
    """
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


async def _generate_initial_question(request: NextQuestionRequest) -> tuple[str, dict[str, Any]]:
    return await _generate_initial_question_pipeline(request)


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse_event(event_type: str, data: dict[str, Any]) -> str:
    return _sse_event_pipeline(event_type, data)


def _stream_schema_hints(is_deepdive: bool) -> dict[str, str]:
    return _stream_schema_hints_pipeline(is_deepdive)


async def _generate_next_question_progress(request: NextQuestionRequest) -> AsyncGenerator[str, None]:
    async for chunk in _generate_next_question_progress_pipeline(request):
        yield chunk


# ---------------------------------------------------------------------------
# HTTP handlers
# ---------------------------------------------------------------------------

@router.post("/next-question", response_model=NextQuestionResponse)
@limiter.limit("60/minute")
async def get_next_question(payload: NextQuestionRequest, request: Request):
    try:
        _sanitize_next_question_request(payload)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    has_user_response = any(msg.role == "user" for msg in payload.conversation_history)
    if not has_user_response and not _is_deepdive_request(payload):
        question, state = await _generate_initial_question(payload)
        return NextQuestionResponse(
            question=question,
            conversation_state=state,
            next_action=_resolve_next_action(state),
            internal_telemetry=consume_request_llm_cost_summary("gakuchika"),
        )

    is_deepdive = _is_deepdive_request(payload)
    system_prompt, user_message = (
        _build_deepdive_prompt(payload) if is_deepdive else _build_es_prompt(payload)
    )
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=NEXT_QUESTION_MAX_TOKENS,
        temperature=0.35,
        feature="gakuchika",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "AIサービスに接続できませんでした。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data if llm_result.data is not None else _parse_json_payload(llm_result.raw_text or "")
    if is_deepdive:
        question, state, _ = _normalize_deepdive_payload(
            data,
            payload.conversation_state,
            conversation_history=[msg.model_dump(mode="python") for msg in payload.conversation_history],
            conversation_text=_build_user_corpus(
                payload.conversation_history,
                initial_content=payload.gakuchika_content,
                draft_text=payload.conversation_state.draft_text if payload.conversation_state else None,
            ),
            draft_text=payload.conversation_state.draft_text if payload.conversation_state else "",
            question_count=payload.question_count,
        )
    else:
        question, state, _ = _normalize_es_build_payload(
            data,
            payload.conversation_state,
            conversation_history=[msg.model_dump(mode="python") for msg in payload.conversation_history],
            conversation_text=_build_user_corpus(
                payload.conversation_history,
                initial_content=payload.gakuchika_content,
            ),
            input_richness_mode=(
                payload.conversation_state.input_richness_mode
                if payload.conversation_state
                else _classify_input_richness(payload.gakuchika_content or payload.gakuchika_title)
            ),
            question_count=payload.question_count,
        )

    return NextQuestionResponse(
        question=question,
        conversation_state=state,
        next_action=_resolve_next_action(state),
        internal_telemetry=consume_request_llm_cost_summary("gakuchika"),
    )


@router.post("/next-question/stream")
@limiter.limit("60/minute")
async def get_next_question_stream(
    payload: NextQuestionRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    try:
        _sanitize_next_question_request(payload)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    # NextQuestionRequest has no company_id, so no mismatch check is needed here.
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
            async for chunk in _generate_next_question_progress(payload):
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


@router.post("/structured-summary")
@limiter.limit("60/minute")
async def generate_structured_summary(payload: StructuredSummaryRequest, request: Request):
    try:
        _sanitize_summary_request(payload)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    if not payload.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    prompt = STRUCTURED_SUMMARY_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(payload.gakuchika_title, max_length=200),
        draft_text=sanitize_prompt_input(payload.draft_text, max_length=1800),
        conversation=_format_conversation(payload.conversation_history),
        deepdive_question_principles=DEEPDIVE_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
    )
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の内容をSTAR構造と面接メモに整理してください。",
        max_tokens=1600,
        temperature=0.3,
        feature="gakuchika",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success or llm_result.data is None:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "構造化サマリー生成中にエラーが発生しました。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data
    strengths = data.get("strengths", [])
    if strengths and isinstance(strengths[0], str):
        strengths = [{"title": item, "description": ""} for item in strengths]
    learnings = data.get("learnings", [])
    if learnings and isinstance(learnings[0], str):
        learnings = [{"title": item, "description": ""} for item in learnings]

    return StructuredSummaryResponse(
        situation_text=_clean_string(data.get("situation_text")),
        task_text=_clean_string(data.get("task_text")),
        action_text=_clean_string(data.get("action_text")),
        result_text=_clean_string(data.get("result_text")),
        strengths=strengths,
        learnings=learnings,
        numbers=_clean_string_list(data.get("numbers")),
        interviewer_hooks=_clean_string_list(data.get("interviewer_hooks"), max_items=3),
        decision_reasons=_clean_string_list(data.get("decision_reasons"), max_items=3),
        before_after_comparisons=_clean_string_list(data.get("before_after_comparisons"), max_items=3),
        credibility_notes=_clean_string_list(data.get("credibility_notes"), max_items=3),
        role_scope=_clean_string(data.get("role_scope")),
        reusable_principles=_clean_string_list(data.get("reusable_principles"), max_items=3),
        interview_supporting_details=_clean_string_list(data.get("interview_supporting_details"), max_items=3),
        future_outlook_notes=_clean_string_list(data.get("future_outlook_notes"), max_items=2),
        backstory_notes=_clean_string_list(data.get("backstory_notes"), max_items=2),
        one_line_core_answer=_clean_string(data.get("one_line_core_answer")),
        likely_followup_questions=_clean_string_list(data.get("likely_followup_questions"), max_items=4),
        weak_points_to_prepare=_clean_string_list(data.get("weak_points_to_prepare"), max_items=3),
        two_minute_version_outline=_clean_string_list(data.get("two_minute_version_outline"), max_items=4),
        internal_telemetry=consume_request_llm_cost_summary("gakuchika_summary"),
    )


@router.post("/generate-es-draft", response_model=GakuchikaESDraftResponse)
@limiter.limit("60/minute")
async def generate_es_draft(payload: GakuchikaESDraftRequest, request: Request):
    if not payload.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")
    if payload.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")
    try:
        _sanitize_es_draft_request(payload)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    conversation_text = _format_conversation(payload.conversation_history)
    user_answers_text = _format_user_answers(payload.conversation_history)
    char_min = int(payload.char_limit * 0.9)
    title = sanitize_prompt_input(payload.gakuchika_title, max_length=200)
    draft_material_text = _format_draft_material(payload.draft_material)
    known_facts_text = _clean_string(payload.known_facts)
    material_sections = [f"テーマ: {title}", conversation_text]
    if known_facts_text:
        material_sections.append(f"【本人が話した具体事実】\n{known_facts_text}")
    if draft_material_text:
        material_sections.append(f"【材料診断】\n{draft_material_text}")
    primary_body = "\n\n".join(section for section in material_sections if section)
    # Phase B.5: pull up to 5 of the student's own-words expressions so the
    # draft can reuse them verbatim rather than over-polishing everything.
    student_expressions = _extract_student_expressions(payload.conversation_history, max_items=5)
    system_prompt, user_prompt = build_template_draft_generation_prompt(
        "gakuchika",
        company_name=None,
        industry=None,
        question=DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA,
        char_min=char_min,
        char_max=payload.char_limit,
        primary_material_heading="【テーマと会話】",
        primary_material_body=primary_body,
        output_json_kind="gakuchika",
        role_name=None,
        company_evidence_cards=None,
        has_rag=False,
        grounding_mode="none",
        student_expressions=student_expressions,
    )
    # Phase B.3: inject char_limit-tuned allocation guide. Kept on the system
    # side so that repeated drafts of the same shape hit the prompt cache.
    draft_few_shot = es_draft_few_shot_for(payload.char_limit)
    if draft_few_shot:
        system_prompt = f"{system_prompt}\n\n{draft_few_shot}"
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_prompt,
        max_tokens=1400,
        temperature=0.3,
        feature="gakuchika_draft",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success or llm_result.data is None:
        if llm_result.raw_text:
            raw = llm_result.raw_text.strip()
            match = re.search(r'"draft"\s*:\s*"((?:[^"\\]|\\.)*)', raw, re.DOTALL)
            if match:
                draft_text = match.group(1).replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
                if not draft_text.endswith(("。", "」", "）")):
                    last_period = draft_text.rfind("。")
                    if last_period > len(draft_text) * 0.5:
                        draft_text = draft_text[: last_period + 1]
                if len(draft_text) >= 100:
                    draft_text = normalize_es_draft_single_paragraph(draft_text)
                    quality_report = _build_gakuchika_draft_quality_report(
                        draft_text=draft_text,
                        user_origin_text=user_answers_text,
                        student_expressions=student_expressions,
                        char_min=char_min,
                        char_max=payload.char_limit,
                    )
                    return GakuchikaESDraftResponse(
                        draft=draft_text,
                        char_count=len(draft_text),
                        draft_quality={
                            "status": "warning" if quality_report["failure_codes"] else "passed",
                            "warnings": quality_report["warnings"],
                            "retry_count": 0,
                            "failure_codes": quality_report["failure_codes"],
                        },
                        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
                    )
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "ES生成中にエラーが発生しました。",
            },
        )

    data = llm_result.data
    draft = normalize_es_draft_single_paragraph(_clean_string(data.get("draft")))
    followup_suggestion = _clean_string(data.get("followup_suggestion")) or "更に深掘りする"
    initial_quality = _build_gakuchika_draft_quality_report(
        draft_text=draft,
        user_origin_text=user_answers_text,
        student_expressions=student_expressions,
        char_min=char_min,
        char_max=payload.char_limit,
    )
    retry_count = 0
    selected_reason = "initial"
    if initial_quality["failure_codes"]:
        retry_hints = _build_gakuchika_draft_retry_hints(
            initial_quality,
            char_min=char_min,
            char_max=payload.char_limit,
        )
        if retry_hints:
            retry_system_prompt = (
                f"{system_prompt}\n\n"
                "## 品質修正指示\n"
                + "\n".join(f"- {hint}" for hint in retry_hints)
            )
            retry_result = await call_llm_with_error(
                system_prompt=retry_system_prompt,
                user_message=user_prompt,
                max_tokens=1400,
                temperature=0.25,
                feature="gakuchika_draft",
                retry_on_parse=True,
                disable_fallback=True,
            )
            retry_count = 1
            if retry_result.success and retry_result.data is not None:
                retry_draft = normalize_es_draft_single_paragraph(
                    _clean_string(retry_result.data.get("draft"))
                )
                retry_quality = _build_gakuchika_draft_quality_report(
                    draft_text=retry_draft,
                    user_origin_text=user_answers_text,
                    student_expressions=student_expressions,
                    char_min=char_min,
                    char_max=payload.char_limit,
                )
                initial_fail_count = len(initial_quality["failure_codes"])
                retry_fail_count = len(retry_quality["failure_codes"])
                initial_score = float(initial_quality["ai_smell_score"].get("score", 0.0) or 0.0)
                retry_score = float(retry_quality["ai_smell_score"].get("score", 0.0) or 0.0)
                initial_codes = set(initial_quality["failure_codes"])
                retry_codes = set(retry_quality["failure_codes"])
                if (
                    retry_draft
                    and retry_codes.issubset(initial_codes)
                    and (
                        retry_fail_count < initial_fail_count
                        or (
                            retry_quality["within_limits"]
                            and retry_quality["fact_overlap"]["overlap_ok"]
                            and retry_fail_count == initial_fail_count
                            and retry_score < initial_score
                        )
                    )
                ):
                    draft = retry_draft
                    initial_quality = retry_quality
                    selected_reason = "retry_improved"

    draft_diagnostics = _build_draft_diagnostics(draft)
    fact_check = initial_quality["fact_overlap"]
    if not fact_check["overlap_ok"]:
        logger.warning(
            "gakuchika_draft_low_fact_overlap",
            overlap_ratio=fact_check["overlap_ratio"],
            matched_count=len(fact_check["matched"]),
            total_expressions=len(student_expressions),
        )
    quality_status = (
        "passed"
        if not initial_quality["failure_codes"] and retry_count == 0
        else "repaired"
        if not initial_quality["failure_codes"]
        else "warning"
    )
    return GakuchikaESDraftResponse(
        draft=draft,
        char_count=len(draft),
        followup_suggestion=followup_suggestion,
        draft_diagnostics=draft_diagnostics,
        draft_quality={
            "status": quality_status,
            "warnings": initial_quality["warnings"],
            "retry_count": retry_count,
            "failure_codes": initial_quality["failure_codes"],
            "selection_reason": selected_reason,
        },
        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
    )
