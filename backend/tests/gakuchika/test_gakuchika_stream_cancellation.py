"""Tests for cancellation token propagation in gakuchika streaming.

The deeper pipeline -> ``call_llm_streaming_fields`` propagation contract lives
in ``test_question_pipeline_cancellation.py`` (named to match the implementation
module so the test-first guard resolves it).
"""
from __future__ import annotations

import inspect

import pytest


def test_generate_next_question_progress_accepts_cancellation_token():
    from app.routers.gakuchika import _generate_next_question_progress

    sig = inspect.signature(_generate_next_question_progress)
    assert "cancellation_token" in sig.parameters


@pytest.mark.asyncio
async def test_router_wrapper_forwards_cancellation_token_to_pipeline(monkeypatch):
    """The router-level wrapper forwards cancellation_token to the pipeline generator."""
    from app.routers import gakuchika as gakuchika_module
    from app.services.gakuchika.models import Message, NextQuestionRequest
    from app.utils.cancellation import CancellationToken

    received_token = object()

    async def fake_pipeline(request, cancellation_token=None):
        nonlocal received_token
        received_token = cancellation_token
        if False:  # pragma: no cover - generator marker
            yield ""

    monkeypatch.setattr(
        gakuchika_module,
        "_generate_next_question_progress_pipeline",
        fake_pipeline,
    )

    token = CancellationToken()
    request = NextQuestionRequest(
        gakuchika_title="部活動でのリーダー経験",
        gakuchika_content="サッカー部で主将を務めました。",
        conversation_history=[
            Message(role="user", content="チームをまとめました。"),
        ],
    )

    _ = [
        chunk
        async for chunk in gakuchika_module._generate_next_question_progress(
            request,
            cancellation_token=token,
        )
    ]

    assert received_token is token
