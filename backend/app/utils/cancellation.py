from __future__ import annotations

import asyncio
from typing import Protocol, runtime_checkable


@runtime_checkable
class CancellationTokenLike(Protocol):
    """Structural interface for cancellation tokens."""

    @property
    def is_cancelled(self) -> bool: ...

    def check(self) -> None:
        """Raise asyncio.CancelledError if cancelled."""
        ...


class CancellationToken:
    """Cooperative cancellation token backed by asyncio.Event."""

    __slots__ = ("_event", "_reason")

    def __init__(self) -> None:
        self._event = asyncio.Event()
        self._reason: str = ""

    @property
    def is_cancelled(self) -> bool:
        return self._event.is_set()

    @property
    def reason(self) -> str:
        return self._reason

    def cancel(self, reason: str = "client_disconnect") -> None:
        if not self._event.is_set():
            self._reason = reason
            self._event.set()

    def check(self) -> None:
        if self._event.is_set():
            raise asyncio.CancelledError(self._reason or "cancelled")


class _NoopCancellationToken(CancellationToken):
    """Singleton token that ignores cancel() — safe default."""

    __slots__ = ()

    def cancel(self, reason: str = "") -> None:
        pass


_NOOP = _NoopCancellationToken()


def noop_token() -> CancellationToken:
    return _NOOP
