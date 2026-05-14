from __future__ import annotations

import asyncio
from typing import Any, Coroutine

from app.utils.cancellation import CancellationTokenLike, _NoopCancellationToken
from app.utils.llm_providers import LLMResult, _create_error
from app.utils.llm_usage_cost import check_and_decrement_llm_call_budget


def guard_llm_call(
    cancellation_token: CancellationTokenLike | None = None,
    feature: str = "",
    provider: str = "anthropic",
) -> LLMResult | None:
    """Pre-flight guard: cancellation -> budget -> proceed.

    Returns None if the call may proceed, or an error LLMResult if blocked.
    Raises asyncio.CancelledError if the token is already cancelled.
    """
    if cancellation_token is not None:
        cancellation_token.check()

    budget_status = check_and_decrement_llm_call_budget()
    if budget_status is not None:
        return LLMResult(
            success=False,
            error=_create_error(
                "budget_exceeded", provider, feature, "LLM call budget exceeded"
            ),
        )

    return None


async def call_with_cancellation(
    coro: Coroutine[Any, Any, Any],
    cancellation_token: CancellationTokenLike | None,
) -> Any:
    """Race a provider call against a cancellation token.

    For non-streaming calls: wraps the coroutine in a task and polls the
    token every 500 ms.  If cancelled mid-flight the task is cancelled too.
    """
    if cancellation_token is None or isinstance(
        cancellation_token, _NoopCancellationToken
    ):
        return await coro

    task = asyncio.create_task(coro)
    done_event = asyncio.Event()

    async def _watch() -> None:
        while not done_event.is_set():
            if cancellation_token.is_cancelled:
                task.cancel()
                return
            await asyncio.sleep(0.5)

    watcher = asyncio.create_task(_watch())
    try:
        return await task
    finally:
        done_event.set()
        watcher.cancel()
        try:
            await watcher
        except asyncio.CancelledError:
            pass
