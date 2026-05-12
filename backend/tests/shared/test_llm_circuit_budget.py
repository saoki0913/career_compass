from __future__ import annotations

import httpx
import pytest
from anthropic import APIError as AnthropicAPIError

from app.config import settings
from app.utils import llm, llm_usage_cost
from app.utils.llm_client_registry import reset_registry


@pytest.fixture(autouse=True)
def _keys_and_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test")
    monkeypatch.setattr(settings, "openai_api_key", "sk-oai-test")
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    monkeypatch.setattr(settings, "model_motivation", "claude-haiku")
    monkeypatch.setattr(settings, "llm_usage_cost_log", False)
    monkeypatch.setattr(settings, "llm_usage_cost_debug_log", False)
    parse_reg = reset_registry()
    llm_usage_cost.reset_request_llm_cost_summary()


@pytest.mark.asyncio
async def test_structured_call_skips_open_primary_circuit_and_uses_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reg = reset_registry()
    for _ in range(reg.anthropic_circuit.threshold):
        reg.anthropic_circuit.record_failure()

    async def fail_if_primary_called(*_args: object, **_kwargs: object) -> tuple[str, dict]:
        raise AssertionError("primary provider should be skipped while circuit is open")

    async def ok_openai_responses(*_args: object, **_kwargs: object) -> tuple[dict, dict]:
        return {"ok": True}, {"input_tokens": 3, "output_tokens": 2}

    monkeypatch.setattr(llm, "_call_claude_raw", fail_if_primary_called)
    monkeypatch.setattr(llm, "_call_openai_responses", ok_openai_responses)

    result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
    )

    assert result.success is True
    assert result.data == {"ok": True}
    assert reg.anthropic_circuit.is_open() is True
    assert reg.openai_circuit.failures == 0


@pytest.mark.asyncio
async def test_provider_api_errors_record_failure_but_parse_errors_do_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reg = reset_registry()
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")

    async def provider_failure(*_args: object, **_kwargs: object) -> tuple[str, dict]:
        raise AnthropicAPIError("connection timeout", request, body=None)

    monkeypatch.setattr(llm, "_call_claude_raw", provider_failure)

    provider_result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
        disable_fallback=True,
    )

    assert provider_result.success is False
    assert reg.anthropic_circuit.failures == 1

    parse_reg = reset_registry()

    async def malformed_response(*_args: object, **_kwargs: object) -> tuple[str, dict]:
        return "{not json", {"input_tokens": 1, "output_tokens": 1}

    monkeypatch.setattr(llm, "_call_claude_raw", malformed_response)

    parse_result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
        disable_fallback=True,
    )

    assert parse_result.success is False
    assert parse_reg.anthropic_circuit.failures == 0


@pytest.mark.asyncio
async def test_text_provider_success_resets_prior_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reg = reset_registry()
    reg.anthropic_circuit.record_failure()

    async def ok_text(*_args: object, **_kwargs: object) -> tuple[str, dict]:
        return "hello", {"input_tokens": 1, "output_tokens": 1}

    monkeypatch.setattr(llm, "_call_claude_raw", ok_text)

    result = await llm.call_llm_text_with_error(
        system_prompt="s",
        user_message="u",
        feature="motivation",
        disable_fallback=True,
    )

    assert result.success is True
    assert reg.anthropic_circuit.failures == 0


@pytest.mark.asyncio
async def test_request_llm_call_telemetry_counts_structured_and_text_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "llm_usage_cost_log", True)
    llm_usage_cost.reset_request_llm_cost_summary()

    async def ok_json(*_args: object, **_kwargs: object) -> tuple[str, dict]:
        return '{"ok": true}', {"input_tokens": 2, "output_tokens": 1}

    async def ok_text(*_args: object, **_kwargs: object) -> tuple[str, dict]:
        return "hello", {"input_tokens": 3, "output_tokens": 1}

    monkeypatch.setattr(llm, "_call_claude_raw", ok_json)
    structured = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
        disable_fallback=True,
    )
    monkeypatch.setattr(llm, "_call_claude_raw", ok_text)
    text = await llm.call_llm_text_with_error(
        system_prompt="s",
        user_message="u",
        feature="motivation",
        disable_fallback=True,
    )

    summary = llm_usage_cost.consume_request_llm_cost_summary("mixed")

    assert structured.success is True
    assert text.success is True
    assert summary is not None
    assert summary["llm_call_count"] == 2
    assert summary["llm_call_counts_by_kind"] == {"structured": 1, "text": 1}


@pytest.mark.asyncio
async def test_streaming_skips_open_circuit_and_falls_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When Anthropic circuit is open, call_llm_streaming falls back to call_llm_with_error."""
    from app.utils import llm_streaming

    reg = reset_registry()
    for _ in range(reg.anthropic_circuit.threshold):
        reg.anthropic_circuit.record_failure()

    async def fail_if_stream_called(*_args: object, **_kwargs: object):
        raise AssertionError("streaming should not be called when circuit is open")
        yield

    async def ok_openai_responses(*_args: object, **_kwargs: object) -> tuple[dict, dict]:
        return {"ok": True}, {"input_tokens": 3, "output_tokens": 2}

    monkeypatch.setattr(llm, "_call_claude_raw_stream", fail_if_stream_called)
    monkeypatch.setattr(llm, "_call_openai_responses", ok_openai_responses)

    result = await llm_streaming.call_llm_streaming(
        system_prompt="s",
        user_message="u",
        feature="es_review",
    )

    assert result.success is True
    assert result.data == {"ok": True}


@pytest.mark.asyncio
async def test_streaming_fields_skips_open_circuit_and_falls_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When Anthropic circuit is open, call_llm_streaming_fields falls back."""
    from app.utils import llm_streaming

    reg = reset_registry()
    for _ in range(reg.anthropic_circuit.threshold):
        reg.anthropic_circuit.record_failure()

    async def fail_if_stream_called(*_args: object, **_kwargs: object):
        raise AssertionError("streaming should not be called when circuit is open")
        yield

    async def ok_openai_responses(*_args: object, **_kwargs: object) -> tuple[dict, dict]:
        return {"ok": True}, {"input_tokens": 3, "output_tokens": 2}

    monkeypatch.setattr(llm, "_call_claude_raw_stream", fail_if_stream_called)
    monkeypatch.setattr(llm, "_call_openai_responses", ok_openai_responses)

    events = []
    async for event in llm_streaming.call_llm_streaming_fields(
        system_prompt="s",
        user_message="u",
        feature="es_review",
        response_format="json_object",
    ):
        events.append(event)

    assert len(events) == 1
    assert events[0].type == "complete"
    assert events[0].result.success is True
    assert events[0].result.data == {"ok": True}
