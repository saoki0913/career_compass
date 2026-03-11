from __future__ import annotations

import pytest

from app.config import settings
from app.utils import qwen_es_review


@pytest.fixture(autouse=True)
def _reset_qwen_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", False)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "")
    monkeypatch.setattr(settings, "qwen_es_review_model", "Qwen/Qwen3-14B")
    monkeypatch.setattr(settings, "qwen_es_review_api_key", "")
    monkeypatch.setattr(settings, "qwen_es_review_timeout_seconds", 120)
    monkeypatch.setattr(settings, "qwen_es_review_adapter_id", "")
    monkeypatch.setattr(qwen_es_review, "_qwen_client", None)


def test_resolve_qwen_es_review_model_name_prefers_adapter_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_model", "Qwen/Qwen3-14B")
    monkeypatch.setattr(settings, "qwen_es_review_adapter_id", "tenant/qwen3-es-review-lora")

    assert qwen_es_review.resolve_qwen_es_review_model_name() == "tenant/qwen3-es-review-lora"


@pytest.mark.asyncio
async def test_call_qwen_es_review_json_returns_disabled_error() -> None:
    result = await qwen_es_review.call_qwen_es_review_json_with_error(
        system_prompt="system",
        user_message="user",
        json_schema={"type": "object", "properties": {"top3": {"type": "array"}}},
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "disabled"
    assert result.error.provider == qwen_es_review.QWEN_PROVIDER_NAME


@pytest.mark.asyncio
async def test_call_qwen_es_review_json_parses_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "Qwen/Qwen3-14B")

    async def fake_completion(**kwargs):
        assert kwargs["json_schema"] is not None
        return '{"top3":[{"category":"結論","issue":"結論が遅い","suggestion":"冒頭で結論を示す"}]}'

    monkeypatch.setattr(qwen_es_review, "_call_qwen_chat_completion", fake_completion)

    result = await qwen_es_review.call_qwen_es_review_json_with_error(
        system_prompt="system",
        user_message="user",
        json_schema={
            "type": "object",
            "properties": {
                "top3": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "category": {"type": "string"},
                            "issue": {"type": "string"},
                            "suggestion": {"type": "string"},
                        },
                    },
                }
            },
        },
    )

    assert result.success is True
    assert result.data == {
        "top3": [
            {
                "category": "結論",
                "issue": "結論が遅い",
                "suggestion": "冒頭で結論を示す",
            }
        ]
    }


@pytest.mark.asyncio
async def test_call_qwen_es_review_text_returns_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "Qwen/Qwen3-14B")

    async def fake_completion(**kwargs):
        assert kwargs["json_schema"] is None
        return "改善案です。"

    monkeypatch.setattr(qwen_es_review, "_call_qwen_chat_completion", fake_completion)

    result = await qwen_es_review.call_qwen_es_review_text_with_error(
        system_prompt="system",
        user_message="user",
    )

    assert result.success is True
    assert result.data == {"text": "改善案です。"}
