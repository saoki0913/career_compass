from __future__ import annotations

from app.utils.llm_providers import _augment_system_prompt_for_provider_json, _create_error


def test_json_augmentation_returns_unchanged_for_openai() -> None:
    result = _augment_system_prompt_for_provider_json(
        "openai", "base", response_format="json_object", json_schema=None
    )
    assert result == "base"


def test_json_augmentation_appends_strict_note_for_google() -> None:
    result = _augment_system_prompt_for_provider_json(
        "google", "base", response_format="json_object", json_schema=None
    )
    assert "base" in result
    assert "JSON" in result


def test_json_augmentation_returns_unchanged_for_anthropic() -> None:
    result = _augment_system_prompt_for_provider_json(
        "anthropic", "base", response_format="json_object", json_schema=None
    )
    assert result == "base"


def test_create_error_budget_exceeded() -> None:
    error = _create_error("budget_exceeded", "anthropic", "es_review")
    assert error.error_type == "budget_exceeded"
    assert "上限" in error.message
    assert error.provider == "anthropic"
    assert error.feature == "es_review"
