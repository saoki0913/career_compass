"""Question-generation pipeline helpers for the Gakuchika service layer."""

from __future__ import annotations

import json
import random
from typing import Any, AsyncGenerator

from app.prompts.gakuchika_prompt_builder import (
    INITIAL_QUESTION_MAX_TOKENS,
    _render_initial_question_system_prompt,
)
from app.prompts.gakuchika_prompts import INITIAL_QUESTION_USER_MESSAGE
from app.normalization.gakuchika_payload import (
    _normalize_deepdive_payload,
    _normalize_es_build_payload,
)
from app.services.gakuchika.core import (
    NEXT_QUESTION_MAX_TOKENS,
    _build_deepdive_prompt,
    _build_es_prompt,
    _build_initial_fallback_response,
    _build_user_corpus,
    _is_deepdive_request,
    _resolve_next_action,
)
from app.services.gakuchika.models import NextQuestionRequest
from app.services.gakuchika.retry import _retry_question_generation
from app.utils.gakuchika_text import _classify_input_richness, _clean_string, _fallback_build_meta
from app.utils.llm import call_llm_with_error, consume_request_llm_cost_summary
from app.utils.llm_streaming import call_llm_streaming_fields
from app.utils.llm_prompt_safety import sanitize_prompt_input
from app.utils.secure_logger import get_logger


logger = get_logger(__name__)
NEXT_QUESTION_FEATURE = "gakuchika"


def _sse_event(event_type: str, data: dict[str, Any]) -> str:
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _stream_schema_hints(is_deepdive: bool) -> dict[str, str]:
    if is_deepdive:
        return {
            "question": "string",
            "answer_hint": "string",
            "progress_label": "string",
            "focus_key": "string",
            "deepdive_stage": "string",
        }
    return {
        "question": "string",
        "answer_hint": "string",
        "progress_label": "string",
        "focus_key": "string",
        "missing_elements": "array",
        "ready_for_draft": "boolean",
        "draft_readiness_reason": "string",
    }


def _build_retry_user_message(
    *,
    base_user_message: str,
    retry_guidance: str | None,
    forced_focus_key: str | None,
) -> str:
    retry_user_message = base_user_message
    if retry_guidance:
        retry_user_message = f"{retry_user_message}\n\n{retry_guidance}"
    if forced_focus_key:
        retry_user_message = (
            f'{retry_user_message}\n\n再生成条件: focus_key は "{forced_focus_key}" に固定し、'
            "その論点に沿った質問だけを返してください。"
        )
    return retry_user_message


async def _generate_initial_question(request: NextQuestionRequest) -> tuple[str, dict[str, Any]]:
    """Orchestrate initial question generation."""
    input_richness_mode = _classify_input_richness(
        request.gakuchika_content or request.gakuchika_title
    )

    if not request.gakuchika_content:
        return _build_initial_fallback_response(
            focus_key="context",
            input_richness_mode=input_richness_mode,
            question_count=request.question_count,
        )

    system_prompt = _render_initial_question_system_prompt(
        input_richness_mode=input_richness_mode,
    )
    user_message = INITIAL_QUESTION_USER_MESSAGE.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        gakuchika_content=sanitize_prompt_input(request.gakuchika_content, max_length=2000),
        input_richness_mode=input_richness_mode,
    )
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=INITIAL_QUESTION_MAX_TOKENS,
        temperature=0.4,
        feature=NEXT_QUESTION_FEATURE,
        retry_on_parse=True,
        disable_fallback=True,
    )

    if llm_result.success and llm_result.data is not None:
        question, state, _ = _normalize_es_build_payload(
            llm_result.data,
            None,
            conversation_history=[],
            conversation_text=request.gakuchika_content or "",
            input_richness_mode=input_richness_mode,
            question_count=request.question_count,
        )
        if question or state["ready_for_draft"]:
            return question or _fallback_build_meta("context")["question"], state

    return _build_initial_fallback_response(
        focus_key=random.choice(["context", "task", "action"]),
        input_richness_mode=input_richness_mode,
        question_count=request.question_count,
    )


async def _generate_next_question_progress(
    request: "NextQuestionRequest",
) -> AsyncGenerator[str, None]:
    try:
        if not request.gakuchika_title:
            yield _sse_event("error", {
                "message": "ガクチカのテーマが指定されていません",
                "internal_telemetry": consume_request_llm_cost_summary(NEXT_QUESTION_FEATURE),
            })
            return

        has_user_response = any(msg.role == "user" for msg in request.conversation_history)
        if not has_user_response and not _is_deepdive_request(request):
            question, state = await _generate_initial_question(request)
            coach_progress_message = state.get("coach_progress_message")
            if coach_progress_message:
                yield _sse_event("field_complete", {
                    "path": "coach_progress_message",
                    "value": coach_progress_message,
                })
            remaining_estimate = state.get("remaining_questions_estimate")
            if isinstance(remaining_estimate, int):
                yield _sse_event("field_complete", {
                    "path": "remaining_questions_estimate",
                    "value": remaining_estimate,
                })
            yield _sse_event("complete", {
                "data": {
                    "question": question,
                    "conversation_state": state,
                    "next_action": _resolve_next_action(state),
                },
                "internal_telemetry": consume_request_llm_cost_summary(NEXT_QUESTION_FEATURE),
            })
            return

        is_deepdive = _is_deepdive_request(request)
        system_prompt, user_message = (
            _build_deepdive_prompt(request) if is_deepdive else _build_es_prompt(request)
        )
        fallback_state = request.conversation_state

        yield _sse_event("progress", {
            "step": "analysis",
            "progress": 30,
            "label": "質問の意図を整理中",
        })
        yield _sse_event("progress", {
            "step": "question",
            "progress": 60,
            "label": "次の質問を生成中...",
        })

        llm_result = None
        streamed_question_chunks: list[str] = []
        streamed_fields: dict[str, Any] = {}
        async for event in call_llm_streaming_fields(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=NEXT_QUESTION_MAX_TOKENS,
            temperature=0.35,
            feature=NEXT_QUESTION_FEATURE,
            schema_hints=_stream_schema_hints(is_deepdive),
            stream_string_fields=["question"],
            attempt_repair_on_parse_failure=False,
            partial_required_fields=("question",),
        ):
            if event.type == "string_chunk":
                if event.path == "question":
                    streamed_question_chunks.append(event.text)
            elif event.type == "field_complete":
                streamed_fields[event.path] = event.value
            elif event.type == "array_item_complete":
                streamed_fields.setdefault(event.path, []).append(event.value)
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {
                    "message": error.message if error else "AIサービスに接続できませんでした。",
                    "internal_telemetry": consume_request_llm_cost_summary(NEXT_QUESTION_FEATURE),
                })
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or llm_result.data is None:
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary(NEXT_QUESTION_FEATURE),
            })
            return

        initial_payload = dict(llm_result.data or {})
        if streamed_question_chunks and not initial_payload.get("question"):
            initial_payload["question"] = "".join(streamed_question_chunks)
        for key, value in streamed_fields.items():
            initial_payload.setdefault(key, value)

        initial_focus = (
            _clean_string(initial_payload.get("focus_key"))
            or (fallback_state.focus_key if fallback_state else None)
            or ("challenge" if is_deepdive else "task")
        )
        recent_questions = list(fallback_state.recent_question_texts) if fallback_state else []
        asked_focuses = list(fallback_state.asked_focuses) if fallback_state else []
        initial_attempt_pending = True

        async def _generate_retry_attempt(
            *,
            temperature: float,
            retry_guidance: str | None,
            forced_focus_key: str | None,
        ) -> tuple[str, str, dict[str, Any]]:
            nonlocal initial_attempt_pending

            if initial_attempt_pending:
                initial_attempt_pending = False
                payload = dict(initial_payload)
                resolved_focus = (
                    forced_focus_key
                    or _clean_string(payload.get("focus_key"))
                    or initial_focus
                )
                if forced_focus_key:
                    payload["focus_key"] = forced_focus_key
                question_text = _clean_string(payload.get("question"))
                return question_text, resolved_focus, payload

            retry_result = await call_llm_with_error(
                system_prompt=system_prompt,
                user_message=_build_retry_user_message(
                    base_user_message=user_message,
                    retry_guidance=retry_guidance,
                    forced_focus_key=forced_focus_key,
                ),
                max_tokens=NEXT_QUESTION_MAX_TOKENS,
                temperature=temperature,
                feature=NEXT_QUESTION_FEATURE,
                retry_on_parse=True,
                disable_fallback=True,
            )
            if not retry_result.success or retry_result.data is None:
                error = retry_result.error
                raise RuntimeError(
                    error.message if error else "AIサービスに接続できませんでした。"
                )

            payload = dict(retry_result.data)
            resolved_focus = (
                forced_focus_key
                or _clean_string(payload.get("focus_key"))
                or initial_focus
            )
            if forced_focus_key:
                payload["focus_key"] = forced_focus_key
            question_text = _clean_string(payload.get("question"))
            return question_text, resolved_focus, payload

        question, _resolved_focus, selected_payload, retry_degraded = (
            await _retry_question_generation(
                generate_fn=_generate_retry_attempt,
                recent_questions=recent_questions,
                asked_focuses=asked_focuses,
                focus_key=initial_focus,
                is_deepdive=is_deepdive,
            )
        )

        if question:
            yield _sse_event("string_chunk", {"path": "question", "text": question})

        if is_deepdive:
            question, state, source = _normalize_deepdive_payload(
                selected_payload,
                fallback_state,
                conversation_history=[
                    message.model_dump(mode="python") for message in request.conversation_history
                ],
                conversation_text=_build_user_corpus(
                    request.conversation_history,
                    initial_content=request.gakuchika_content,
                    draft_text=request.conversation_state.draft_text if request.conversation_state else None,
                ),
                draft_text=request.conversation_state.draft_text if request.conversation_state else "",
                question_count=request.question_count,
            )
        else:
            question, state, source = _normalize_es_build_payload(
                selected_payload,
                fallback_state,
                conversation_history=[
                    message.model_dump(mode="python") for message in request.conversation_history
                ],
                conversation_text=_build_user_corpus(
                    request.conversation_history,
                    initial_content=request.gakuchika_content,
                ),
                input_richness_mode=(
                    request.conversation_state.input_richness_mode
                    if request.conversation_state
                    else _classify_input_richness(request.gakuchika_content or request.gakuchika_title)
                ),
                question_count=request.question_count,
            )
        state["retry_degraded"] = retry_degraded

        logger.info(
            "[Gakuchika] normalized via %s (stage=%s focus=%s retry_degraded=%s)",
            source,
            state["stage"],
            state["focus_key"],
            retry_degraded,
        )

        coach_progress_message = state.get("coach_progress_message")
        if coach_progress_message:
            yield _sse_event("field_complete", {
                "path": "coach_progress_message",
                "value": coach_progress_message,
            })
        remaining_estimate = state.get("remaining_questions_estimate")
        if isinstance(remaining_estimate, int):
            yield _sse_event("field_complete", {
                "path": "remaining_questions_estimate",
                "value": remaining_estimate,
            })

        yield _sse_event("complete", {
            "data": {
                    "question": question,
                    "conversation_state": state,
                    "next_action": _resolve_next_action(state),
                },
            "internal_telemetry": consume_request_llm_cost_summary(NEXT_QUESTION_FEATURE),
        })
    except Exception:
        logger.error("[Gakuchika/SSE] unexpected next-question error", exc_info=True)
        yield _sse_event("error", {
            "message": "予期しないエラーが発生しました。時間をおいてもう一度お試しください。",
            "internal_telemetry": consume_request_llm_cost_summary(NEXT_QUESTION_FEATURE),
        })
