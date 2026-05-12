"""
Compatibility shim for motivation SSE streaming helpers.

The service-layer implementation lives in
``app.services.motivation.stream_service``. This module remains during CA-1
so existing imports and monkeypatch-based tests keep working.
"""

from __future__ import annotations

from typing import AsyncGenerator

from app.services.motivation.models import NextQuestionRequest
from app.services.motivation import stream_service as _stream_service
from app.utils.cancellation import CancellationTokenLike
from app.utils.llm_usage_cost import (
    set_request_llm_call_budget,
    reset_request_llm_call_budget,
    FEATURE_LLM_CALL_BUDGETS,
)
from app.utils.llm_streaming import call_llm_streaming_fields


def _sse_event(event_type: str, data: dict) -> str:
    return _stream_service._sse_event(event_type, data)


async def _generate_next_question_progress(
    request: NextQuestionRequest,
    *,
    tenant_key: str | None = None,
    cancellation_token: CancellationTokenLike | None = None,
) -> AsyncGenerator[str, None]:
    set_request_llm_call_budget(FEATURE_LLM_CALL_BUDGETS.get("motivation"))
    try:
        async for chunk in _generate_next_question_progress_inner(
            request, tenant_key=tenant_key,
        ):
            yield chunk
    finally:
        reset_request_llm_call_budget()


async def _generate_next_question_progress_inner(
    request: NextQuestionRequest,
    *,
    tenant_key: str | None = None,
) -> AsyncGenerator[str, None]:
    original_streamer = _stream_service.call_llm_streaming_fields
    patched_streamer = call_llm_streaming_fields

    if patched_streamer is original_streamer:
        async for chunk in _stream_service._generate_next_question_progress(
            request,
            tenant_key=tenant_key,
        ):
            yield chunk
        return

    _stream_service.call_llm_streaming_fields = patched_streamer
    try:
        async for chunk in _stream_service._generate_next_question_progress(
            request,
            tenant_key=tenant_key,
        ):
            yield chunk
    finally:
        _stream_service.call_llm_streaming_fields = original_streamer
