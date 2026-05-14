from __future__ import annotations

import asyncio

import pytest

from app.utils.cancellation import CancellationToken, noop_token
from app.utils.llm_call_guard import call_with_cancellation, guard_llm_call
from app.utils.llm_usage_cost import (
    get_remaining_llm_call_budget,
    reset_request_llm_call_budget,
    set_request_llm_call_budget,
)


@pytest.fixture(autouse=True)
def _reset_budget():
    reset_request_llm_call_budget()
    yield
    reset_request_llm_call_budget()


# --- guard_llm_call ---


def test_guard_passes_when_budget_available():
    set_request_llm_call_budget(budget=5)
    result = guard_llm_call(feature="es_review", provider="anthropic")
    assert result is None


def test_guard_passes_when_no_budget_set():
    result = guard_llm_call(feature="es_review", provider="anthropic")
    assert result is None


def test_guard_raises_on_cancelled_token():
    token = CancellationToken()
    token.cancel("test")
    set_request_llm_call_budget(budget=5)
    with pytest.raises(asyncio.CancelledError):
        guard_llm_call(cancellation_token=token, feature="es_review")


def test_guard_returns_error_on_budget_exceeded():
    set_request_llm_call_budget(budget=0)
    result = guard_llm_call(feature="es_review", provider="anthropic")
    assert result is not None
    assert not result.success
    assert result.error is not None
    assert result.error.error_type == "budget_exceeded"


def test_guard_cancellation_checked_before_budget():
    token = CancellationToken()
    token.cancel()
    set_request_llm_call_budget(budget=1)
    with pytest.raises(asyncio.CancelledError):
        guard_llm_call(cancellation_token=token, feature="es_review")
    assert get_remaining_llm_call_budget() == 1


def test_guard_with_noop_token():
    set_request_llm_call_budget(budget=5)
    result = guard_llm_call(cancellation_token=noop_token(), feature="es_review")
    assert result is None
    assert get_remaining_llm_call_budget() == 4


# --- call_with_cancellation ---


@pytest.mark.asyncio
async def test_call_with_cancellation_normal():
    async def coro():
        return 42

    result = await call_with_cancellation(coro(), noop_token())
    assert result == 42


@pytest.mark.asyncio
async def test_call_with_cancellation_none_token():
    async def coro():
        return "ok"

    result = await call_with_cancellation(coro(), None)
    assert result == "ok"


@pytest.mark.asyncio
async def test_call_with_cancellation_cancelled_mid_flight():
    token = CancellationToken()

    async def slow_coro():
        await asyncio.sleep(10)
        return 42

    async def cancel_soon():
        await asyncio.sleep(0.1)
        token.cancel("test")

    asyncio.create_task(cancel_soon())
    with pytest.raises(asyncio.CancelledError):
        await call_with_cancellation(slow_coro(), token)


@pytest.mark.asyncio
async def test_call_with_cancellation_already_cancelled():
    token = CancellationToken()
    token.cancel("pre-cancelled")

    async def coro():
        await asyncio.sleep(10)
        return 42

    with pytest.raises(asyncio.CancelledError):
        await call_with_cancellation(coro(), token)
