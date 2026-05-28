"""Cancellation-token propagation tests for the interview SSE generators.

Phase 7 threads a ``cancellation_token`` from each ``_generate_*_progress``
generator into the shared ``_stream_llm_json_completion`` helper and from there
into ``call_llm_streaming_fields`` (the last hop before the provider).
"""
from __future__ import annotations

import inspect

import pytest


def test_stream_llm_json_completion_accepts_cancellation_token():
    from app.routers._interview.generators import _stream_llm_json_completion

    sig = inspect.signature(_stream_llm_json_completion)
    assert "cancellation_token" in sig.parameters


@pytest.mark.asyncio
async def test_stream_llm_json_completion_forwards_cancellation_token(monkeypatch):
    """_stream_llm_json_completion forwards cancellation_token to call_llm_streaming_fields."""
    from app.routers._interview import generators as gen
    from app.utils.cancellation import CancellationToken
    from app.utils.llm_streaming import StreamFieldEvent
    from app.utils.llm import LLMResult

    received_token = object()

    async def fake_streaming_fields(*, cancellation_token=None, **kwargs):
        nonlocal received_token
        received_token = cancellation_token
        yield StreamFieldEvent(
            type="complete",
            result=LLMResult(success=True, data={"question": "次の質問です。"}),
        )

    monkeypatch.setattr(gen, "call_llm_streaming_fields", fake_streaming_fields)

    token = CancellationToken()
    _ = [
        event
        async for event in gen._stream_llm_json_completion(
            prompt="システムプロンプト",
            user_message="質問を生成してください。",
            stream_string_fields=["question"],
            schema_hints={"question": "string"},
            max_tokens=200,
            temperature=0.3,
            feature="interview",
            cancellation_token=token,
        )
    ]

    assert received_token is token


@pytest.mark.asyncio
async def test_generate_turn_progress_forwards_cancellation_token(monkeypatch):
    """_generate_turn_progress forwards cancellation_token to _stream_llm_json_completion."""
    from app.routers._interview import generators as gen
    from app.routers._interview.contracts import InterviewTurnRequest
    from app.utils.cancellation import CancellationToken

    received_token = object()

    async def fake_completion(*, cancellation_token=None, **kwargs):
        nonlocal received_token
        received_token = cancellation_token
        yield ("done", {"question": "次の面接質問です。", "turn_meta": {}})

    monkeypatch.setattr(gen, "_stream_llm_json_completion", fake_completion)

    token = CancellationToken()
    payload = InterviewTurnRequest(
        company_name="テスト株式会社",
        company_summary="ソフトウェア企業です。",
        conversation_history=[],
        turn_state={},
    )

    _ = [
        chunk
        async for chunk in gen._generate_turn_progress(payload, cancellation_token=token)
    ]

    assert received_token is token
