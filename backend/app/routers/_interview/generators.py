"""SSE generator functions for the interview router.

Each ``_generate_*_progress`` wraps one LLM pipeline (plan + opening, turn,
continue, feedback) and streams events as Server-Sent Events.

Monkey-patching strategy
------------------------
Tests intercept LLM calls by patching attributes on **this module** (e.g.
``app.routers._interview.generators._stream_llm_json_completion``). Internal
calls therefore go through module-level attribute access so monkeypatch takes
effect. When a new symbol is added here that needs to be patchable, keep the
same pattern (reference it via the module import at call sites, not as a
local name).
"""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Literal, Optional

from fastapi.responses import StreamingResponse

from app.routers._interview import generators as _gen_self  # self-import for monkeypatch targets
from app.routers._interview.contracts import (
    INTERVIEW_CONTINUE_SCHEMA,
    INTERVIEW_FEEDBACK_SCHEMA,
    INTERVIEW_OPENING_SCHEMA,
    INTERVIEW_PLAN_SCHEMA,
    INTERVIEW_TURN_SCHEMA,
    RECENT_QUESTION_SUMMARIES_STATE_WINDOW,
    InterviewContinueRequest,
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
)
# Several helpers below are referenced only via ``_gen_self.xxx`` so the test
# harness can ``monkeypatch.setattr("app.routers._interview.generators.xxx", ...)``
# to inject failures. Ruff's static analysis sees them as unused names; keep the
# imports and silence F401 because they are intentional monkeypatch seams.
from app.routers._interview.planning import (
    _backfill_feedback_linkage_from_conversation,
    _build_fallback_continue_payload,
    _build_fallback_opening_payload,  # noqa: F401 — _gen_self monkeypatch seam
    _build_fallback_turn_payload,
    _build_initial_coverage_state,
    _build_question_summary,
    _build_recent_question_summary_v2,
    _derive_turn_state_for_question,  # noqa: F401 — _gen_self monkeypatch seam
    _enrich_feedback_defaults,
    _fallback_plan,
    _fallback_short_coaching,
    _fallback_turn_meta,
    _merge_plan_progress,  # noqa: F401 — _gen_self monkeypatch seam
    _normalize_feedback,
    _normalize_interview_plan,
    _normalize_question_text,
    _normalize_string_list,
    _normalize_turn_meta,
    _normalize_turn_state,
    _opening_question_matches_format,
    _question_stage_from_turn_meta,
    _version_metadata,
)
from app.routers._interview.prompting import (
    _build_continue_prompt,
    _build_feedback_prompt,
    _build_opening_prompt,
    _build_plan_prompt,
    _build_turn_prompt,
)
from app.routers._interview.setup import (
    _build_setup,  # noqa: F401 — _gen_self monkeypatch seam
    _default_turn_state,
)
from app.utils.llm import call_llm_streaming_fields
from app.utils.llm_usage_cost import consume_request_llm_cost_summary
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Low-level SSE helpers
# ---------------------------------------------------------------------------


def _sse_event(event_type: str, payload: dict[str, Any]) -> str:
    body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


def _sse_error_event(cost_summary: Any) -> str:
    """SSE 用の共通エラー event。例外メッセージ / stack trace を UI に漏洩させない。"""
    return _sse_event(
        "error",
        {
            "message": "予期しないエラーが発生しました。しばらくしてからもう一度お試しください。",
            "internal_telemetry": cost_summary,
        },
    )


def _stream_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# LLM streaming orchestrator
# ---------------------------------------------------------------------------


async def _stream_llm_json_completion(
    *,
    prompt: str,
    user_message: str,
    stream_string_fields: list[str],
    schema_hints: dict[str, Any],
    max_tokens: int,
    temperature: float,
    feature: str,
    json_schema: dict[str, Any] | None = None,
) -> AsyncGenerator[
    tuple[Literal["chunk"], dict[str, str]] | tuple[Literal["done"], dict[str, Any] | None],
    None,
]:
    """Stream string fields to the client as they arrive; finish with parsed JSON dict."""
    final_data: dict[str, Any] | None = None
    allowed = frozenset(stream_string_fields)
    partial_required = tuple(stream_string_fields[:1]) if stream_string_fields else ()
    # Dispatch via module attribute so tests that patch
    # ``app.routers._interview.generators.call_llm_streaming_fields`` take effect.
    async for event in _gen_self.call_llm_streaming_fields(
        system_prompt=prompt,
        user_message=user_message,
        max_tokens=max_tokens,
        temperature=temperature,
        feature=feature,
        schema_hints=schema_hints,
        stream_string_fields=stream_string_fields,
        response_format="json_schema" if json_schema else "json_object",
        json_schema=json_schema,
        partial_required_fields=partial_required,
    ):
        if event.type == "string_chunk" and event.path in allowed:
            yield ("chunk", {"path": event.path, "text": event.text})
        elif event.type == "error":
            error = event.result.error if event.result else None
            raise RuntimeError(error.message if error else "LLM request failed")
        elif event.type == "complete":
            result = event.result
            if result and result.success and isinstance(result.data, dict):
                final_data = result.data
            else:
                error = result.error if result else None
                raise RuntimeError(error.message if error else "LLM request failed")
    yield ("done", final_data)


# ---------------------------------------------------------------------------
# SSE generator: /start  (plan + opening)
# ---------------------------------------------------------------------------


async def _generate_start_progress(payload: InterviewStartRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _gen_self._build_setup(payload)
        yield _sse_event("progress", {"step": "plan", "progress": 12, "label": "面接計画を整理中..."})
        plan_prompt = _build_plan_prompt(payload)
        try:
            plan_data = None
            async for kind, llm_payload in _gen_self._stream_llm_json_completion(
                prompt=plan_prompt,
                user_message="面接計画をJSONで生成してください。",
                stream_string_fields=[],
                schema_hints={
                    "interview_type": "string",
                    "priority_topics": "array",
                    "opening_topic": "string",
                    "must_cover_topics": "array",
                    "risk_topics": "array",
                    "suggested_timeflow": "array",
                },
                max_tokens=700,
                temperature=0.2,
                feature="interview_plan",
                json_schema=INTERVIEW_PLAN_SCHEMA,
            ):
                if kind == "done":
                    plan_data = llm_payload
        except Exception:
            logger.warning("[Interview] plan generation failed; using deterministic fallback", exc_info=True)
            plan_data = None
        interview_plan = _normalize_interview_plan(plan_data or _fallback_plan(payload, setup))
        yield _sse_event("field_complete", {"path": "interview_plan", "value": interview_plan})

        yield _sse_event("progress", {"step": "opening", "progress": 42, "label": "最初の質問を準備中..."})
        opening_prompt = _build_opening_prompt(payload, interview_plan)
        try:
            opening_data = None
            async for kind, llm_payload in _gen_self._stream_llm_json_completion(
                prompt=opening_prompt,
                user_message="最初の面接質問をJSONで生成してください。",
                stream_string_fields=["question", "interview_setup_note"],
                schema_hints={
                    "question": "string",
                    "question_stage": "string",
                    "focus": "string",
                    "interview_setup_note": "string",
                    "turn_meta": "object",
                },
                max_tokens=700,
                temperature=0.35,
                feature="interview",
                json_schema=INTERVIEW_OPENING_SCHEMA,
            ):
                if kind == "chunk":
                    yield _sse_event("string_chunk", llm_payload)
                else:
                    opening_data = llm_payload
        except Exception:
            logger.warning("[Interview] opening generation failed; using deterministic fallback", exc_info=True)
            opening_data = _gen_self._build_fallback_opening_payload(payload, interview_plan, setup)

        opening_data = opening_data or _gen_self._build_fallback_opening_payload(payload, interview_plan, setup)
        question = _normalize_question_text(str(opening_data.get("question") or "").strip(), payload.company_name)
        if not question:
            opening_data = _gen_self._build_fallback_opening_payload(payload, interview_plan, setup)
            question = _normalize_question_text(str(opening_data.get("question") or "").strip(), payload.company_name)
        elif not _opening_question_matches_format(question, setup["interview_format"]):
            opening_data = _gen_self._build_fallback_opening_payload(payload, interview_plan, setup)
            question = _normalize_question_text(str(opening_data.get("question") or "").strip(), payload.company_name)
        turn_meta = _normalize_turn_meta(opening_data.get("turn_meta"), interview_plan["opening_topic"])
        if not turn_meta.get("focus_reason"):
            turn_meta["focus_reason"] = "初回導入"
        turn_state = _gen_self._derive_turn_state_for_question(
            _default_turn_state(setup),
            turn_meta,
            phase="opening",
        )
        turn_state["formatPhase"] = "opening"
        turn_state["interviewPlan"] = interview_plan
        turn_state["plan"] = interview_plan
        turn_state["turnMeta"] = turn_meta
        turn_state["turn_meta"] = turn_meta
        turn_state["interview_plan"] = interview_plan
        turn_state["lastQuestion"] = question
        turn_state["coverageState"] = _build_initial_coverage_state(interview_plan, setup)
        turn_state["recentQuestionSummaries"] = [
            _build_question_summary(str(opening_data.get("interview_setup_note") or ""), "初回導入"),
        ]
        turn_state["recentQuestionSummariesV2"] = [
            _build_recent_question_summary_v2(turn_meta, "初回導入", "turn-1"),
        ]
        turn_state["remainingTopics"] = interview_plan["must_cover_topics"]
        turn_state["coveredTopics"] = []
        turn_state["lastQuestionFocus"] = turn_meta.get("focus_reason") or "初回導入"

        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_start")
        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": None,
                    "focus": str(opening_data.get("focus") or turn_meta.get("focus_reason") or "志望理由の核").strip(),
                    "question_stage": "opening",
                    "interview_plan": interview_plan,
                    "turn_meta": turn_meta,
                    "stage_status": None,
                    "question_flow_completed": False,
                    "turn_state": turn_state,
                    **_version_metadata(setup, interview_plan),
                },
                "internal_telemetry": cost_summary,
            },
        )
    except Exception:
        logger.exception("[Interview] start failed")
        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_start")
        yield _sse_error_event(cost_summary)


# ---------------------------------------------------------------------------
# SSE generator: /turn
# ---------------------------------------------------------------------------


async def _generate_turn_progress(payload: InterviewTurnRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _gen_self._build_setup(payload)
        turn_state = _normalize_turn_state(payload.turn_state, setup)
        interview_plan = turn_state.get("interviewPlan") or _fallback_plan(payload, setup)
        turn_state["interviewPlan"] = interview_plan
        yield _sse_event("progress", {"step": "turn", "progress": 18, "label": "直近の回答を分析中..."})

        turn_prompt = _build_turn_prompt(payload, interview_plan, turn_state, turn_state.get("turnMeta") or {})
        turn_data: Optional[dict[str, Any]] = None
        try:
            async for kind, llm_payload in _gen_self._stream_llm_json_completion(
                prompt=turn_prompt,
                user_message="次の面接質問をJSONで生成してください。",
                stream_string_fields=["question"],
                schema_hints={
                    "question": "string",
                    "question_stage": "string",
                    "focus": "string",
                    "turn_meta": "object",
                    "plan_progress": "object",
                },
                max_tokens=700,
                temperature=0.35,
                feature="interview",
                json_schema=INTERVIEW_TURN_SCHEMA,
            ):
                if kind == "chunk":
                    yield _sse_event("string_chunk", llm_payload)
                else:
                    turn_data = llm_payload
        except Exception:
            logger.warning("[Interview] turn LLM generation failed; using deterministic fallback", exc_info=True)
            turn_data = _build_fallback_turn_payload(payload, interview_plan, setup, turn_state)
        turn_data = turn_data or _build_fallback_turn_payload(payload, interview_plan, setup, turn_state)
        turn_meta = _normalize_turn_meta(turn_data.get("turn_meta"), interview_plan["opening_topic"])
        if not turn_meta.get("focus_reason"):
            turn_meta["focus_reason"] = "計画に沿って深掘りするため"
        question_stage = str(turn_data.get("question_stage") or _question_stage_from_turn_meta(turn_meta)).strip()
        if question_stage not in {"opening", "turn", "experience", "company_understanding", "motivation_fit", "role_reason"}:
            question_stage = "turn"
        question = _normalize_question_text(str(turn_data.get("question") or "").strip(), payload.company_name)

        merged_state = _gen_self._merge_plan_progress(turn_state, turn_data, turn_meta)
        merged_state = _gen_self._derive_turn_state_for_question(merged_state, turn_meta, phase="turn")
        merged_state["interviewPlan"] = interview_plan
        merged_state["plan"] = interview_plan
        merged_state["turnMeta"] = turn_meta
        merged_state["turn_meta"] = turn_meta
        merged_state["interview_plan"] = interview_plan
        merged_state["lastQuestion"] = question
        merged_state["lastAnswer"] = next(
            (message.content for message in reversed(payload.conversation_history) if message.role == "user"),
            merged_state.get("lastAnswer"),
        )
        merged_state["lastTopic"] = turn_meta.get("topic")
        merged_state["recentQuestionSummaries"] = (merged_state.get("recentQuestionSummaries") or [])[-4:]
        merged_state["recentQuestionSummaries"].append(_build_question_summary(turn_meta.get("focus_reason"), "次の論点"))
        merged_state["recentQuestionSummaries"] = merged_state["recentQuestionSummaries"][-5:]
        # Phase 2 Stage 10: 末尾 N 件に切り詰めてから append することで turn_state
        # の永続化行長と SSE payload を一定に保つ (定数定義は contracts.py)。
        merged_state["recentQuestionSummariesV2"] = (
            merged_state.get("recentQuestionSummariesV2") or []
        )[-RECENT_QUESTION_SUMMARIES_STATE_WINDOW:]
        merged_state["recentQuestionSummariesV2"].append(
            _build_recent_question_summary_v2(
                turn_meta,
                "次の論点",
                f"turn-{int(merged_state.get('turnCount', 1) or 1)}",
            )
        )
        merged_state["phase"] = "turn"
        merged_state["question_stage"] = question_stage
        merged_state["currentStage"] = _question_stage_from_turn_meta(turn_meta)
        merged_state["remainingTopics"] = [
            topic for topic in _normalize_string_list(interview_plan.get("must_cover_topics")) if topic not in merged_state.get("coveredTopics", [])
        ]

        # Phase 2 Stage 6: short_coaching を SSE complete payload に含める。
        # LLM が 3 キー全てを文字列で返した場合はそれを採用、欠落/型不正の場合は
        # deterministic fallback (`_fallback_short_coaching`) で埋める。
        # 初回ターン (lastAnswer 空) では fallback が空文字 3 件を返し、UI 側で非表示にする。
        short_coaching_raw = turn_data.get("short_coaching") if isinstance(turn_data, dict) else None
        if (
            isinstance(short_coaching_raw, dict)
            and all(
                isinstance(short_coaching_raw.get(k), str)
                for k in ("good", "missing", "next_edit")
            )
        ):
            short_coaching = {
                "good": str(short_coaching_raw["good"]).strip(),
                "missing": str(short_coaching_raw["missing"]).strip(),
                "next_edit": str(short_coaching_raw["next_edit"]).strip(),
            }
        else:
            short_coaching = _gen_self._fallback_short_coaching(merged_state, turn_meta, setup)

        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_turn")
        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": None,
                    "focus": str(turn_data.get("focus") or turn_meta.get("focus_reason") or "次の論点").strip(),
                    "question_stage": question_stage,
                    "interview_plan": interview_plan,
                    "turn_meta": turn_meta,
                    "stage_status": None,
                    "question_flow_completed": False,
                    "turn_state": merged_state,
                    "short_coaching": short_coaching,
                    **_version_metadata(setup, interview_plan),
                },
                "internal_telemetry": cost_summary,
            },
        )
    except Exception:
        logger.exception("[Interview] turn failed")
        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_turn")
        yield _sse_error_event(cost_summary)


# ---------------------------------------------------------------------------
# SSE generator: /continue
# ---------------------------------------------------------------------------


async def _generate_continue_progress(payload: InterviewContinueRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _gen_self._build_setup(payload)
        turn_state = _normalize_turn_state(payload.turn_state, setup)
        interview_plan = turn_state.get("interviewPlan") or _fallback_plan(payload, setup)
        turn_state["interviewPlan"] = interview_plan
        yield _sse_event("progress", {"step": "continue", "progress": 20, "label": "講評を踏まえて再開しています..."})
        continue_prompt = _build_continue_prompt(payload)
        data: Optional[dict[str, Any]] = None
        try:
            async for kind, llm_payload in _gen_self._stream_llm_json_completion(
                prompt=continue_prompt,
                user_message="次の面接質問をJSONで生成してください。",
                stream_string_fields=["question"],
                schema_hints={
                    "question": "string",
                    "question_stage": "string",
                    "focus": "string",
                    "transition_line": "string",
                    "turn_meta": "object",
                },
                max_tokens=700,
                temperature=0.35,
                feature="interview",
                json_schema=INTERVIEW_CONTINUE_SCHEMA,
            ):
                if kind == "chunk":
                    yield _sse_event("string_chunk", llm_payload)
                else:
                    data = llm_payload
        except Exception:
            logger.warning("[Interview] continue LLM generation failed; using deterministic fallback", exc_info=True)
            data = _build_fallback_continue_payload(payload, interview_plan, setup, turn_state)
        data = data or _build_fallback_continue_payload(payload, interview_plan, setup, turn_state)
        question = _normalize_question_text(str(data.get("question") or "").strip(), payload.company_name)
        turn_meta = _normalize_turn_meta(data.get("turn_meta"), interview_plan["opening_topic"])
        if not turn_meta.get("focus_reason"):
            turn_meta["focus_reason"] = "講評を踏まえて再開するため"
        question_stage = str(data.get("question_stage") or _question_stage_from_turn_meta(turn_meta)).strip()
        if question_stage not in {"experience", "company_understanding", "motivation_fit", "role_reason", "turn"}:
            question_stage = "motivation_fit"

        merged_state = _gen_self._derive_turn_state_for_question(turn_state, turn_meta, phase="turn")
        merged_state["interviewPlan"] = interview_plan
        merged_state["turnMeta"] = turn_meta
        merged_state["turn_meta"] = turn_meta
        merged_state["interview_plan"] = interview_plan
        merged_state["lastQuestion"] = question
        merged_state["lastAnswer"] = next(
            (message.content for message in reversed(payload.conversation_history) if message.role == "user"),
            merged_state.get("lastAnswer"),
        )
        merged_state["phase"] = "turn"
        # Phase 2 Stage 10: /turn と同じ state window 定数を共有する。
        merged_state["recentQuestionSummariesV2"] = (
            merged_state.get("recentQuestionSummariesV2") or []
        )[-RECENT_QUESTION_SUMMARIES_STATE_WINDOW:]
        merged_state["recentQuestionSummariesV2"].append(
            _build_recent_question_summary_v2(
                turn_meta,
                "再開",
                f"turn-{int(merged_state.get('turnCount', 1) or 1)}",
            )
        )
        merged_state["remainingTopics"] = [
            topic for topic in _normalize_string_list(interview_plan.get("must_cover_topics")) if topic not in merged_state.get("coveredTopics", [])
        ]

        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_continue")
        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": data.get("transition_line"),
                    "focus": str(data.get("focus") or turn_meta.get("focus_reason") or "再開").strip(),
                    "question_stage": question_stage,
                    "interview_plan": interview_plan,
                    "turn_meta": turn_meta,
                    "stage_status": None,
                    "question_flow_completed": False,
                    "turn_state": merged_state,
                    **_version_metadata(setup, interview_plan),
                },
                "internal_telemetry": cost_summary,
            },
        )
    except Exception:
        logger.exception("[Interview] continue failed")
        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_continue")
        yield _sse_error_event(cost_summary)


# ---------------------------------------------------------------------------
# SSE generator: /feedback
# ---------------------------------------------------------------------------


async def _generate_feedback_progress(payload: InterviewFeedbackRequest) -> AsyncGenerator[str, None]:
    try:
        setup = _gen_self._build_setup(payload)
        turn_state = _normalize_turn_state(payload.turn_state, setup)
        interview_plan = turn_state.get("interviewPlan") or _fallback_plan(payload, setup)
        turn_state["interviewPlan"] = interview_plan
        yield _sse_event("progress", {"step": "feedback", "progress": 30, "label": "最終講評を整理中..."})
        feedback_prompt = _build_feedback_prompt(payload)
        data = None
        async for kind, llm_payload in _gen_self._stream_llm_json_completion(
            prompt=feedback_prompt,
            user_message="最終講評をJSONで生成してください。",
            stream_string_fields=["overall_comment", "improved_answer"],
            schema_hints={
                "overall_comment": "string",
                "scores": "object",
                "strengths": "array",
                "improvements": "array",
                "consistency_risks": "array",
                "weakest_question_type": "string",
                "improved_answer": "string",
                "next_preparation": "array",
                "premise_consistency": "number",
            },
            max_tokens=1600,
            temperature=0.25,
            feature="interview_feedback",
            json_schema=INTERVIEW_FEEDBACK_SCHEMA,
        ):
            if kind == "chunk":
                yield _sse_event("string_chunk", llm_payload)
            else:
                data = llm_payload
        feedback = _backfill_feedback_linkage_from_conversation(
            _normalize_feedback(data or {}),
            payload.conversation_history,
        )
        feedback = _enrich_feedback_defaults(feedback, setup=setup)
        final_state = {
            **turn_state,
            "phase": "feedback",
            "formatPhase": "feedback",
            "currentStage": "feedback",
            "nextAction": "feedback",
            "question_stage": "feedback",
            "turnMeta": turn_state.get("turnMeta") or _fallback_turn_meta(turn_state, interview_plan, setup=setup),
            "turn_meta": turn_state.get("turnMeta") or _fallback_turn_meta(turn_state, interview_plan, setup=setup),
            "interviewPlan": interview_plan,
            "plan": interview_plan,
            "interview_plan": interview_plan,
            "stageStatus": None,
        }

        yield _sse_event("field_complete", {"path": "scores", "value": feedback["scores"]})
        yield _sse_event("field_complete", {"path": "premise_consistency", "value": feedback["premise_consistency"]})
        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_feedback")
        yield _sse_event(
            "complete",
            {
                "data": {
                    **feedback,
                    "question_stage": "feedback",
                    "interview_plan": interview_plan,
                    "turn_meta": final_state["turnMeta"],
                    "stage_status": None,
                    "question_flow_completed": True,
                    "turn_state": final_state,
                    **_version_metadata(setup, interview_plan),
                },
                "internal_telemetry": cost_summary,
            },
        )
    except Exception:
        logger.exception("[Interview] feedback failed")
        cost_summary = _gen_self.consume_request_llm_cost_summary("interview_feedback")
        yield _sse_error_event(cost_summary)


__all__ = [
    "_sse_event",
    "_sse_error_event",
    "_stream_response",
    "_stream_llm_json_completion",
    "_generate_start_progress",
    "_generate_turn_progress",
    "_generate_continue_progress",
    "_generate_feedback_progress",
    "_fallback_short_coaching",
    "call_llm_streaming_fields",
    "consume_request_llm_cost_summary",
]
