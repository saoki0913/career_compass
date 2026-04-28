"""
Compatibility shim for motivation SSE streaming helpers.

The service-layer implementation lives in
``app.services.motivation.stream_service``. This module remains during CA-1
so existing imports and monkeypatch-based tests keep working.
"""

from __future__ import annotations

from typing import AsyncGenerator

from app.routers.motivation_models import NextQuestionRequest
from app.services.motivation import stream_service as _stream_service
from app.utils.llm_streaming import call_llm_streaming_fields


def _sse_event(event_type: str, data: dict) -> str:
    return _stream_service._sse_event(event_type, data)


async def _generate_next_question_progress(
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
