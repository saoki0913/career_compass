from __future__ import annotations

import asyncio

import pytest

from app.utils.cancellation import (
    CancellationToken,
    CancellationTokenLike,
    _NoopCancellationToken,
    noop_token,
)


def test_token_starts_not_cancelled():
    token = CancellationToken()
    assert not token.is_cancelled
    assert token.reason == ""


def test_cancel_sets_is_cancelled():
    token = CancellationToken()
    token.cancel("test_reason")
    assert token.is_cancelled
    assert token.reason == "test_reason"


def test_cancel_is_idempotent():
    token = CancellationToken()
    token.cancel("first")
    token.cancel("second")
    assert token.reason == "first"


def test_check_raises_when_cancelled():
    token = CancellationToken()
    token.cancel()
    with pytest.raises(asyncio.CancelledError):
        token.check()


def test_check_passes_when_not_cancelled():
    token = CancellationToken()
    token.check()


def test_noop_cancel_is_ignored():
    token = noop_token()
    token.cancel("should be ignored")
    assert not token.is_cancelled


def test_noop_check_never_raises():
    token = noop_token()
    token.check()


def test_noop_is_singleton():
    assert noop_token() is noop_token()


def test_satisfies_protocol():
    assert isinstance(CancellationToken(), CancellationTokenLike)
    assert isinstance(noop_token(), CancellationTokenLike)


def test_noop_is_subclass():
    assert isinstance(noop_token(), _NoopCancellationToken)
    assert isinstance(noop_token(), CancellationToken)
