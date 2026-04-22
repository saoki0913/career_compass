from __future__ import annotations

import pytest

from app.config import settings
from app.utils.llm_client_registry import get_circuit_breaker, reset_registry
from app.utils.llm_model_routing import (
    _capability_class,
    _feature_cross_fallback_model,
)


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("claude-sonnet", "sonnet_tier"),
        ("claude-sonnet-4-6", "sonnet_tier"),
        ("claude-haiku", "haiku_tier"),
        ("claude-haiku-4-5-20251001", "haiku_tier"),
        ("gpt", "gpt5_tier"),
        ("gpt-5.4", "gpt5_tier"),
        ("gpt-5", "gpt5_tier"),
        ("gpt-mini", "gpt_mini_tier"),
        ("gpt-5.4-mini", "gpt_mini_tier"),
        ("gpt-nano", None),
        ("gemini", None),
        ("", None),
        ("unknown-model", None),
    ],
)
def test_capability_class(model: str, expected: str | None) -> None:
    assert _capability_class(model) == expected


def test_feature_cross_fallback_es_review_anthropic_to_gpt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai")
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    reset_registry()
    assert _feature_cross_fallback_model("es_review", "anthropic") == "gpt"


def test_feature_cross_fallback_interview_plan_openai_to_claude_sonnet(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai")
    monkeypatch.setattr(settings, "model_interview_plan", "gpt")
    reset_registry()
    assert _feature_cross_fallback_model("interview_plan", "openai") == "claude-sonnet"


def test_feature_cross_fallback_interview_anthropic_to_gpt_mini(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai")
    monkeypatch.setattr(settings, "model_interview", "claude-haiku")
    reset_registry()
    assert _feature_cross_fallback_model("interview", "anthropic") == "gpt-mini"


def test_feature_cross_fallback_gakuchika_openai_to_claude_haiku(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai")
    monkeypatch.setattr(settings, "model_gakuchika", "gpt-mini")
    reset_registry()
    assert _feature_cross_fallback_model("gakuchika", "openai") == "claude-haiku"


def test_feature_cross_fallback_no_openai_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    reset_registry()
    assert _feature_cross_fallback_model("es_review", "anthropic") is None


def test_feature_cross_fallback_openai_circuit_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai")
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    reset_registry()
    cb = get_circuit_breaker("openai")
    for _ in range(3):
        cb.record_failure()
    assert _feature_cross_fallback_model("es_review", "anthropic") is None


def test_feature_cross_fallback_unknown_feature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai")
    reset_registry()
    assert _feature_cross_fallback_model("not_a_real_feature_key", "anthropic") is None
