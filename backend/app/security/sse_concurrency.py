"""
Per-actor SSE concurrency leases (D-10).

Long-lived SSE streams (ES review, motivation, gakuchika, interview) must be
capped per actor so that a buggy client — or an attacker replaying leaked
credentials — cannot open an unbounded number of streams against expensive
LLM backends. A naive ``INCR``/``DECR`` counter corrupts on crashes or abrupt
client disconnects, so we use a TTL-based lease pattern instead:

1. On stream start, ``SET concurrent_sse:{actor_id}:{lease_id} "1" EX 30``.
2. Count active leases with ``SCAN MATCH concurrent_sse:{actor_id}:*`` and
   reject with 429 when the plan limit is exceeded.
3. While streaming, refresh the lease TTL every 10 seconds (heartbeat).
4. On stream end (success, error, or cancellation), ``DEL`` the lease
   best-effort. If the client disappears without triggering ``finally``, the
   TTL cleans up the lease after ~30 seconds without operator action.

The lease object is fail-open when Redis is not configured — same as the
existing ``app.utils.cache`` pattern. Concurrency limits are defense-in-depth
and should not prevent users from using the product when the cache layer is
unavailable.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass
from typing import Literal, Optional

try:
    import redis.asyncio as redis
except Exception:  # pragma: no cover - redis lib missing in minimal envs
    redis = None  # type: ignore

from app.config import settings
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

CareerPrincipalPlan = Literal["guest", "free", "standard", "pro"]

# Per-plan concurrent SSE cap. Tune in config later if plans evolve.
CONCURRENCY_LIMITS: dict[str, int] = {
    "guest": 1,
    "free": 2,
    "standard": 3,
    "pro": 5,
}

_LEASE_PREFIX = "concurrent_sse"
_LEASE_TTL_SECONDS = 30
_HEARTBEAT_INTERVAL_SECONDS = 10
_SCAN_COUNT_HINT = 32


def _lease_pattern(actor_id: str) -> str:
    return f"{_LEASE_PREFIX}:{actor_id}:*"


def _lease_key(actor_id: str, lease_id: str) -> str:
    return f"{_LEASE_PREFIX}:{actor_id}:{lease_id}"


def resolve_concurrency_limit(plan: str) -> int:
    """Return the concurrent-stream cap for the given plan.

    Unknown plans fall back to the strictest tier (``guest``) so a corrupted
    principal cannot grant itself more streams than a real user.
    """
    return CONCURRENCY_LIMITS.get(plan, CONCURRENCY_LIMITS["guest"])


@dataclass
class SseConcurrencyRejection:
    """Details returned when a lease cannot be acquired."""

    limit: int
    retry_after_seconds: int


class SseConcurrencyExceeded(Exception):
    def __init__(self, rejection: SseConcurrencyRejection):
        super().__init__(
            f"SSE concurrency limit reached (limit={rejection.limit})"
        )
        self.rejection = rejection


class SseLease:
    """Per-stream lease.

    Use as an async context manager::

        async with SseLease.acquire(actor_id=..., plan="standard") as lease:
            async for chunk in stream():
                await lease.heartbeat_if_due()
                yield chunk

    The manager starts a background heartbeat task and drops the lease on
    exit (TTL reclaims it otherwise).
    """

    def __init__(
        self,
        *,
        actor_id: str,
        lease_id: str,
        client,
    ) -> None:
        self._actor_id = actor_id
        self._lease_id = lease_id
        self._client = client
        self._last_heartbeat_monotonic = time.monotonic()
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._released = False

    @classmethod
    async def acquire(
        cls,
        *,
        actor_id: str,
        plan: str,
        client=None,
    ) -> "SseLease":
        effective_client = client if client is not None else _get_redis_client()
        limit = resolve_concurrency_limit(plan)

        if effective_client is None:
            # Fail-open: no Redis, no enforcement. Return a dummy lease so the
            # caller's ``async with`` still works.
            logger.warning(
                "[SSE lease] redis unavailable — concurrency limit not enforced"
            )
            return cls(actor_id=actor_id, lease_id="_noop", client=None)

        active = await _count_active_leases(effective_client, actor_id)
        if active >= limit:
            raise SseConcurrencyExceeded(
                SseConcurrencyRejection(
                    limit=limit,
                    retry_after_seconds=_LEASE_TTL_SECONDS,
                )
            )

        lease_id = secrets.token_urlsafe(16)
        try:
            await effective_client.set(
                _lease_key(actor_id, lease_id),
                "1",
                ex=_LEASE_TTL_SECONDS,
            )
        except Exception as exc:  # pragma: no cover - redis runtime failure
            logger.warning(f"[SSE lease] failed to set lease: {exc}")
            # Fail-open rather than block the user when Redis starts misbehaving
            # mid-flight. The counter shows 0 so the next request is also
            # unaffected.
            return cls(actor_id=actor_id, lease_id="_noop", client=None)

        return cls(actor_id=actor_id, lease_id=lease_id, client=effective_client)

    async def __aenter__(self) -> "SseLease":
        if self._client is not None and self._lease_id != "_noop":
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.release()

    async def heartbeat_if_due(self) -> None:
        """Refresh the lease TTL when the heartbeat interval has elapsed.

        Used by code paths that prefer explicit heartbeats to a background
        task (e.g. to avoid spawning an extra Task on hot streaming paths).
        """
        if self._client is None or self._released:
            return
        now = time.monotonic()
        if now - self._last_heartbeat_monotonic < _HEARTBEAT_INTERVAL_SECONDS:
            return
        self._last_heartbeat_monotonic = now
        try:
            await self._client.expire(
                _lease_key(self._actor_id, self._lease_id),
                _LEASE_TTL_SECONDS,
            )
        except Exception as exc:  # pragma: no cover - redis runtime failure
            logger.warning(f"[SSE lease] heartbeat failed: {exc}")

    async def release(self) -> None:
        if self._released:
            return
        self._released = True
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass
            self._heartbeat_task = None
        if self._client is None or self._lease_id == "_noop":
            return
        try:
            await self._client.delete(_lease_key(self._actor_id, self._lease_id))
        except Exception as exc:  # pragma: no cover - redis runtime failure
            logger.warning(f"[SSE lease] release failed: {exc}")

    async def _heartbeat_loop(self) -> None:
        try:
            while not self._released:
                await asyncio.sleep(_HEARTBEAT_INTERVAL_SECONDS)
                if self._released:
                    return
                self._last_heartbeat_monotonic = time.monotonic()
                try:
                    await self._client.expire(
                        _lease_key(self._actor_id, self._lease_id),
                        _LEASE_TTL_SECONDS,
                    )
                except Exception as exc:  # pragma: no cover
                    logger.warning(f"[SSE lease] heartbeat loop failure: {exc}")
        except asyncio.CancelledError:
            return


async def _count_active_leases(client, actor_id: str) -> int:
    count = 0
    try:
        async for _ in client.scan_iter(
            match=_lease_pattern(actor_id),
            count=_SCAN_COUNT_HINT,
        ):
            count += 1
    except Exception as exc:  # pragma: no cover - redis runtime failure
        logger.warning(f"[SSE lease] scan failed: {exc}")
        return 0
    return count


_redis_client_cache: Optional[object] = None
_redis_client_initialized = False


def _get_redis_client():
    """Lazily create (and cache) a Redis client from ``REDIS_URL``.

    Returns ``None`` when Redis is unconfigured or the ``redis`` package is
    missing. Callers must treat ``None`` as "fail open".
    """
    global _redis_client_cache, _redis_client_initialized
    if _redis_client_initialized:
        return _redis_client_cache
    _redis_client_initialized = True
    if redis is None or not settings.redis_url:
        _redis_client_cache = None
        return None
    try:
        _redis_client_cache = redis.from_url(
            settings.redis_url, decode_responses=True
        )
    except Exception as exc:  # pragma: no cover - redis startup failure
        logger.warning(f"[SSE lease] redis init failed: {exc}")
        _redis_client_cache = None
    return _redis_client_cache


def _reset_redis_client_for_tests() -> None:
    """Test-only hook to force the client cache to re-read settings."""
    global _redis_client_cache, _redis_client_initialized
    _redis_client_cache = None
    _redis_client_initialized = False
