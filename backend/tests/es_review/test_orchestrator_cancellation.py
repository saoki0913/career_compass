"""Tests for cancellation token propagation through ES review orchestrator.

Debug logging formatters are tested in test_tracing_debug_format.py.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.utils.cancellation import CancellationToken, noop_token


def _make_minimal_request():
    """Build a minimal ReviewRequest-like object for orchestrator tests."""
    from app.services.es_review.models import (
        ReviewRequest,
        TemplateRequest,
    )

    return ReviewRequest(
        content="テスト用の自己PRです。私は大学でリーダーシップを発揮しました。",
        section_title="自己PR",
        template_request=TemplateRequest(
            template_type="self_pr",
            question="自己PRを書いてください",
            answer="テスト用の自己PRです。私は大学でリーダーシップを発揮しました。",
        ),
    )


@pytest.mark.asyncio
async def test_review_section_with_template_accepts_cancellation_token():
    """review_section_with_template must accept and forward cancellation_token."""
    from app.services.es_review.orchestrator import review_section_with_template
    import inspect

    sig = inspect.signature(review_section_with_template)
    assert "cancellation_token" in sig.parameters


@pytest.mark.asyncio
async def test_prepare_review_context_sets_cancellation_token():
    """prepare_review_context should set ctx.cancellation_token."""
    from app.services.es_review.orchestrator import prepare_review_context

    token = CancellationToken()
    request = _make_minimal_request()

    with patch(
        "app.services.es_review.orchestrator.retrieve_reference_es_semantic",
        new_callable=AsyncMock,
        return_value=[],
    ):
        ctx = await prepare_review_context(
            request=request,
            rag_sources=[],
            company_rag_available=False,
            cancellation_token=token,
        )
    assert ctx.cancellation_token is token


@pytest.mark.asyncio
async def test_prepare_review_context_defaults_to_noop_token():
    """Without cancellation_token, ctx should get noop_token."""
    from app.services.es_review.orchestrator import prepare_review_context

    request = _make_minimal_request()
    with patch(
        "app.services.es_review.orchestrator.retrieve_reference_es_semantic",
        new_callable=AsyncMock,
        return_value=[],
    ):
        ctx = await prepare_review_context(
            request=request,
            rag_sources=[],
            company_rag_available=False,
        )
    assert ctx.cancellation_token is noop_token()


@pytest.mark.asyncio
async def test_execute_rewrite_loop_checks_cancellation():
    """execute_rewrite_loop should raise CancelledError when token is cancelled."""
    from app.services.es_review.orchestrator import execute_rewrite_loop
    from app.services.es_review.models import ReviewContext, ReviewRequest, TemplateRequest

    token = CancellationToken()
    token.cancel("test")

    request = _make_minimal_request()
    ctx = ReviewContext(
        template_type="self_pr",
        template_request=request.template_request,
        request=request,
        json_caller=AsyncMock(),
        text_caller=AsyncMock(),
        review_feature="es_review",
        llm_provider="claude",
        llm_model=None,
        review_variant="standard",
        injection_risk=None,
        progress_queue=asyncio.Queue(),
        cancellation_token=token,
    )

    with pytest.raises(asyncio.CancelledError):
        await execute_rewrite_loop(ctx)


@pytest.mark.asyncio
async def test_execute_recovery_pipeline_checks_cancellation():
    """execute_recovery_pipeline should raise CancelledError when cancelled."""
    from app.services.es_review.orchestrator import execute_recovery_pipeline
    from app.services.es_review.models import ReviewContext, RewriteLoopResult, ReviewRequest, TemplateRequest

    token = CancellationToken()
    token.cancel("test")

    request = _make_minimal_request()
    ctx = ReviewContext(
        template_type="self_pr",
        template_request=request.template_request,
        request=request,
        json_caller=AsyncMock(),
        text_caller=AsyncMock(),
        review_feature="es_review",
        llm_provider="claude",
        llm_model=None,
        review_variant="standard",
        injection_risk=None,
        progress_queue=asyncio.Queue(),
        cancellation_token=token,
    )

    loop_result = RewriteLoopResult()
    with pytest.raises(asyncio.CancelledError):
        await execute_recovery_pipeline(ctx, loop_result)
