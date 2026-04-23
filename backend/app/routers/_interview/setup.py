"""Setup-normalization helpers for the interview router.

Converts raw request payloads (``InterviewBaseRequest``) into a canonical
``setup`` dict consumed by prompt builders, planners, and generators. Also
covers legacy-stage inference and materials formatting.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from app.routers._interview.contracts import (
    CONVERSATION_HISTORY_WINDOW_TURNS,
    INTERVIEW_FORMATS,
    INTERVIEW_STAGES,
    INTERVIEWER_TYPES,
    LEGACY_STAGE_ORDER,
    QUESTION_STAGE_ORDER,
    ROLE_TRACK_KEYWORDS,
    ROLE_TRACKS,
    SELECTION_TYPES,
    STRICTNESS_MODES,
    _LEGACY_INTERVIEW_FORMAT_MAP,
    _TOPIC_STAGE_KEYWORDS,
    InterviewBaseRequest,
    Message,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Normalization primitives
# ---------------------------------------------------------------------------


def _normalize_choice(value: Optional[str], allowed: set[str], default: str) -> str:
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed in allowed:
            return trimmed
    return default


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _canonical_interview_format(value: Optional[str]) -> str:
    """Normalize legacy discussion/presentation to life_history for 4-format product."""
    if not isinstance(value, str):
        return "standard_behavioral"
    trimmed = value.strip()
    trimmed = _LEGACY_INTERVIEW_FORMAT_MAP.get(trimmed, trimmed)
    return _normalize_choice(trimmed, INTERVIEW_FORMATS, "standard_behavioral")


# ---------------------------------------------------------------------------
# Role track inference
# ---------------------------------------------------------------------------

_ASCII_KEYWORD_RE = re.compile(r"^[A-Za-z0-9.+#\- ]+$")


def _keyword_matches(keyword: str, haystack: str) -> bool:
    """Match a single ROLE_TRACK_KEYWORDS entry against text.

    ASCII-only keywords use word-boundary semantics to avoid false positives
    (e.g. "PM" must not match "PMO"). Japanese / mixed keywords fall back to
    case-insensitive substring match since word boundaries don't apply.
    """
    if not keyword or not haystack:
        return False
    if _ASCII_KEYWORD_RE.match(keyword):
        pattern = rf"(?<![A-Za-z0-9]){re.escape(keyword)}(?![A-Za-z0-9])"
        return re.search(pattern, haystack, re.IGNORECASE) is not None
    return keyword.lower() in haystack.lower()


def _infer_role_track(
    selected_role: Optional[str],
    company_summary: Optional[str],
    selected_industry: Optional[str],
) -> str:
    """Infer role_track from user inputs.

    Step 1: selected_role を最優先に評価する。会社説明文に含まれる技術名
    (例: "Reactで EC 構築") が営業職など selected_role と無関係なのに
    frontend_engineer に誤分類されるのを防ぐ。
    Step 2: selected_role で決まらない場合のみ company_summary +
    selected_industry を参照する。

    ASCII 略称 (PM, PdM, AI, ML, Go, ...) は word-boundary でマッチさせ、
    PMOコンサル のような部分一致による誤分類を回避する。
    """
    primary = (selected_role or "").strip()
    if primary:
        for role_track, keywords in ROLE_TRACK_KEYWORDS.items():
            if any(_keyword_matches(keyword, primary) for keyword in keywords):
                return role_track
    fallback = " ".join([company_summary or "", selected_industry or ""]).strip()
    if fallback:
        for role_track, keywords in ROLE_TRACK_KEYWORDS.items():
            if any(_keyword_matches(keyword, fallback) for keyword in keywords):
                return role_track
    return "biz_general"


# ---------------------------------------------------------------------------
# Setup dict construction (canonical payload for downstream prompt builders)
# ---------------------------------------------------------------------------


def _build_setup(payload: InterviewBaseRequest) -> dict[str, Any]:
    role_track = _normalize_choice(
        payload.role_track
        or _infer_role_track(payload.selected_role, payload.company_summary, payload.selected_industry),
        ROLE_TRACKS,
        "biz_general",
    )
    interview_format = _canonical_interview_format(payload.interview_format)
    selection_type = _normalize_choice(payload.selection_type, SELECTION_TYPES, "fulltime")
    interview_stage = _normalize_choice(payload.interview_stage, INTERVIEW_STAGES, "mid")
    interviewer_type = _normalize_choice(payload.interviewer_type, INTERVIEWER_TYPES, "hr")
    strictness_mode = _normalize_choice(payload.strictness_mode, STRICTNESS_MODES, "standard")
    selected_role_line = (payload.selected_role or "").strip() or "未設定"

    return {
        "selected_industry": (payload.selected_industry or "").strip() or None,
        "selected_role_line": selected_role_line,
        "selected_role_source": (payload.selected_role_source or "").strip() or None,
        "role_track": role_track,
        "interview_format": interview_format,
        "selection_type": selection_type,
        "interview_stage": interview_stage,
        "interviewer_type": interviewer_type,
        "strictness_mode": strictness_mode,
        "selected_role": selected_role_line,
        "company_name": (payload.company_name or "").strip() or "企業",
        "company_summary": (payload.company_summary or "").strip() or "",
    }


# ---------------------------------------------------------------------------
# Legacy stage inference helpers
# ---------------------------------------------------------------------------


def _infer_stage_from_topic(topic: Optional[str], question_stage: Optional[str] = None) -> str:
    if isinstance(question_stage, str) and question_stage in LEGACY_STAGE_ORDER:
        return question_stage

    normalized = (topic or "").lower()
    if not normalized:
        return "opening"
    # topic 自体が legacy stage キー (motivation_fit / role_reason 等) と一致する場合は、substring 検索より優先
    if normalized in LEGACY_STAGE_ORDER:
        return normalized
    # 完全一致を優先 (opening / intro / self_intro)
    if normalized in _TOPIC_STAGE_KEYWORDS["opening"]:
        return "opening"
    for stage, keywords in _TOPIC_STAGE_KEYWORDS.items():
        if stage == "opening":
            continue
        if any(key in normalized for key in keywords):
            return stage
    return "opening"


def _question_stage_from_turn_meta(turn_meta: dict[str, Any]) -> str:
    topic = turn_meta.get("topic") if isinstance(turn_meta, dict) else None
    question_stage = turn_meta.get("question_stage") if isinstance(turn_meta, dict) else None
    return _infer_stage_from_topic(topic, question_stage)


# ---------------------------------------------------------------------------
# Conversation formatting (prompt input preparation)
# ---------------------------------------------------------------------------
# Phase 2 Stage 1 で plan/opening/turn テンプレートが「応募者材料」を 1 行化する
# 圧縮レンダリングへ移行したため、旧 ``_format_materials_section`` ヘルパは
# Stage 10 で削除した。既存のレンダリングは ``prompting._build_*_prompt`` 内に
# インライン化されている。


def _format_conversation(conversation_history: list[Message]) -> str:
    if not conversation_history:
        return "まだ会話なし"
    return "\n".join(
        f"{'面接官' if message.role == 'assistant' else '応募者'}: {message.content}"
        for message in conversation_history
    )


def _trim_conversation_history(
    conversation_history: list[Message],
    *,
    max_turns: int = CONVERSATION_HISTORY_WINDOW_TURNS,
) -> list[Message]:
    """Sliding window: keep only the most recent *max_turns* Q&A pairs.

    Applied by turn/continue prompt builders only (NOT feedback).
    """
    max_messages = max_turns * 2
    if len(conversation_history) <= max_messages:
        return conversation_history
    trimmed = conversation_history[-max_messages:]
    logger.debug(
        "[Interview] Conversation history trimmed: %d -> %d messages (%d turns dropped)",
        len(conversation_history),
        len(trimmed),
        (len(conversation_history) - len(trimmed)) // 2,
    )
    return trimmed


def _format_phase_for_setup(setup: dict[str, Any]) -> str:
    interview_format = _canonical_interview_format(str(setup.get("interview_format") or "standard_behavioral"))
    if interview_format == "case":
        return "case_main"
    if interview_format == "technical":
        return "technical_main"
    if interview_format == "life_history":
        return "life_history_main"
    return "standard_main"


# ---------------------------------------------------------------------------
# Turn-state default construction
# ---------------------------------------------------------------------------


def _default_stage_question_counts() -> dict[str, int]:
    return {stage: 0 for stage in QUESTION_STAGE_ORDER}


def _default_turn_state(setup: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    setup = setup or {}
    return {
        "phase": "opening",
        "formatPhase": "opening",
        "currentStage": "opening",
        "questionCount": 0,
        "totalQuestionCount": 0,
        "turnCount": 0,
        "stageQuestionCounts": _default_stage_question_counts(),
        "completedStages": [],
        "coverageState": [],
        "coveredTopics": [],
        "remainingTopics": [],
        "recentQuestionSummaries": [],
        "recentQuestionSummariesV2": [],
        "lastQuestion": None,
        "lastAnswer": None,
        "lastTopic": None,
        "lastQuestionFocus": None,
        "nextAction": "ask",
        "interviewPlan": None,
        "turnMeta": None,
        "roleTrack": setup.get("role_track"),
        "interviewFormat": setup.get("interview_format"),
        "selectionType": setup.get("selection_type"),
        "interviewStage": setup.get("interview_stage"),
        "interviewerType": setup.get("interviewer_type"),
        "strictnessMode": setup.get("strictness_mode"),
        "selectedIndustry": setup.get("selected_industry"),
        "selectedRoleLine": setup.get("selected_role_line"),
        "selectedRoleSource": setup.get("selected_role_source"),
    }


__all__ = [
    "_normalize_choice",
    "_normalize_string_list",
    "_canonical_interview_format",
    "_ASCII_KEYWORD_RE",
    "_keyword_matches",
    "_infer_role_track",
    "_build_setup",
    "_infer_stage_from_topic",
    "_question_stage_from_turn_meta",
    "_format_conversation",
    "_trim_conversation_history",
    "_format_phase_for_setup",
    "_default_stage_question_counts",
    "_default_turn_state",
]
