from tests.es_review.integration.test_live_es_review_provider_report import (
    _blocking_failures_enabled,
)


def test_blocking_failures_enabled_for_smoke_by_default() -> None:
    assert _blocking_failures_enabled("smoke") is True


def test_blocking_failures_disabled_for_extended_by_default(monkeypatch) -> None:
    monkeypatch.delenv("LIVE_ES_REVIEW_COLLECT_ONLY", raising=False)
    monkeypatch.delenv("LIVE_ES_REVIEW_BLOCKING_FAILURES", raising=False)

    assert _blocking_failures_enabled("extended") is False


def test_explicit_blocking_override_wins(monkeypatch) -> None:
    monkeypatch.setenv("LIVE_ES_REVIEW_BLOCKING_FAILURES", "1")

    assert _blocking_failures_enabled("extended") is True
