from __future__ import annotations

import json
import logging
import httpx
import pytest
from anthropic import APIError as AnthropicAPIError

from app.config import settings
from app.utils import llm
from app.utils.llm_client_registry import reset_registry


@pytest.fixture(autouse=True)
def _propagate_ll_loggers_for_caplog() -> None:
    """secure_logger は propagate=False のため、caplog 取得用に親へ伝播させる。"""
    for name in ("app.utils.llm",):
        logging.getLogger(name).propagate = True
    yield
    for name in ("app.utils.llm",):
        logging.getLogger(name).propagate = False


@pytest.fixture(autouse=True)
def _keys_and_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai-test")
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    monkeypatch.setattr(settings, "model_motivation", "claude-haiku")
    reset_registry()


@pytest.mark.asyncio
async def test_call_llm_with_error_fallback_emits_json_log(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="app.utils.llm")

    _req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")

    async def fail_claude(*_a: object, **_k: object) -> tuple[str, dict[str, int]]:
        raise AnthropicAPIError("connection timeout", _req, body=None)

    async def ok_openai_responses(*_a: object, **_k: object) -> tuple[dict | None, dict | None]:
        return {"ok": True}, {
            "input_tokens": 1,
            "output_tokens": 1,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }

    monkeypatch.setattr(llm, "_call_claude_raw", fail_claude)
    monkeypatch.setattr(llm, "_call_openai_responses", ok_openai_responses)

    result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
    )
    assert result.success and result.data == {"ok": True}

    fallback_lines = [
        r.getMessage()
        for r in caplog.records
        if "llm.fallback.triggered" in r.getMessage()
    ]
    assert len(fallback_lines) == 1
    payload = json.loads(fallback_lines[0])
    for key in (
        "event",
        "feature",
        "primary_model",
        "selected_model",
        "failure_reason",
        "latency_ms",
        "circuit_state",
    ):
        assert key in payload
    assert payload["event"] == "llm.fallback.triggered"
    assert payload["feature"] == "es_review"
    assert payload["selected_model"] == "gpt"


@pytest.mark.asyncio
async def test_call_llm_text_with_error_fallback_emits_json_log(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="app.utils.llm")

    _req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")

    async def fail_claude(*_a: object, **_k: object) -> tuple[str, dict[str, int]]:
        raise AnthropicAPIError("connection timeout", _req, body=None)

    async def ok_openai_text(*_a: object, **_k: object) -> tuple[str, dict[str, int]]:
        return "hello", {"input_tokens": 1, "output_tokens": 1}

    monkeypatch.setattr(llm, "_call_claude_raw", fail_claude)
    monkeypatch.setattr(llm, "_call_openai_compatible_raw_text", ok_openai_text)

    result = await llm.call_llm_text_with_error(
        system_prompt="s",
        user_message="u",
        feature="motivation",
    )
    assert result.success and result.data and result.data.get("text") == "hello"

    fallback_lines = [
        r.getMessage()
        for r in caplog.records
        if "llm.fallback.triggered" in r.getMessage()
    ]
    assert len(fallback_lines) == 1
    payload = json.loads(fallback_lines[0])
    assert payload["event"] == "llm.fallback.triggered"
    assert payload["feature"] == "motivation"


@pytest.mark.asyncio
async def test_call_llm_with_error_disable_fallback_no_emit(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="app.utils.llm")

    _req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")

    async def fail_claude(*_a: object, **_k: object) -> tuple[str, dict[str, int]]:
        raise AnthropicAPIError("connection timeout", _req, body=None)

    monkeypatch.setattr(llm, "_call_claude_raw", fail_claude)

    result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
        disable_fallback=True,
    )
    assert not result.success
    assert not any(
        "llm.fallback.triggered" in r.getMessage() for r in caplog.records
    )
