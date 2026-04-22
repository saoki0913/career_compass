"""
Motivation SSE streaming helpers.

Extracted from motivation.py to reduce module size.
Contains:
- _sse_event()          — SSE event formatter
- _generate_next_question_progress() — main async SSE generator
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from app.utils.llm import call_llm_streaming_fields, consume_request_llm_cost_summary
from app.routers.motivation_contract import build_stream_complete_event
from app.routers.motivation_models import NextQuestionRequest
from app.routers.motivation_summarize import (
    append_summary_to_system_prompt,
    maybe_summarize_older_messages,
)


# ── SSE Streaming helpers ──────────────────────────────────────────────

def _sse_event(event_type: str, data: dict) -> str:
    """Format SSE event data."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _generate_next_question_progress(
    request: NextQuestionRequest,
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for motivation next-question with progress updates.
    Shares preparation and post-processing with get_next_question.
    """
    from app.routers.motivation_pipeline import _prepare_motivation_next_question
    from app.routers.motivation_question import (
        _build_draft_ready_unlock_response,
        _build_draft_ready_response,
        _should_use_deepdive_mode,
        _build_motivation_deepdive_system_prompt,
        _build_motivation_question_system_prompt,
        _build_question_messages,
        _build_question_user_message,
        _assemble_regular_next_question_response,
    )

    try:
        if not request.company_name:
            yield _sse_event("error", {
                "message": "企業名が指定されていません",
                "internal_telemetry": consume_request_llm_cost_summary("motivation"),
            })
            return

        trimmed_messages, summary_text = await maybe_summarize_older_messages(
            request.conversation_history,
            request.conversation_context,
            company_name=request.company_name,
        )

        yield _sse_event("progress", {
            "step": "rag", "progress": 15, "label": "企業情報を取得中...",
        })
        await asyncio.sleep(0.05)

        prep = await _prepare_motivation_next_question(request)
        if prep.is_complete and not prep.was_draft_ready:
            response_obj = _build_draft_ready_unlock_response(prep=prep)
            yield _sse_event("complete", build_stream_complete_event(response_obj))
            return
        if prep.is_complete or (prep.was_draft_ready and not prep.has_generated_draft):
            response_obj = _build_draft_ready_response(prep=prep)
            yield _sse_event("complete", build_stream_complete_event(response_obj))
            return

        yield _sse_event("progress", {
            "step": "evaluation", "progress": 40, "label": "回答を分析中...",
        })
        await asyncio.sleep(0.05)

        yield _sse_event("progress", {
            "step": "question", "progress": 65, "label": "質問を考え中...",
        })
        await asyncio.sleep(0.05)

        prompt = (
            _build_motivation_deepdive_system_prompt(request=request, prep=prep)
            if _should_use_deepdive_mode(prep)
            else _build_motivation_question_system_prompt(request=request, prep=prep)
        )
        prompt = append_summary_to_system_prompt(prompt, summary_text)
        messages = _build_question_messages(trimmed_messages)
        user_message = _build_question_user_message(trimmed_messages)

        llm_result = None
        async for event in call_llm_streaming_fields(
            system_prompt=prompt,
            user_message=user_message,
            messages=messages,
            max_tokens=700,
            temperature=0.5,
            feature="motivation",
            schema_hints={
                "question": "string",
                "evidence_summary": "string",
                "coaching_focus": "string",
                "risk_flags": "array",
            },
            stream_string_fields=["question"],
            partial_required_fields=("question",),
        ):
            if event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {
                    "message": error.message if error else "AIサービスに接続できませんでした。",
                    "internal_telemetry": consume_request_llm_cost_summary("motivation"),
                })
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success:
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("motivation"),
            })
            return

        data = llm_result.data
        if not data or not data.get("question"):
            yield _sse_event("error", {
                "message": "AIから有効な質問を取得できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("motivation"),
            })
            return

        yield _sse_event("progress", {
            "step": "finalize", "progress": 85, "label": "次の確認内容を整えています...",
        })
        await asyncio.sleep(0.05)

        response_obj = await _assemble_regular_next_question_response(request=request, prep=prep, data=data)
        yield _sse_event("complete", build_stream_complete_event(response_obj))

    except Exception as e:
        yield _sse_event("error", {
            "message": f"予期しないエラーが発生しました: {str(e)}",
            "internal_telemetry": consume_request_llm_cost_summary("motivation"),
        })
