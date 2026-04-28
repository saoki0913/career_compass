"""
Normalization layer for the Gakuchika feature.

Converts raw LLM JSON output into the ``ConversationState`` dict shape the
front-end expects.  Pure functions — no LLM calls, no HTTP layer.

Public entry points:
- ``_normalize_es_build_payload`` — ES-build stage
- ``_normalize_deepdive_payload`` — deep-dive stage

Supporting helpers exported for router orchestration:
- ``_default_state`` — blank state dict factory
- ``app.normalization.gakuchika_question_planner`` — question planning helpers
  re-exported here for backward compatibility
- ``_extract_student_expressions`` (Phase B.5) — pull up to N "own-words"
  expressions (quoted / numeric / first-person action) from user turns for
  injection into the ES draft prompt as suggestions
- ``_build_coach_progress_message`` (Phase B.7) — deterministic coach-voice
  progress cue for the ``NaturalProgressStatus`` UI chip
- ``_estimate_remaining_questions`` (M4, 2026-04-17) — deterministic remaining
  question count aligned with the readiness gate, used by the UI "あと◯問"
  chip so client and server agree on draft-ready timing

Environment toggles:
- ``GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY`` — override per-user min
- ``AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES`` — lower cap for local AI live tests
- ``GAKUCHIKA_FORCE_DRAFT_READY_AFTER`` — force draft-ready after N questions
"""

from __future__ import annotations

import os
import re
from typing import TYPE_CHECKING, Any

from app.evaluators.deepdive_completion import _evaluate_deepdive_completion
from app.evaluators.draft_quality import _build_causal_gaps, _build_draft_quality_checks
from app.evaluators.question_quality import _evaluate_question_quality
from app.normalization.gakuchika_question_planner import (
    _build_core_missing_elements,
    _compute_group_coverage,
    _critical_causal_gaps,
    _derive_focus_tracking,
    _detect_es_focus_from_missing,
    _estimate_remaining_questions,
    _sanitize_blocked_focuses,
    _select_next_deepdive_focus_by_coverage,
)
from app.utils.gakuchika_text import (
    BUILD_ELEMENTS,
    CORE_BUILD_ELEMENTS,
    DEEPDIVE_FOCUSES,
    DRAFT_QUALITY_CHECK_KEYS,
    _build_focus_meta,
    _clean_bool_map,
    _clean_string,
    _clean_string_list,
    _fallback_build_meta,
    _fallback_deepdive_meta,
)
from app.utils.question_loop_detector import (
    LOOP_DETECTION_WINDOW,
    _detect_question_loops_in_history,
)

if TYPE_CHECKING:  # pragma: no cover — typing only
    from app.routers.gakuchika import ConversationStateInput


# ---------------------------------------------------------------------------
# Tunable thresholds
# ---------------------------------------------------------------------------

MIN_USER_ANSWERS_FOR_ES_DRAFT_READY = 4
MIN_USER_ANSWERS_FOR_INTERVIEW_READY = 8


def _min_user_answers_for_es_draft_ready() -> int:
    raw = os.getenv("GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY", "").strip()
    if raw.isdigit():
        return max(1, min(10, int(raw)))
    return MIN_USER_ANSWERS_FOR_ES_DRAFT_READY


def _es_build_question_cap_threshold() -> int:
    """Lower cap for local ai-live E2E when AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES=1."""
    if os.getenv("AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES", "").strip() == "1":
        return 5
    return 6


def _force_draft_ready_after() -> int:
    """Return question count after which draft-ready is forced (0 = disabled).

    Opt-in via ``GAKUCHIKA_FORCE_DRAFT_READY_AFTER=N`` for CI / E2E tests
    that need deterministic convergence.  Not set in production.
    """
    raw = os.getenv("GAKUCHIKA_FORCE_DRAFT_READY_AFTER", "").strip()
    if raw.isdigit() and int(raw) > 0:
        return int(raw)
    return 0


# ---------------------------------------------------------------------------
# Missing-element / focus selectors
# ---------------------------------------------------------------------------

_LABEL_FOR_MISSING_ELEMENT = {
    "context": "状況",
    "task": "課題",
    "action": "行動",
    "result": "結果",
    "learning": "学び",
}

def _choose_build_focus(
    missing_elements: list[str],
    quality_checks: dict[str, bool],
    causal_gaps: list[str],
) -> str:
    for key in CORE_BUILD_ELEMENTS:
        if key in missing_elements:
            return key
    if quality_checks.get("role_required") and not quality_checks.get("role_clarity"):
        return "role"
    if not quality_checks.get("task_clarity"):
        return "task"
    if not quality_checks.get("action_ownership"):
        return "action"
    if not quality_checks.get("result_traceability"):
        return "result"
    if "causal_gap_task_action" in causal_gaps:
        return "task"
    if "causal_gap_action_result" in causal_gaps:
        return "result"
    return "result"


def _build_readiness_reason(
    quality_checks: dict[str, bool],
    causal_gaps: list[str],
    missing_elements: list[str],
) -> str:
    if missing_elements:
        jp = [_LABEL_FOR_MISSING_ELEMENT.get(m, m) for m in missing_elements[:3]]
        return f"「{'・'.join(jp)}」について、まだ書き足すとよい点があります。"
    reasons: list[str] = []
    if not quality_checks.get("task_clarity"):
        reasons.append("課題をなぜ重要と見たかを、もう一文補うと伝わりやすくなります")
    if not quality_checks.get("action_ownership"):
        reasons.append("ご自身の役割と行動を、もう少し具体的にするとよいです")
    if quality_checks.get("role_required") and not quality_checks.get("role_clarity"):
        reasons.append("担当範囲をはっきりさせると、話の信頼感が上がります")
    if not quality_checks.get("result_traceability"):
        reasons.append("行動のあとにどう変わったかを、もう一歩具体的にするとよいです")
    if not reasons and causal_gaps:
        reasons.append("状況から成果までのつながりを、もう一段補うとまとまります")
    if not reasons:
        return "あと少し補うと、ES 本文が書きやすくなります。"
    return "。".join(reasons[:2]) + "。"


def _normalize_missing_elements(value: object) -> list[str]:
    items = [item for item in _clean_string_list(value, max_items=len(CORE_BUILD_ELEMENTS)) if item in CORE_BUILD_ELEMENTS]
    seen: list[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


# ---------------------------------------------------------------------------
# Student expression extraction (Phase B.5)
# ---------------------------------------------------------------------------

# Japanese quoted expressions inside 「...」(max 30 chars inside the brackets).
_QUOTED_JA_PATTERN = re.compile(r"「([^「」\n]{2,30})」")

# Digit + unit / scale (%, 人, 件, 倍, 年, 月, 日, 分, 時間, 秒, kg, 千, 万, など).
# Surrounding context (up to 6 chars before, 6 after) is captured as the
# expression snippet so we keep a meaningful fragment rather than the bare
# number.
_DIGIT_UNIT_PATTERN = re.compile(
    r"[^\s。、,.!?！？「」『』]{0,6}"
    r"\d+(?:[.,]\d+)?"
    r"(?:%|％|人|件|倍|年|月|日|分|時間|秒|kg|千|万)"
    r"[^\s。、,.!?！？「」『』]{0,6}"
)

# First-person action phrases: 私/自分/僕/ 私が/私は + 動詞句（〜した・〜する）.
# Keep the phrase short (up to 30 chars), stop at sentence boundaries.
_FIRST_PERSON_ACTION_PATTERN = re.compile(
    r"(?:私|自分|僕)(?:が|は|の|で)?[^\s。、,.!?！？「」『』]{2,25}"
    r"(?:した|しました|する|します|やった|行った|担当した|取り組んだ|"
    r"決めた|作った|書いた|考えた|提案した|変えた|見直した|改善した|"
    r"設計した|導入した|始めた|続けた|乗り越えた|巻き込んだ|任された)"
)


def _extract_student_expressions(messages: list[Any], max_items: int = 5) -> list[str]:
    """Extract up to ``max_items`` student-voiced expressions from user turns.

    Intended for injection into the ES draft prompt as "student's own words"
    suggestions so that the LLM preserves the applicant's natural phrasing
    instead of rewriting everything into formal register.

    Categories (登場順に抽出):
    - Quoted expressions ``「…」`` (2-30 chars inside the brackets)
    - Digit + unit phrases (e.g. ``30%``, ``2倍``, ``15分短縮``) with a short
      surrounding context so the snippet reads as a natural phrase
    - First-person action phrases (``私が…した`` / ``自分で…した`` 等)

    Rules:
    - ``user`` role turns only (skip assistant questions)
    - Each snippet is trimmed to 3-30 characters (shorter fragments dropped)
    - Duplicates removed preserving first occurrence
    - Returns at most ``max_items`` entries

    Pure function: no IO, no LLM call, no exceptions leaked. Input objects
    only need to expose ``.role`` and ``.content`` attributes.
    """
    if not messages or max_items <= 0:
        return []

    results: list[str] = []
    seen: set[str] = set()

    def _push(snippet: str) -> bool:
        cleaned = snippet.strip()
        cleaned = cleaned.strip("、。,.・:：;；")
        if not (3 <= len(cleaned) <= 30):
            return False
        if cleaned in seen:
            return False
        seen.add(cleaned)
        results.append(cleaned)
        return len(results) >= max_items

    for msg in messages:
        role = getattr(msg, "role", None)
        if role != "user":
            continue
        content = getattr(msg, "content", None)
        if not isinstance(content, str) or not content.strip():
            continue

        # 1) Quoted expressions: preserve the inner text only (not the brackets).
        for match in _QUOTED_JA_PATTERN.finditer(content):
            if _push(match.group(1)):
                return results

        # 2) Digit + unit phrases with short surrounding context.
        for match in _DIGIT_UNIT_PATTERN.finditer(content):
            if _push(match.group(0)):
                return results

        # 3) First-person action phrases.
        for match in _FIRST_PERSON_ACTION_PATTERN.finditer(content):
            if _push(match.group(0)):
                return results

    return results


# ---------------------------------------------------------------------------
# Coach progress message (Phase B.7)
# ---------------------------------------------------------------------------

_COACH_FOCUS_LABELS: dict[str, str] = {
    "context": "状況",
    "task": "課題",
    "action": "行動",
    "result": "成果",
    "learning": "学び",
}


def _build_coach_progress_message(
    *,
    stage: str,
    resolved_focuses: list[str],
    missing_elements: list[str],
    focus_key: str | None,
    ready_for_draft: bool,
    extended_deep_dive_round: int = 0,
) -> str | None:
    """Return a short (≤ 30 字) coach progress message or ``None``.

    Deterministic: no LLM call, pure function. Drives the
    ``NaturalProgressStatus`` component on the frontend. UI hides the panel
    when this is ``None``.

    The message favours short, human-readable progress cues over STAR
    jargon. Stage is checked first so that deep-dive / interview-ready
    messages are not shadowed by ``ready_for_draft`` (which is set to
    ``True`` throughout the post-draft flow). Priority order:

    1. ``stage='interview_ready'`` — deep-dive wrapped, extension possible
    2. ``stage='deep_dive_active'`` — post-draft sharpening
    3. ``stage='draft_ready'`` or ``ready_for_draft=True`` (es_building
       succeeded but draft not yet generated)
    4. ``stage='es_building'`` — narrate the most recently resolved STAR
       element or the current material-gathering posture
    """
    stage_clean = (stage or "").strip()
    missing_clean = [m for m in (missing_elements or []) if isinstance(m, str)]
    resolved_clean = [r for r in (resolved_focuses or []) if isinstance(r, str)]

    if stage_clean == "interview_ready":
        return "面接準備まで整いました。さらに深掘りも可能です。"

    if stage_clean == "deep_dive_active":
        if extended_deep_dive_round > 0:
            return "さらに一段深く掘り下げています。"
        return "深掘りで論点を整理しています。"

    if ready_for_draft or stage_clean == "draft_ready":
        return "ES材料が揃いました。下書きを作成できます。"

    if stage_clean == "es_building":
        # Fresh start: nothing resolved yet and context still missing.
        if not resolved_clean and "context" in missing_clean:
            return "いま状況を一緒に整理しています。"

        # Translate the most recently resolved STAR element into a cue so the
        # student feels the coach acknowledged what just landed.
        latest_resolved = next(
            (key for key in reversed(resolved_clean) if key in _COACH_FOCUS_LABELS),
            None,
        )
        if latest_resolved == "context":
            head = "状況が見えてきました。"
        elif latest_resolved == "task":
            head = "課題が見えてきました。"
        elif latest_resolved == "action":
            head = "行動を整理しています。"
        elif latest_resolved == "result":
            head = "成果の輪郭が見えてきました。"
        elif latest_resolved == "learning":
            head = "学びも言語化できています。"
        else:
            head = "材料を一緒に整理しています。"

        missing_core = [m for m in missing_clean if m in CORE_BUILD_ELEMENTS]
        if 1 <= len(missing_core) <= 2:
            tail = "あと1-2問で材料が揃いそうです。"
        elif len(missing_core) >= 3:
            tail = "STAR の材料を順に整理していきましょう。"
        else:
            tail = ""

        # Keep the total within 30 chars for the UI chip.
        message = head + tail
        if len(message) <= 30:
            return message
        # Fall back to the tail alone if the combined message overflows.
        if tail and len(tail) <= 30:
            return tail
        return head if len(head) <= 30 else None

    return None


# ---------------------------------------------------------------------------
# Remaining questions estimate (M4, 2026-04-17)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# State factories
# ---------------------------------------------------------------------------

def _default_state(stage: str = "es_building", **kwargs: Any) -> dict[str, Any]:
    return {
        "stage": stage,
        "focus_key": kwargs.get("focus_key"),
        "progress_label": kwargs.get("progress_label"),
        "answer_hint": kwargs.get("answer_hint"),
        "input_richness_mode": kwargs.get("input_richness_mode"),
        "missing_elements": kwargs.get("missing_elements", []),
        "draft_quality_checks": kwargs.get("draft_quality_checks", {}),
        "causal_gaps": kwargs.get("causal_gaps", []),
        "ready_for_draft": kwargs.get("ready_for_draft", False),
        "draft_readiness_reason": kwargs.get("draft_readiness_reason", ""),
        "draft_text": kwargs.get("draft_text"),
        "strength_tags": kwargs.get("strength_tags", []),
        "issue_tags": kwargs.get("issue_tags", []),
        "deepdive_recommendation_tags": kwargs.get("deepdive_recommendation_tags", []),
        "credibility_risk_tags": kwargs.get("credibility_risk_tags", []),
        "deepdive_stage": kwargs.get("deepdive_stage"),
        "completion_checks": kwargs.get("completion_checks", {}),
        "deepdive_complete": kwargs.get("deepdive_complete", False),
        "completion_reasons": kwargs.get("completion_reasons", []),
        "asked_focuses": kwargs.get("asked_focuses", []),
        "resolved_focuses": kwargs.get("resolved_focuses", []),
        "deferred_focuses": kwargs.get("deferred_focuses", []),
        "blocked_focuses": kwargs.get("blocked_focuses", []),
        "recent_question_texts": kwargs.get("recent_question_texts", []),
        "loop_blocked_focuses": kwargs.get("loop_blocked_focuses", []),
        "focus_attempt_counts": kwargs.get("focus_attempt_counts", {}),
        "last_question_signature": kwargs.get("last_question_signature"),
        "extended_deep_dive_round": int(kwargs.get("extended_deep_dive_round", 0) or 0),
        "coach_progress_message": kwargs.get("coach_progress_message"),
        "paused_question": kwargs.get("paused_question"),
        "remaining_questions_estimate": max(
            0, int(kwargs.get("remaining_questions_estimate", 0) or 0)
        ),
        "retry_degraded": bool(kwargs.get("retry_degraded", False)),
    }


def _normalize_recent_question_texts(value: object) -> list[str]:
    cleaned = [item[:100] for item in _clean_string_list(value, max_items=LOOP_DETECTION_WINDOW)]
    return cleaned[-LOOP_DETECTION_WINDOW:]


def _normalize_loop_blocked_focuses(value: object) -> list[str]:
    blocked: list[str] = []
    for item in _clean_string_list(value, max_items=12):
        if item in (*BUILD_ELEMENTS, *DEEPDIVE_FOCUSES) and item not in blocked:
            blocked.append(item)
    return blocked


def _merge_focus_blocks(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    for group in groups:
        for item in group:
            if item not in merged:
                merged.append(item)
    return merged


def _append_recent_question_texts(recent_question_texts: list[str], question: str) -> list[str]:
    if not question.strip():
        return recent_question_texts[-LOOP_DETECTION_WINDOW:]
    return [*recent_question_texts, question.strip()[:100]][-LOOP_DETECTION_WINDOW:]


def _apply_question_loop_guard(
    *,
    question: str,
    focus_key: str | None,
    loop_blocked_focuses: list[str],
    conversation_history: list[dict[str, Any]],
) -> tuple[bool, list[str]]:
    if not question or not focus_key:
        return False, loop_blocked_focuses

    result = _detect_question_loops_in_history(conversation_history, question)
    if not result["loop_detected"]:
        return False, loop_blocked_focuses

    return True, _merge_focus_blocks(loop_blocked_focuses, [focus_key])


# ---------------------------------------------------------------------------
# Public entry points: payload normalization
# ---------------------------------------------------------------------------

def _normalize_es_build_payload(
    payload: object,
    fallback_state: "ConversationStateInput | None",
    *,
    conversation_history: list[dict[str, Any]] | None = None,
    conversation_text: str = "",
    input_richness_mode: str | None = None,
    question_count: int = 0,
) -> tuple[str, dict[str, Any], str]:
    data = payload if isinstance(payload, dict) else {}
    _ext_dr = int(fallback_state.extended_deep_dive_round) if fallback_state else 0
    recent_question_texts = _normalize_recent_question_texts(
        fallback_state.recent_question_texts if fallback_state else []
    )
    loop_blocked_focuses = _normalize_loop_blocked_focuses(
        fallback_state.loop_blocked_focuses if fallback_state else []
    )
    history = conversation_history or []
    missing_elements = _normalize_missing_elements(data.get("missing_elements"))
    quality_checks = _build_draft_quality_checks(conversation_text) if conversation_text else _clean_bool_map(
        data.get("draft_quality_checks"), DRAFT_QUALITY_CHECK_KEYS
    )
    causal_gaps = _build_causal_gaps(conversation_text, quality_checks) if conversation_text else _clean_string_list(
        data.get("causal_gaps"), max_items=4
    )
    if conversation_text:
        missing_elements = _build_core_missing_elements(conversation_text, quality_checks)
    readiness_reason = _clean_string(data.get("draft_readiness_reason"))
    focus_key = _clean_string(data.get("focus_key"))
    if focus_key not in BUILD_ELEMENTS and focus_key != "role":
        focus_key = _choose_build_focus(missing_elements, quality_checks, causal_gaps)
    blocked_focuses = _sanitize_blocked_focuses(
        fallback_state.blocked_focuses if fallback_state else [],
        stage="es_building",
        missing_elements=missing_elements,
    )
    prior_attempts = fallback_state.focus_attempt_counts if fallback_state else {}
    core_missing = [item for item in missing_elements if item in CORE_BUILD_ELEMENTS]
    temporary_blocked_focuses: list[str] = []
    for item in core_missing:
        try:
            attempts = int(prior_attempts.get(item, 0) or 0) if isinstance(prior_attempts, dict) else 0
        except (TypeError, ValueError):
            attempts = 0
        remaining_candidates = [
            candidate for candidate in core_missing
            if candidate != item and candidate not in temporary_blocked_focuses
        ]
        if attempts >= 2 and remaining_candidates:
            temporary_blocked_focuses.append(item)
    effective_blocked_focuses = (
        _merge_focus_blocks(blocked_focuses, loop_blocked_focuses, temporary_blocked_focuses)
        if temporary_blocked_focuses
        else _merge_focus_blocks(blocked_focuses, loop_blocked_focuses)
    )
    if focus_key in effective_blocked_focuses:
        focus_key = _choose_build_focus(
            [item for item in missing_elements if item not in effective_blocked_focuses],
            quality_checks,
            [gap for gap in causal_gaps if gap not in {"learning_too_generic"}],
        )
    # STAR 進捗と質問の論点を一致させる: 骨格が未充足のときは常に先頭欠落要素へ寄せる
    if missing_elements and focus_key in CORE_BUILD_ELEMENTS:
        aligned = _detect_es_focus_from_missing(missing_elements, blocked=set(effective_blocked_focuses))
        if focus_key != aligned and aligned not in effective_blocked_focuses:
            focus_key = aligned
    meta = _build_focus_meta(focus_key)
    question = _clean_string(data.get("question"))
    answer_hint = _clean_string(data.get("answer_hint")) or meta["answer_hint"]
    progress_label = _clean_string(data.get("progress_label")) or meta["progress_label"]
    server_ready = bool(data.get("ready_for_draft"))
    if conversation_text:
        critical_gaps = _critical_causal_gaps(causal_gaps)
        core_ready = len(missing_elements) == 0
        role_gap = quality_checks.get("role_required", False) and not quality_checks.get("role_clarity", False)
        cap_threshold = _es_build_question_cap_threshold()
        question_cap_ready = (
            question_count >= cap_threshold
            and core_ready
            and not role_gap
            and "causal_gap_action_result" not in critical_gaps
        )
        server_ready = (
            ((core_ready and quality_checks.get("task_clarity", False)) or question_cap_ready)
            and quality_checks.get("action_ownership", False)
            and (
                quality_checks.get("result_traceability", False)
                or "result" not in missing_elements
            )
            and (not quality_checks.get("role_required", False) or quality_checks.get("role_clarity", False))
            and not critical_gaps
        )
        if server_ready and question_count < _min_user_answers_for_es_draft_ready():
            server_ready = False
        # CI / E2E override: force draft-ready after N questions (disabled by default)
        force_after = _force_draft_ready_after()
        if not server_ready and force_after > 0 and question_count >= force_after:
            server_ready = True
        if not readiness_reason:
            readiness_reason = _build_readiness_reason(quality_checks, causal_gaps, missing_elements)

    if not server_ready:
        if question:
            prior_asked = list(fallback_state.asked_focuses) if fallback_state else []
            qeval = _evaluate_question_quality(
                question, recent_question_texts, focus_key or "", prior_asked,
            )
            if not qeval["quality_ok"]:
                if qeval["recommended_action"] in ("use_fallback", "block_focus"):
                    question = meta["question"]
                    answer_hint = meta["answer_hint"]
                    progress_label = meta["progress_label"]
                    if qeval["recommended_action"] == "block_focus" and focus_key:
                        if focus_key not in loop_blocked_focuses:
                            loop_blocked_focuses = [*loop_blocked_focuses, focus_key]

        loop_detected, loop_blocked_focuses = _apply_question_loop_guard(
            question=question or meta["question"],
            focus_key=focus_key,
            loop_blocked_focuses=loop_blocked_focuses,
            conversation_history=history,
        )
        if loop_detected and focus_key:
            effective_blocked_focuses = _merge_focus_blocks(
                blocked_focuses,
                loop_blocked_focuses,
                temporary_blocked_focuses,
            )
            next_focus = _choose_build_focus(
                [item for item in missing_elements if item not in effective_blocked_focuses],
                quality_checks,
                [gap for gap in causal_gaps if gap not in {"learning_too_generic"}],
            )
            if missing_elements and next_focus in CORE_BUILD_ELEMENTS:
                aligned = _detect_es_focus_from_missing(
                    missing_elements,
                    blocked=set(effective_blocked_focuses),
                )
                if aligned not in effective_blocked_focuses:
                    next_focus = aligned
            focus_key = next_focus
            meta = _build_focus_meta(focus_key)
            question = meta["question"]
            answer_hint = meta["answer_hint"]
            progress_label = meta["progress_label"]

    asked_focuses, resolved_focuses, deferred_focuses, blocked_focuses, focus_attempt_counts, _ = _derive_focus_tracking(
        fallback_state,
        stage="draft_ready" if server_ready else "es_building",
        focus_key=focus_key,
        missing_elements=missing_elements,
        quality_checks=quality_checks,
        should_record_focus=not server_ready,
    )
    last_question_signature = f"{focus_key}:{(focus_attempt_counts.get(focus_key, 0) or 1)}" if focus_key else None
    role_required_flag = bool(quality_checks.get("role_required", False))

    if server_ready:
        recent_question_texts = recent_question_texts[-LOOP_DETECTION_WINDOW:]
        coach_message = _build_coach_progress_message(
            stage="draft_ready",
            resolved_focuses=resolved_focuses,
            missing_elements=missing_elements,
            focus_key=focus_key,
            ready_for_draft=True,
            extended_deep_dive_round=_ext_dr,
        )
        remaining_estimate = _estimate_remaining_questions(
            stage="draft_ready",
            question_count=question_count,
            missing_elements=missing_elements,
            quality_checks=quality_checks,
            causal_gaps=causal_gaps,
            ready_for_draft=True,
            role_required=role_required_flag,
        )
        state = _default_state(
            "draft_ready",
            focus_key=focus_key,
            progress_label="ESを作成できます",
            answer_hint="ここまででES本文を書ける最低限の材料は揃っています。",
            input_richness_mode=input_richness_mode or (fallback_state.input_richness_mode if fallback_state else None),
            missing_elements=missing_elements,
            draft_quality_checks=quality_checks,
            causal_gaps=causal_gaps,
            ready_for_draft=True,
            draft_readiness_reason=readiness_reason or "ES本文に必要な材料が揃っています。",
            draft_text=fallback_state.draft_text if fallback_state else None,
            strength_tags=fallback_state.strength_tags if fallback_state else [],
            issue_tags=fallback_state.issue_tags if fallback_state else [],
            deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
            credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
            asked_focuses=asked_focuses,
            resolved_focuses=resolved_focuses,
            deferred_focuses=deferred_focuses,
            blocked_focuses=blocked_focuses,
            recent_question_texts=recent_question_texts,
            loop_blocked_focuses=loop_blocked_focuses,
            focus_attempt_counts=focus_attempt_counts,
            last_question_signature=last_question_signature,
            extended_deep_dive_round=_ext_dr,
            coach_progress_message=coach_message,
            paused_question=question or (fallback_state.paused_question if fallback_state else None),
            remaining_questions_estimate=remaining_estimate,
        )
        return "", state, "draft_ready"

    if not question:
        question = meta["question"]
        source = "rule_fallback"
    else:
        source = "full_json"

    recent_question_texts = _append_recent_question_texts(recent_question_texts, question)
    coach_message = _build_coach_progress_message(
        stage="es_building",
        resolved_focuses=resolved_focuses,
        missing_elements=missing_elements,
        focus_key=focus_key,
        ready_for_draft=False,
        extended_deep_dive_round=_ext_dr,
    )
    remaining_estimate = _estimate_remaining_questions(
        stage="es_building",
        question_count=question_count,
        missing_elements=missing_elements,
        quality_checks=quality_checks,
        causal_gaps=causal_gaps,
        ready_for_draft=False,
        role_required=role_required_flag,
    )
    state = _default_state(
        "es_building",
        focus_key=focus_key,
        progress_label=progress_label,
        answer_hint=answer_hint,
        input_richness_mode=input_richness_mode or (fallback_state.input_richness_mode if fallback_state else None),
        missing_elements=missing_elements,
        draft_quality_checks=quality_checks,
        causal_gaps=causal_gaps,
        ready_for_draft=False,
        draft_readiness_reason=readiness_reason or _build_readiness_reason(quality_checks, causal_gaps, missing_elements),
        draft_text=fallback_state.draft_text if fallback_state else None,
        strength_tags=fallback_state.strength_tags if fallback_state else [],
        issue_tags=fallback_state.issue_tags if fallback_state else [],
        deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
        credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
        asked_focuses=asked_focuses,
        resolved_focuses=resolved_focuses,
        deferred_focuses=deferred_focuses,
        blocked_focuses=blocked_focuses,
        recent_question_texts=recent_question_texts,
        loop_blocked_focuses=loop_blocked_focuses,
        focus_attempt_counts=focus_attempt_counts,
        last_question_signature=last_question_signature,
        extended_deep_dive_round=_ext_dr,
        coach_progress_message=coach_message,
        paused_question=None,
        remaining_questions_estimate=remaining_estimate,
    )
    return question, state, source


def _normalize_deepdive_payload(
    payload: object,
    fallback_state: "ConversationStateInput | None",
    *,
    conversation_history: list[dict[str, Any]] | None = None,
    conversation_text: str = "",
    draft_text: str = "",
    question_count: int = 0,
) -> tuple[str, dict[str, Any], str]:
    data = payload if isinstance(payload, dict) else {}
    _ext_dr = int(fallback_state.extended_deep_dive_round) if fallback_state else 0
    recent_question_texts = _normalize_recent_question_texts(
        fallback_state.recent_question_texts if fallback_state else []
    )
    loop_blocked_focuses = _normalize_loop_blocked_focuses(
        fallback_state.loop_blocked_focuses if fallback_state else []
    )
    history = conversation_history or []
    focus_key = _clean_string(data.get("focus_key")) or "challenge"
    if focus_key not in DEEPDIVE_FOCUSES:
        focus_key = "challenge"
    meta = _fallback_deepdive_meta(focus_key)
    question = _clean_string(data.get("question"))
    answer_hint = _clean_string(data.get("answer_hint")) or meta["answer_hint"]
    progress_label = _clean_string(data.get("progress_label")) or meta["progress_label"]
    deepdive_stage = _clean_string(data.get("deepdive_stage")) or "es_aftercare"
    completion = (
        _evaluate_deepdive_completion(conversation_text, draft_text or (fallback_state.draft_text if fallback_state else ""), focus_key)
        if conversation_text or draft_text or (fallback_state and fallback_state.draft_text)
        else None
    )
    explicit_interview_ready = deepdive_stage == "interview_ready"
    raw_complete = explicit_interview_ready or bool(completion and completion["complete"])
    deepdive_complete = raw_complete and question_count >= MIN_USER_ANSWERS_FOR_INTERVIEW_READY
    completion_reasons = (
        [] if deepdive_complete and explicit_interview_ready else list(completion["completion_reasons"]) if completion else []
    )

    if not deepdive_complete:
        if question:
            prior_asked = list(fallback_state.asked_focuses) if fallback_state else []
            qeval = _evaluate_question_quality(
                question, recent_question_texts, focus_key or "", prior_asked,
            )
            if not qeval["quality_ok"]:
                if qeval["recommended_action"] in ("use_fallback", "block_focus"):
                    meta = _fallback_deepdive_meta(focus_key)
                    question = meta["question"]
                    answer_hint = meta["answer_hint"]
                    progress_label = meta["progress_label"]
                    if qeval["recommended_action"] == "block_focus" and focus_key:
                        if focus_key not in loop_blocked_focuses:
                            loop_blocked_focuses = [*loop_blocked_focuses, focus_key]

        loop_detected, loop_blocked_focuses = _apply_question_loop_guard(
            question=question or meta["question"],
            focus_key=focus_key,
            loop_blocked_focuses=loop_blocked_focuses,
            conversation_history=history,
        )
        if loop_detected and focus_key:
            focus_order = list(DEEPDIVE_FOCUSES)
            if focus_key in focus_order:
                pivot = focus_order.index(focus_key) + 1
                candidates = focus_order[pivot:] + focus_order[:pivot]
            else:
                candidates = focus_order
            focus_key = next(
                (candidate for candidate in candidates if candidate not in loop_blocked_focuses),
                focus_key,
            )
            meta = _fallback_deepdive_meta(focus_key)
            question = meta["question"]
            answer_hint = meta["answer_hint"]
            progress_label = meta["progress_label"]

        prior_asked_dd = list(fallback_state.asked_focuses) if fallback_state else []
        prior_resolved_dd = list(fallback_state.resolved_focuses) if fallback_state else []
        prior_blocked_dd = list(fallback_state.blocked_focuses) if fallback_state else []
        coverage = _compute_group_coverage(
            prior_asked_dd, prior_resolved_dd, prior_blocked_dd, loop_blocked_focuses,
        )
        redirect_focus = _select_next_deepdive_focus_by_coverage(
            coverage, focus_key, question_count,
        )
        if redirect_focus and redirect_focus != focus_key:
            focus_key = redirect_focus
            meta = _fallback_deepdive_meta(focus_key)
            question = meta["question"]
            answer_hint = meta["answer_hint"]
            progress_label = meta["progress_label"]

    asked_focuses, resolved_focuses, deferred_focuses, blocked_focuses, focus_attempt_counts, _ = _derive_focus_tracking(
        fallback_state,
        stage="interview_ready" if deepdive_complete else "deep_dive_active",
        focus_key=focus_key,
        missing_elements=fallback_state.missing_elements if fallback_state else [],
        quality_checks=fallback_state.draft_quality_checks if fallback_state else {},
        should_record_focus=not deepdive_complete,
    )
    last_question_signature = f"{focus_key}:{(focus_attempt_counts.get(focus_key, 0) or 1)}" if focus_key else None

    prior_missing = fallback_state.missing_elements if fallback_state else []

    if deepdive_complete:
        recent_question_texts = recent_question_texts[-LOOP_DETECTION_WINDOW:]
        coach_message = _build_coach_progress_message(
            stage="interview_ready",
            resolved_focuses=resolved_focuses,
            missing_elements=prior_missing,
            focus_key=focus_key,
            ready_for_draft=True,
            extended_deep_dive_round=_ext_dr,
        )
        state = _default_state(
            "interview_ready",
            focus_key=focus_key,
            progress_label="面接準備完了",
            answer_hint="ここまでで面接に向けた補足材料も揃っています。",
            input_richness_mode=fallback_state.input_richness_mode if fallback_state else None,
            missing_elements=prior_missing,
            draft_quality_checks=fallback_state.draft_quality_checks if fallback_state else {},
            causal_gaps=fallback_state.causal_gaps if fallback_state else [],
            ready_for_draft=True,
            draft_readiness_reason=fallback_state.draft_readiness_reason if fallback_state else "",
            draft_text=fallback_state.draft_text if fallback_state else None,
            strength_tags=fallback_state.strength_tags if fallback_state else [],
            issue_tags=fallback_state.issue_tags if fallback_state else [],
            deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
            credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
            deepdive_stage="interview_ready",
            completion_checks=completion["completion_checks"] if completion else {},
            deepdive_complete=True,
            completion_reasons=completion_reasons,
            asked_focuses=asked_focuses,
            resolved_focuses=resolved_focuses,
            deferred_focuses=deferred_focuses,
            blocked_focuses=blocked_focuses,
            recent_question_texts=recent_question_texts,
            loop_blocked_focuses=loop_blocked_focuses,
            focus_attempt_counts=focus_attempt_counts,
            last_question_signature=last_question_signature,
            extended_deep_dive_round=_ext_dr,
            coach_progress_message=coach_message,
            paused_question=question or (fallback_state.paused_question if fallback_state else None),
            remaining_questions_estimate=0,
        )
        return "", state, "interview_ready"

    if not question:
        question = meta["question"]
        source = "rule_fallback"
    else:
        source = "full_json"

    recent_question_texts = _append_recent_question_texts(recent_question_texts, question)
    coach_message = _build_coach_progress_message(
        stage="deep_dive_active",
        resolved_focuses=resolved_focuses,
        missing_elements=prior_missing,
        focus_key=focus_key,
        ready_for_draft=True,
        extended_deep_dive_round=_ext_dr,
    )
    state = _default_state(
        "deep_dive_active",
        focus_key=focus_key,
        progress_label=progress_label,
        answer_hint=answer_hint,
        input_richness_mode=fallback_state.input_richness_mode if fallback_state else None,
        missing_elements=prior_missing,
        draft_quality_checks=fallback_state.draft_quality_checks if fallback_state else {},
        causal_gaps=fallback_state.causal_gaps if fallback_state else [],
        ready_for_draft=True,
        draft_readiness_reason=fallback_state.draft_readiness_reason if fallback_state else "",
        draft_text=fallback_state.draft_text if fallback_state else None,
        strength_tags=fallback_state.strength_tags if fallback_state else [],
        issue_tags=fallback_state.issue_tags if fallback_state else [],
        deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
        credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
        deepdive_stage=deepdive_stage,
        completion_checks=completion["completion_checks"] if completion else {},
        deepdive_complete=False,
        completion_reasons=list(completion["missing_reasons"]) if completion else [],
        asked_focuses=asked_focuses,
        resolved_focuses=resolved_focuses,
        deferred_focuses=deferred_focuses,
        blocked_focuses=blocked_focuses,
        recent_question_texts=recent_question_texts,
        loop_blocked_focuses=loop_blocked_focuses,
        focus_attempt_counts=focus_attempt_counts,
        last_question_signature=last_question_signature,
        extended_deep_dive_round=_ext_dr,
        coach_progress_message=coach_message,
        paused_question=None,
        remaining_questions_estimate=0,
    )
    return question, state, source
