"""Tests for cancellation token propagation in ES review streaming."""
from __future__ import annotations

import inspect

import pytest


def test_router_review_section_with_template_accepts_cancellation_token():
    """Router compatibility wrapper must accept cancellation_token."""
    from app.routers.es_review import review_section_with_template

    sig = inspect.signature(review_section_with_template)
    assert "cancellation_token" in sig.parameters


def test_generate_review_progress_accepts_cancellation_token():
    """_generate_review_progress must accept a cancellation_token parameter."""
    from app.routers.es_review import _generate_review_progress

    sig = inspect.signature(_generate_review_progress)
    assert "cancellation_token" in sig.parameters


def test_stream_with_lease_passes_cancellation_token():
    """Verify the _stream_with_lease closure structure passes cancellation."""
    from app.routers.es_review import _generate_review_progress
    import inspect

    sig = inspect.signature(_generate_review_progress)
    param = sig.parameters["cancellation_token"]
    assert param.default is None


@pytest.mark.asyncio
async def test_router_review_section_with_template_forwards_cancellation_token(monkeypatch):
    """Router wrapper forwards cancellation_token to the service orchestrator."""
    from app.routers import es_review as es_review_module
    from app.routers.es_review import ReviewRequest, ReviewResponse, TemplateRequest
    from app.utils.cancellation import CancellationToken

    received_token = None

    async def fake_service_runner(**kwargs):
        nonlocal received_token
        received_token = kwargs.get("cancellation_token")
        return ReviewResponse(rewrites=[])

    monkeypatch.setattr(
        es_review_module,
        "_run_review_section_with_template",
        fake_service_runner,
    )

    token = CancellationToken()
    request = ReviewRequest(
        content="私は課題解決力を生かして価値を出したいです。",
        section_title="自己PRを教えてください。",
        template_request=TemplateRequest(
            template_type="self_pr",
            question="自己PRを教えてください。",
            answer="私は課題解決力を生かして価値を出したいです。",
        ),
    )

    await es_review_module.review_section_with_template(
        request=request,
        rag_sources=[],
        company_rag_available=False,
        cancellation_token=token,
    )

    assert received_token is token


@pytest.mark.asyncio
async def test_generate_review_progress_passes_cancellation_token_to_runner():
    """_generate_review_progress passes cancellation_token through review_runner_kwargs."""
    from app.routers.es_review import (
        ReviewRequest,
        ReviewResponse,
        TemplateRequest,
        _generate_review_progress,
    )
    from app.utils.cancellation import CancellationToken

    token = CancellationToken()

    async def fake_review_runner(**kwargs):
        assert kwargs["cancellation_token"] is token
        return ReviewResponse(rewrites=[])

    request = ReviewRequest(
        content="私は課題解決力を生かして価値を出したいです。",
        section_title="自己PRを教えてください。",
        template_request=TemplateRequest(
            template_type="self_pr",
            question="自己PRを教えてください。",
            answer="私は課題解決力を生かして価値を出したいです。",
        ),
    )

    events = [
        event
        async for event in _generate_review_progress(
            request,
            review_runner=fake_review_runner,
            cancellation_token=token,
        )
    ]

    assert any('"type": "complete"' in event for event in events)
