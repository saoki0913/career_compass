"""Cancellation-token propagation tests for the gakuchika question pipeline.

Phase 7 threads a ``cancellation_token`` from the router wrapper down to the
streaming LLM call. These tests pin the contract that the token reaches
``call_llm_streaming_fields`` (the last hop before the provider), so a client
disconnect can stop the in-flight stream.
"""
from __future__ import annotations

import inspect

import pytest


def test_pipeline_generate_next_question_progress_accepts_cancellation_token():
    from app.services.gakuchika.question_pipeline import _generate_next_question_progress

    sig = inspect.signature(_generate_next_question_progress)
    assert "cancellation_token" in sig.parameters


@pytest.mark.asyncio
async def test_pipeline_forwards_cancellation_token_to_streaming(monkeypatch):
    """The gakuchika pipeline forwards cancellation_token to call_llm_streaming_fields."""
    from app.services.gakuchika import question_pipeline as pipeline
    from app.services.gakuchika.models import Message, NextQuestionRequest
    from app.utils.cancellation import CancellationToken
    from app.utils.llm_streaming import StreamFieldEvent
    from app.utils.llm import LLMResult

    received_token = object()

    async def fake_streaming_fields(*, cancellation_token=None, **kwargs):
        nonlocal received_token
        received_token = cancellation_token
        yield StreamFieldEvent(type="string_chunk", path="question", text="次の質問です。")
        yield StreamFieldEvent(
            type="complete",
            result=LLMResult(
                success=True,
                data={"question": "次の質問です。", "focus_key": "task"},
            ),
        )

    monkeypatch.setattr(pipeline, "call_llm_streaming_fields", fake_streaming_fields)

    token = CancellationToken()
    request = NextQuestionRequest(
        gakuchika_title="部活動でのリーダー経験",
        gakuchika_content="サッカー部で主将を務め、チームをまとめました。",
        conversation_history=[
            Message(role="user", content="主将として大会優勝を目指しました。"),
        ],
    )

    _ = [
        event
        async for event in pipeline._generate_next_question_progress(
            request,
            cancellation_token=token,
        )
    ]

    assert received_token is token
