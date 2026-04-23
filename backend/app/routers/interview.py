"""Façade for the interview router.

Phase 2 Stage 2: the implementation now lives in the ``_interview`` package
(``contracts``, ``setup``, ``planning``, ``prompting``, ``generators``,
``endpoints``). This file re-exports every public symbol so that existing
importers (``from app.routers.interview import ...``) and the test harness
continue to work without modification.

Monkey-patching notes
---------------------
Tests that intercept LLM calls should patch symbols on the generators
submodule (``app.routers._interview.generators``). Internal cross-module
calls within ``generators.py`` go through module attribute access so that
such patches take effect immediately. The façade seam test in
``tests/interview/test_facade_seam.py`` guards this invariant.
"""

from app.routers._interview.contracts import (
    CASE_BRIEF_SCHEMA,
    INTERVIEW_CONTINUE_SCHEMA,
    INTERVIEW_DRILL_SCORE_SCHEMA,
    INTERVIEW_DRILL_START_SCHEMA,
    INTERVIEW_FEEDBACK_SCHEMA,
    INTERVIEW_FORMATS,
    INTERVIEW_OPENING_SCHEMA,
    INTERVIEW_PLAN_PROGRESS_SCHEMA,
    INTERVIEW_PLAN_SCHEMA,
    INTERVIEW_SCORE_SCHEMA,
    INTERVIEW_STAGES,
    INTERVIEW_TURN_META_SCHEMA,
    INTERVIEW_TURN_SCHEMA,
    INTERVIEWER_TYPES,
    LEGACY_STAGE_LABELS,
    LEGACY_STAGE_ORDER,
    QUESTION_STAGE_ORDER,
    CONVERSATION_HISTORY_WINDOW_TURNS,
    RECENT_QUESTION_SUMMARIES_STATE_WINDOW,
    RECENT_QUESTION_SUMMARIES_WINDOW,
    ROLE_TRACK_KEYWORDS,
    ROLE_TRACKS,
    SELECTION_TYPES,
    SEVEN_AXIS_KEYS,
    STRICTNESS_MODES,
    CaseBrief,
    InterviewBaseRequest,
    InterviewContinueRequest,
    InterviewDrillScoreRequest,
    InterviewDrillScoreResponse,
    InterviewDrillStartRequest,
    InterviewDrillStartResponse,
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    Message,
    _CONTINUE_FALLBACK,
    _DRILL_SCORE_FALLBACK,
    _DRILL_START_FALLBACK,
    _FEEDBACK_FALLBACK,
    _LEGACY_FORMAT_PHASE_MAP,
    _LEGACY_INTERVIEW_FORMAT_MAP,
    _OPENING_FALLBACK,
    _PLAN_FALLBACK,
    _TOPIC_STAGE_KEYWORDS,
    _TURN_FALLBACK,
)
from app.routers._interview.endpoints import (
    _coerce_retry_scores,
    _sanitize_base_request,
    _sanitize_drill_score,
    _sanitize_drill_start,
    _sanitize_messages,
    _sanitize_optional_text,
    continue_interview,
    interview_drill_score,
    interview_drill_start,
    interview_feedback,
    next_interview_turn,
    router,
    start_interview,
)
from app.routers._interview.generators import (
    _generate_continue_progress,
    _generate_feedback_progress,
    _generate_start_progress,
    _generate_turn_progress,
    _sse_error_event,
    _sse_event,
    _stream_llm_json_completion,
    _stream_response,
    call_llm_streaming_fields,
    consume_request_llm_cost_summary,
)
from app.routers._interview.planning import (
    SEVEN_AXES,
    _backfill_feedback_linkage_from_conversation,
    _build_fallback_continue_payload,
    _build_fallback_opening_payload,
    _build_fallback_turn_payload,
    _build_initial_coverage_state,
    _build_question_summary,
    _build_recent_question_summary_v2,
    _checklist_for_topic,
    _covered_topics_from_coverage_state,
    _derive_turn_state_for_question,
    _enrich_feedback_defaults,
    _extract_case_seed_version,
    _fallback_improvement_for_score,
    _fallback_plan,
    _fallback_preparation_for_score,
    _fallback_short_coaching,
    _fallback_turn_meta,
    _load_case_brief_preset,
    _select_case_brief,
    _merge_plan_progress,
    _normalize_coverage_state,
    _normalize_feedback,
    _normalize_interview_plan,
    _normalize_question_text,
    _normalize_recent_question_summaries_v2,
    _normalize_turn_meta,
    _normalize_turn_state,
    _opening_question_matches_format,
    _version_metadata,
)
from app.routers._interview.prompting import (
    _build_case_brief_section,
    _build_continue_prompt,
    _build_drill_score_prompt,
    _build_drill_start_prompt,
    _build_feedback_prompt,
    _build_opening_prompt,
    _build_plan_prompt,
    _build_turn_prompt,
    _render_coverage_state,
    _render_recent_question_summaries,
    _summarize_latest_feedback,
)
from app.routers._interview.setup import (
    _ASCII_KEYWORD_RE,
    _build_setup,
    _canonical_interview_format,
    _default_stage_question_counts,
    _default_turn_state,
    _format_conversation,
    _format_phase_for_setup,
    _infer_role_track,
    _infer_stage_from_topic,
    _keyword_matches,
    _normalize_choice,
    _normalize_string_list,
    _question_stage_from_turn_meta,
    _trim_conversation_history,
)  # noqa: F401 — façade re-exports are consumed via attribute access, not direct imports.

# ``__all__`` deliberately omitted: Python exposes every symbol we imported
# above as an attribute of this module, which is sufficient both for the
# ``from app.routers.interview import foo`` idiom used throughout the
# codebase and for ``monkeypatch.setattr("app.routers.interview.foo", ...)``
# (though new tests should prefer the ``_interview.generators`` submodule
# path for LLM-layer patches).
