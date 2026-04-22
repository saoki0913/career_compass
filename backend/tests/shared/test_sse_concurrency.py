"""Tests for the per-actor SSE concurrency lease helper (D-10)."""
from __future__ import annotations

import asyncio

import pytest

from app.security import sse_concurrency as mod
from app.security.sse_concurrency import (
    SseConcurrencyExceeded,
    SseLease,
    resolve_concurrency_limit,
)


class FakeRedis:
    """In-memory stand-in for ``redis.asyncio`` limited to the ops we use."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    async def expire(self, key: str, ttl: int) -> bool:
        return key in self._store

    async def delete(self, key: str) -> int:
        return 1 if self._store.pop(key, None) is not None else 0

    async def scan_iter(self, match: str, count: int | None = None):
        prefix = match.rstrip("*")
        for key in list(self._store.keys()):
            if key.startswith(prefix):
                yield key

    # Test-only helpers
    def _keys(self) -> list[str]:
        return list(self._store.keys())


@pytest.mark.parametrize(
    "plan,expected",
    [
        ("guest", 1),
        ("free", 2),
        ("standard", 3),
        ("pro", 5),
        ("unknown", 1),  # unknown plan falls back to the strictest tier
    ],
)
def test_resolve_concurrency_limit(plan: str, expected: int) -> None:
    assert resolve_concurrency_limit(plan) == expected


def test_acquire_and_release_roundtrip() -> None:
    client = FakeRedis()

    async def run() -> None:
        async with await SseLease.acquire(
            actor_id="user-1", plan="standard", client=client
        ):
            assert len(client._keys()) == 1
        assert client._keys() == []

    asyncio.run(run())


def test_acquire_rejects_when_limit_reached() -> None:
    client = FakeRedis()

    async def run() -> None:
        async with await SseLease.acquire(
            actor_id="user-1", plan="guest", client=client
        ):
            with pytest.raises(SseConcurrencyExceeded) as exc_info:
                await SseLease.acquire(
                    actor_id="user-1", plan="guest", client=client
                )
            assert exc_info.value.rejection.limit == 1
            assert exc_info.value.rejection.retry_after_seconds > 0
        assert client._keys() == []

    asyncio.run(run())


def test_acquire_allows_other_actor_in_parallel() -> None:
    client = FakeRedis()

    async def run() -> None:
        async with await SseLease.acquire(
            actor_id="user-1", plan="guest", client=client
        ):
            async with await SseLease.acquire(
                actor_id="user-2", plan="guest", client=client
            ):
                assert len(client._keys()) == 2

    asyncio.run(run())


def test_heartbeat_if_due_no_redis_is_noop() -> None:
    async def run() -> None:
        # Fail-open path: no client means no enforcement, no exceptions.
        async with await SseLease.acquire(
            actor_id="user-1", plan="guest", client=None
        ) as lease:
            # simulate concurrency limit bypass — helper returns a noop lease
            assert lease._lease_id == "_noop"
            await lease.heartbeat_if_due()

    asyncio.run(run())


def test_fail_open_when_redis_client_unavailable(monkeypatch) -> None:
    """If Redis is not configured, lease acquisition must not reject users."""

    monkeypatch.setattr(mod, "_get_redis_client", lambda: None)
    mod._reset_redis_client_for_tests()

    async def run() -> None:
        async with await SseLease.acquire(
            actor_id="user-1", plan="standard"
        ) as lease:
            # no-op lease is returned; release() must be a safe no-op too
            assert lease._lease_id == "_noop"

    asyncio.run(run())


def test_release_is_idempotent() -> None:
    client = FakeRedis()

    async def run() -> None:
        lease = await SseLease.acquire(
            actor_id="user-1", plan="standard", client=client
        )
        async with lease:
            assert len(client._keys()) == 1
        # releasing again must not raise or affect other leases
        await lease.release()
        assert client._keys() == []

    asyncio.run(run())


def test_acquire_reopens_after_release() -> None:
    """After a lease is released, the same actor can acquire a new one.

    Protects the handler-wrap pattern used by ``/review/stream``,
    ``/motivation/next-question/stream``, and
    ``/gakuchika/next-question/stream``: a client that finishes one SSE
    stream cleanly must be immediately able to start another.
    """
    client = FakeRedis()

    async def run() -> None:
        # Saturate the guest limit (1) with a first lease.
        first = await SseLease.acquire(
            actor_id="user-1", plan="guest", client=client
        )
        async with first:
            assert len(client._keys()) == 1
            # Second concurrent acquisition must be rejected while first is active.
            with pytest.raises(SseConcurrencyExceeded):
                await SseLease.acquire(
                    actor_id="user-1", plan="guest", client=client
                )
        # First has been released; a new acquisition must now succeed.
        second = await SseLease.acquire(
            actor_id="user-1", plan="guest", client=client
        )
        async with second:
            assert len(client._keys()) == 1
        assert client._keys() == []

    asyncio.run(run())
