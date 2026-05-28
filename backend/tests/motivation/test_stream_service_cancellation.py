"""Cancellation-token propagation tests for the motivation stream service.

Phase 7 threads a ``cancellation_token`` from the streaming shim into the
canonical stream service and from there into ``call_llm_streaming_fields``
(the last hop before the provider).
"""
from __future__ import annotations

import inspect

import pytest


def test_stream_service_generate_next_question_progress_accepts_cancellation_token():
    from app.services.motivation.stream_service import _generate_next_question_progress

    sig = inspect.signature(_generate_next_question_progress)
    assert "cancellation_token" in sig.parameters


@pytest.mark.asyncio
async def test_stream_service_forwards_cancellation_token_to_streaming(monkeypatch):
    """The motivation stream service forwards cancellation_token to call_llm_streaming_fields."""
    from types import SimpleNamespace

    from app.services.motivation import stream_service
    from app.services.motivation import pipeline as pipeline_module
    from app.services.motivation import question as question_module
    from app.services.motivation.models import NextQuestionRequest, Message
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
            result=LLMResult(success=True, data={"question": "次の質問です。"}),
        )

    async def fake_prepare(request, *, tenant_key=None):
        return SimpleNamespace(
            is_complete=False,
            was_draft_ready=False,
            has_generated_draft=False,
        )

    async def fake_summarize(history, context, *, company_name):
        return history, None

    async def fake_assemble(*, request, prep, data):
        return SimpleNamespace(question=data.get("question"))

    # Isolate token propagation to the streaming LLM call by stubbing the
    # RAG/DB preparation and the prompt-construction helpers.
    monkeypatch.setattr(stream_service, "call_llm_streaming_fields", fake_streaming_fields)
    monkeypatch.setattr(pipeline_module, "_prepare_motivation_next_question", fake_prepare)
    monkeypatch.setattr(stream_service, "maybe_summarize_older_messages", fake_summarize)
    monkeypatch.setattr(question_module, "_assemble_regular_next_question_response", fake_assemble)
    monkeypatch.setattr(question_module, "_should_use_deepdive_mode", lambda prep: False)
    monkeypatch.setattr(
        question_module,
        "_build_motivation_question_system_prompt",
        lambda *, request, prep: "システムプロンプト",
    )
    monkeypatch.setattr(question_module, "_build_question_messages", lambda messages: [])
    monkeypatch.setattr(question_module, "_build_question_user_message", lambda messages: "回答")
    monkeypatch.setattr(
        stream_service,
        "build_stream_complete_event",
        lambda response_obj: {"data": {}},
    )

    token = CancellationToken()
    request = NextQuestionRequest(
        company_id="11111111-1111-1111-1111-111111111111",
        company_name="テスト株式会社",
        conversation_history=[
            Message(role="user", content="御社の事業に興味があります。"),
        ],
    )

    _ = [
        event
        async for event in stream_service._generate_next_question_progress(
            request,
            cancellation_token=token,
        )
    ]

    assert received_token is token
