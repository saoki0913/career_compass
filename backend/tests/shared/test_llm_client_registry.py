from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.utils import llm
from app.utils.llm_client_registry import CircuitBreaker, reset_registry


def test_circuit_breaker_open_emits_once(monkeypatch: pytest.MonkeyPatch) -> None:
    emitted: list[str] = []

    def capture_emit(self: CircuitBreaker, event: str) -> None:
        emitted.append(event)

    monkeypatch.setattr(CircuitBreaker, "_emit", capture_emit)
    cb = CircuitBreaker(provider="anthropic", threshold=3)
    for _ in range(3):
        cb.record_failure()
    assert emitted.count("llm.circuit.open") == 1


def test_circuit_breaker_record_success_emits_reset(monkeypatch: pytest.MonkeyPatch) -> None:
    emitted: list[str] = []

    def capture_emit(self: CircuitBreaker, event: str) -> None:
        emitted.append(event)

    monkeypatch.setattr(CircuitBreaker, "_emit", capture_emit)
    cb = CircuitBreaker(provider="anthropic", threshold=3)
    for _ in range(3):
        cb.record_failure()
    emitted.clear()
    cb.record_success()
    assert emitted.count("llm.circuit.reset") == 1


def test_circuit_breaker_timeout_reset_via_is_open(monkeypatch: pytest.MonkeyPatch) -> None:
    emitted: list[str] = []

    def capture_emit(self: CircuitBreaker, event: str) -> None:
        emitted.append(event)

    monkeypatch.setattr(CircuitBreaker, "_emit", capture_emit)
    cb = CircuitBreaker(
        provider="openai",
        threshold=2,
        reset_timeout=timedelta(seconds=1),
    )
    cb.record_failure()
    cb.record_failure()
    assert cb.is_open() is True
    emitted.clear()
    cb.last_failure = datetime.now() - timedelta(minutes=10)
    assert cb.is_open() is False
    assert emitted.count("llm.circuit.reset") == 1


def test_circuit_breaker_reset_when_never_open_no_log(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitted: list[str] = []

    def capture_emit(self: CircuitBreaker, event: str) -> None:
        emitted.append(event)

    monkeypatch.setattr(CircuitBreaker, "_emit", capture_emit)
    cb = CircuitBreaker(provider="anthropic")
    cb.reset()
    assert not emitted


def test_llm_module_has_no_module_local_circuits() -> None:
    assert not hasattr(llm, "_anthropic_circuit")
    assert not hasattr(llm, "_openai_circuit")


def test_registry_default_circuits_have_provider() -> None:
    reg = reset_registry()
    assert reg.anthropic_circuit.provider == "anthropic"
    assert reg.openai_circuit.provider == "openai"
