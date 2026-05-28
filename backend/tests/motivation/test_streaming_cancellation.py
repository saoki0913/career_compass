"""Cancellation-token propagation tests for the motivation streaming shim.

The shim in ``app.services.motivation.streaming`` receives the lease's
``cancellation_token`` from the facade and must forward it to the canonical
stream service.
"""
from __future__ import annotations

import inspect

import pytest


def test_shim_generate_next_question_progress_accepts_cancellation_token():
    from app.services.motivation.streaming import _generate_next_question_progress

    sig = inspect.signature(_generate_next_question_progress)
    assert "cancellation_token" in sig.parameters


@pytest.mark.asyncio
async def test_streaming_shim_forwards_cancellation_token_to_stream_service(monkeypatch):
    """The streaming shim forwards cancellation_token to the canonical stream service."""
    from app.services.motivation import streaming
    from app.services.motivation import stream_service
    from app.services.motivation.models import NextQuestionRequest, Message
    from app.utils.cancellation import CancellationToken

    received_token = object()

    async def fake_canonical(request, *, tenant_key=None, cancellation_token=None):
        nonlocal received_token
        received_token = cancellation_token
        if False:  # pragma: no cover - generator marker
            yield ""

    monkeypatch.setattr(
        stream_service,
        "_generate_next_question_progress",
        fake_canonical,
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
        chunk
        async for chunk in streaming._generate_next_question_progress(
            request,
            cancellation_token=token,
        )
    ]

    assert received_token is token
