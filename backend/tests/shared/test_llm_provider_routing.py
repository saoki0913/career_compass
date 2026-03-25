from __future__ import annotations

import logging

import httpx
import pytest
from openai import APIError as OpenAIAPIError

from app.config import settings
from app.utils import llm


@pytest.fixture(autouse=True)
def _reset_provider_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "gpt_model", "gpt-5.4")
    monkeypatch.setattr(settings, "gpt_fast_model", "gpt-5.4-mini")
    monkeypatch.setattr(settings, "gpt_nano_model", "gpt-5.4-nano")
    monkeypatch.setattr(settings, "low_cost_review_model", "gpt-5.4-mini")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.1-pro-preview")
    monkeypatch.setattr(settings, "openai_price_gpt_5_4_mini_input_per_mtok_usd", None)
    monkeypatch.setattr(settings, "openai_price_gpt_5_4_mini_cached_input_per_mtok_usd", None)
    monkeypatch.setattr(settings, "openai_price_gpt_5_4_mini_output_per_mtok_usd", None)
    monkeypatch.setattr(settings, "openai_price_gpt_5_4_nano_input_per_mtok_usd", None)
    monkeypatch.setattr(settings, "openai_price_gpt_5_4_nano_cached_input_per_mtok_usd", None)
    monkeypatch.setattr(settings, "openai_price_gpt_5_4_nano_output_per_mtok_usd", None)
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    monkeypatch.setattr(llm, "_model_config", None)
    monkeypatch.setattr(llm, "_openai_client", None)
    monkeypatch.setattr(llm, "_openai_client_rag", None)
    monkeypatch.setattr(llm, "_google_http_client", None)
    monkeypatch.setattr(llm, "_google_http_client_rag", None)


def test_resolve_model_target_supports_explicit_provider_models() -> None:
    assert llm._resolve_model_target("es_review", "gpt-5.4").provider == "openai"
    assert llm._resolve_model_target("es_review", "gemini-3.1-pro-preview").provider == "google"


def test_resolve_model_target_rejects_removed_cohere_model() -> None:
    with pytest.raises(ValueError, match="Unsupported model"):
        llm._resolve_model_target("es_review", "command-a-03-2025")


def test_resolve_model_target_gpt_nano_alias() -> None:
    target = llm._resolve_model_target("selection_schedule", "gpt-nano")
    assert target.provider == "openai"
    assert target.actual_model == settings.gpt_nano_model


def test_estimate_llm_usage_cost_gpt_5_4_nano_catalog() -> None:
    usage = {
        "input_tokens": 1_000_000,
        "output_tokens": 100_000,
        "reasoning_tokens": 0,
        "cached_input_tokens": 0,
    }
    est = llm.estimate_llm_usage_cost_usd("gpt-5.4-nano", usage)
    assert est is not None
    assert abs(est - (0.20 + 0.125)) < 1e-9


def test_resolve_feature_model_metadata_uses_current_feature_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "model_es_review", "gemini-3.1-pro-preview")
    monkeypatch.setattr(llm, "_model_config", None)

    provider, model_name = llm.resolve_feature_model_metadata("es_review")

    assert provider == "google"
    assert model_name == "gemini-3.1-pro-preview"


def test_build_chat_response_format_maps_provider_capabilities() -> None:
    schema = {
        "type": "object",
        "properties": {"answer": {"type": "string"}},
        "required": ["answer"],
    }

    assert llm._build_chat_response_format("openai", "json_schema", schema) == {
        "type": "json_schema",
        "json_schema": {
            "name": "response",
            "schema": schema,
            "strict": True,
        },
    }


def test_build_chat_response_format_preserves_explicit_openai_schema_name() -> None:
    schema = {
        "name": "es_review_response",
        "schema": {
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
        },
    }

    assert llm._build_chat_response_format("openai", "json_schema", schema) == {
        "type": "json_schema",
        "json_schema": {
            "name": "es_review_response",
            "schema": schema["schema"],
            "strict": True,
        },
    }


def test_build_google_response_schema_drops_unsupported_keys() -> None:
    schema = {
        "type": "object",
        "properties": {
            "ok": {
                "type": "boolean",
                "description": "success flag",
                "additionalProperties": False,
            }
        },
        "required": ["ok"],
        "additionalProperties": False,
    }

    assert llm._build_google_response_schema(schema) == {
        "type": "object",
        "properties": {
            "ok": {
                "type": "boolean",
                "description": "success flag",
            }
        },
        "required": ["ok"],
    }


def test_estimate_llm_usage_cost_usd_supports_catalog_and_reasoning_tokens() -> None:
    usage = {
        "input_tokens": 1_000_000,
        "output_tokens": 100_000,
        "reasoning_tokens": 50_000,
        "cached_input_tokens": 200_000,
    }

    estimate = llm.estimate_llm_usage_cost_usd("gpt-5.4-mini", usage)

    assert estimate == pytest.approx(1.29)


def test_estimate_llm_usage_cost_usd_maps_haiku_models_to_catalog() -> None:
    usage = {
        "input_tokens": 1_000_000,
        "output_tokens": 100_000,
        "reasoning_tokens": 0,
        "cached_input_tokens": 0,
    }
    est = llm.estimate_llm_usage_cost_usd("claude-haiku-4-5-20251001", usage)
    assert est == pytest.approx(1.5)


def test_extract_gemini_usage_summary_normalizes_usage_metadata() -> None:
    payload = {
        "usageMetadata": {
            "promptTokenCount": 120,
            "candidatesTokenCount": 45,
            "thoughtsTokenCount": 7,
            "cachedContentTokenCount": 20,
        }
    }

    assert llm._extract_gemini_usage_summary(payload) == {
        "input_tokens": 120,
        "output_tokens": 45,
        "reasoning_tokens": 7,
        "cached_input_tokens": 20,
    }


def test_log_llm_cost_emits_when_flag_on_regardless_of_environment(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "llm_usage_cost_log", True)
    monkeypatch.setattr(settings, "llm_usage_cost_debug_log", True)
    monkeypatch.setenv("ENVIRONMENT", "production")
    llm.logger.addHandler(caplog.handler)
    try:
        with caplog.at_level(logging.INFO, logger="app.utils.llm"):
            llm.log_llm_cost_event(
                feature="es_review",
                provider="openai",
                resolved_model="gpt-5.4-mini",
                call_kind="structured",
                usage={"input_tokens": 100, "output_tokens": 20},
            )
    finally:
        llm.logger.removeHandler(caplog.handler)

    assert "event=llm_cost" in caplog.text
    assert "scope=call" in caplog.text


def test_log_llm_cost_includes_estimate_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(settings, "llm_usage_cost_log", True)
    monkeypatch.setattr(settings, "llm_usage_cost_debug_log", True)
    monkeypatch.setattr(settings, "llm_cost_usd_to_jpy_rate", 160.0)
    llm.logger.addHandler(caplog.handler)
    try:
        with caplog.at_level(logging.INFO, logger="app.utils.llm"):
            llm.log_llm_cost_event(
                feature="company_info",
                provider="openai",
                resolved_model="gpt-5.4-mini",
                call_kind="structured",
                usage={
                    "input_tokens": 1_000_000,
                    "output_tokens": 100_000,
                    "reasoning_tokens": 50_000,
                    "cached_input_tokens": 200_000,
                },
                trace_id="trace-test",
            )
    finally:
        llm.logger.removeHandler(caplog.handler)

    assert "event=llm_cost" in caplog.text
    assert "scope=call" in caplog.text
    assert "feature=company_info" in caplog.text
    assert "resolved_model=gpt-5.4-mini" in caplog.text
    assert "usage_status=ok" in caplog.text
    assert "est_usd=1.290000" in caplog.text
    assert "est_jpy=206.40" in caplog.text
    assert "trace_id=trace-test" in caplog.text


def test_log_selection_schedule_request_llm_cost_unified_format(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(settings, "llm_usage_cost_log", True)
    monkeypatch.setattr(settings, "llm_usage_cost_debug_log", True)
    monkeypatch.setattr(settings, "llm_cost_usd_to_jpy_rate", 100.0)
    llm.logger.addHandler(caplog.handler)
    try:
        with caplog.at_level(logging.INFO, logger="app.utils.llm"):
            llm.log_selection_schedule_request_llm_cost(
                feature="company_info",
                source_url="https://example.com/" + "x" * 200,
                aggregated_usage={
                    "input_tokens": 1000,
                    "output_tokens": 100,
                    "reasoning_tokens": 0,
                    "cached_input_tokens": 0,
                },
                resolved_models=["gpt-5.4-mini"],
            )
    finally:
        llm.logger.removeHandler(caplog.handler)
    assert "[選考スケジュール抽出]" in caplog.text
    assert "event=llm_cost" in caplog.text
    assert "scope=request" in caplog.text
    assert "call_kind=selection_schedule_request" in caplog.text
    assert "provider=mixed" in caplog.text
    assert "source_url=https://example.com/" in caplog.text
    assert "est_usd=" in caplog.text
    assert "est_jpy=" in caplog.text


def test_llm_logger_uses_secure_logger_configuration() -> None:
    assert llm.logger.handlers
    assert llm.logger.propagate is False


@pytest.mark.asyncio
async def test_call_llm_with_error_routes_google_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "google_api_key", "test-google-key")

    seen: dict[str, object] = {}

    async def fake_google_generate_content(**kwargs):
        seen.update(kwargs)
        return '{"ok": true}', {}

    monkeypatch.setattr(llm, "_call_google_generate_content", fake_google_generate_content)

    result = await llm.call_llm_with_error(
        system_prompt="system",
        user_message="user",
        model="google",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}},
        disable_fallback=True,
    )

    assert result.success is True
    assert result.data == {"ok": True}
    assert seen["model"] == "gemini-3.1-pro-preview"
    assert seen["response_format"] == "json_schema"


@pytest.mark.asyncio
async def test_call_llm_with_error_uses_openai_responses_api_for_es_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    seen: dict[str, object] = {}

    async def fake_call_openai_responses(*args, **kwargs):
        seen.update(kwargs)
        seen["model"] = args[5]
        return {"ok": True}, {
            "input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }

    async def fail_chat_completions(**kwargs):
        raise AssertionError("chat completions should not be used for es_review")

    monkeypatch.setattr(llm, "_call_openai_responses", fake_call_openai_responses)
    monkeypatch.setattr(llm, "_call_openai_compatible", fail_chat_completions)

    result = await llm.call_llm_with_error(
        system_prompt="system",
        user_message="user",
        model="gpt",
        feature="es_review",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
        disable_fallback=True,
    )

    assert result.success is True
    assert result.data == {"ok": True}
    assert seen["response_format"] == "json_schema"
    assert seen["model"] == "gpt-5.4"


@pytest.mark.asyncio
async def test_call_openai_responses_omits_reasoning_for_es_review_json_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    seen: dict[str, object] = {}

    class FakeResponses:
        async def create(self, **kwargs):
            seen.update(kwargs)
            return type(
                "FakeResponse",
                (),
                {
                    "output_parsed": {"ok": True},
                    "usage": {
                        "input_tokens": 120,
                        "output_tokens": 30,
                        "input_tokens_details": {"cached_tokens": 20},
                        "output_tokens_details": {"reasoning_tokens": 5},
                    },
                },
            )()

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_openai_client", fake_get_openai_client)

    result, usage = await llm._call_openai_responses(
        system_prompt="system",
        user_message="user",
        messages=None,
        max_tokens=120,
        temperature=0.2,
        model="gpt-5.4",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
        feature="es_review",
    )

    assert result == {"ok": True}
    assert usage == {
        "input_tokens": 120,
        "output_tokens": 30,
        "reasoning_tokens": 5,
        "cached_input_tokens": 20,
    }
    assert "reasoning" not in seen


@pytest.mark.asyncio
async def test_call_openai_responses_omits_reasoning_for_es_review_gpt_5_4_mini_json_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    seen: dict[str, object] = {}

    class FakeResponses:
        async def create(self, **kwargs):
            seen.update(kwargs)
            return type(
                "FakeResponse",
                (),
                {
                    "output_parsed": {"ok": True},
                    "usage": {
                        "input_tokens": 10,
                        "output_tokens": 5,
                        "input_tokens_details": {"cached_tokens": 0},
                        "output_tokens_details": {"reasoning_tokens": 0},
                    },
                },
            )()

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_openai_client", fake_get_openai_client)

    result, _ = await llm._call_openai_responses(
        system_prompt="system",
        user_message="user",
        messages=None,
        max_tokens=120,
        temperature=0.2,
        model="gpt-5.4-mini",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
        feature="es_review",
    )

    assert result == {"ok": True}
    assert "reasoning" not in seen


def test_openai_reasoning_effort_plain_text_rewrite_is_none() -> None:
    assert (
        llm._openai_reasoning_effort(
            feature="es_review",
            response_format="text",
            model="gpt-5.4-mini",
            plain_text_rewrite=True,
        )
        == "none"
    )


def test_openai_reasoning_effort_json_schema_is_none_for_es_review() -> None:
    assert (
        llm._openai_reasoning_effort(
            feature="es_review",
            response_format="json_schema",
            model="gpt-5.4-mini",
            plain_text_rewrite=False,
        )
        is None
    )


@pytest.mark.asyncio
async def test_call_llm_text_with_error_uses_chat_completions_for_openai_es_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    seen: dict[str, object] = {}
    expected_usage = {
        "input_tokens": 32,
        "output_tokens": 18,
        "reasoning_tokens": 0,
        "cached_input_tokens": 9,
    }

    async def fail_responses(*args, **kwargs):
        raise AssertionError("Responses API text path should not be used for es_review rewrite")

    async def fake_chat_raw_text(**kwargs):
        seen.update(kwargs)
        return "改訂案本文", expected_usage

    monkeypatch.setattr(llm, "_call_openai_responses_raw_text", fail_responses)
    monkeypatch.setattr(llm, "_call_openai_compatible_raw_text", fake_chat_raw_text)

    result = await llm.call_llm_text_with_error(
        system_prompt="system",
        user_message="user",
        model="gpt-5.4-mini",
        feature="es_review",
        disable_fallback=True,
    )

    assert result.success is True
    assert result.data == {"text": "改訂案本文"}
    assert result.usage == expected_usage
    assert seen["provider"] == "openai"
    assert seen["model"] == "gpt-5.4-mini"


@pytest.mark.asyncio
async def test_call_openai_responses_raw_text_sets_reasoning_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    seen: dict[str, object] = {}

    class FakeResponses:
        async def create(self, **kwargs):
            seen.update(kwargs)
            return type(
                "FakeResponse",
                (),
                {
                    "output_text": "改訂案本文",
                    "output": [],
                    "status": "completed",
                    "usage": {},
                },
            )()

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_openai_client", fake_get_openai_client)

    text, usage = await llm._call_openai_responses_raw_text(
        system_prompt="system",
        user_message="user",
        messages=None,
        max_tokens=400,
        temperature=0.2,
        model="gpt-5.4-mini",
        feature="es_review",
    )

    assert text == "改訂案本文"
    assert seen["reasoning"] == {"effort": "none"}
    assert usage is not None


@pytest.mark.asyncio
async def test_call_openai_compatible_raw_text_sets_medium_verbosity_and_cache_key_for_es_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    seen: dict[str, object] = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            seen.update(kwargs)
            return type(
                "FakeResponse",
                (),
                {
                    "choices": [type("Choice", (), {"message": type("Msg", (), {"content": "改稿文"})()})()],
                    "usage": {
                        "prompt_tokens": 22,
                        "completion_tokens": 14,
                        "prompt_tokens_details": {"cached_tokens": 8},
                        "completion_tokens_details": {"reasoning_tokens": 0},
                    },
                },
            )()

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    async def fake_get_openai_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_openai_client", fake_get_openai_client)

    text, usage = await llm._call_openai_compatible_raw_text(
        provider="openai",
        system_prompt="system",
        user_message="user",
        messages=None,
        max_tokens=400,
        temperature=0.2,
        model="gpt-5.4-mini",
        feature="es_review",
    )

    assert text == "改稿文"
    assert seen["verbosity"] == "medium"
    assert seen["prompt_cache_key"] == "es_review:text:gpt-5.4-mini"
    assert usage == {
        "input_tokens": 22,
        "output_tokens": 14,
        "reasoning_tokens": 0,
        "cached_input_tokens": 8,
    }


@pytest.mark.asyncio
async def test_call_openai_responses_retries_once_when_incomplete_max_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    attempts: list[int] = []

    class Incomplete:
        output_parsed = None
        output_text = ""
        output: list = []
        status = "incomplete"

        class incomplete_details:
            reason = "max_output_tokens"

        usage = {
            "input_tokens": 1,
            "output_tokens": 0,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        }

    class Complete:
        output_parsed = {"ok": True}
        output_text = ""
        output: list = []
        status = "completed"
        usage = {
            "input_tokens": 2,
            "output_tokens": 1,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        }

    class FakeResponses:
        async def create(self, **kwargs):
            attempts.append(int(kwargs.get("max_output_tokens", 0)))
            if len(attempts) == 1:
                return Incomplete()
            return Complete()

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_openai_client", fake_get_openai_client)

    result, _ = await llm._call_openai_responses(
        system_prompt="system",
        user_message="user",
        messages=None,
        max_tokens=500,
        temperature=0.2,
        model="gpt-5.4",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
        feature="es_review",
    )

    assert result == {"ok": True}
    assert attempts == [500, 2048]


@pytest.mark.asyncio
async def test_call_openai_responses_raw_text_retries_once_when_incomplete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")

    attempts: list[int] = []

    class Incomplete:
        output_text = ""
        output: list = []
        status = "incomplete"

        class incomplete_details:
            reason = "max_output_tokens"

        usage = {}

    class Complete:
        output_text = "retry後の本文"
        output: list = []
        status = "completed"
        usage = {}

    class FakeResponses:
        async def create(self, **kwargs):
            attempts.append(int(kwargs.get("max_output_tokens", 0)))
            if len(attempts) == 1:
                return Incomplete()
            return Complete()

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_openai_client", fake_get_openai_client)

    text, _ = await llm._call_openai_responses_raw_text(
        system_prompt="system",
        user_message="user",
        messages=None,
        max_tokens=300,
        temperature=0.2,
        model="gpt-5.4-mini",
        feature="es_review",
    )

    assert text == "retry後の本文"
    assert attempts == [300, 2048]


@pytest.mark.asyncio
async def test_call_google_generate_content_uses_response_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "google_api_key", "test-google-key")
    monkeypatch.setattr(settings, "google_base_url", "https://example.test")

    seen: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": '{"ok": true}'}]
                        }
                    }
                ]
            }

    class FakeClient:
        async def post(self, url, *, params=None, headers=None, json=None):
            seen["url"] = url
            seen["params"] = params
            seen["headers"] = headers
            seen["json"] = json
            return FakeResponse()

    async def fake_get_google_http_client(*, for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(llm, "get_google_http_client", fake_get_google_http_client)

    text, payload = await llm._call_google_generate_content(
        system_prompt="有効なJSONのみ返すこと。",
        user_message="ok が true のJSONを返してください。",
        messages=None,
        max_tokens=120,
        temperature=0.3,
        model="gemini-3.1-pro-preview",
        response_format="json_schema",
        json_schema={
            "type": "object",
            "properties": {"ok": {"type": "boolean"}},
            "required": ["ok"],
            "additionalProperties": False,
        },
        feature="es_review",
    )

    generation_config = seen["json"]["generationConfig"]
    assert generation_config["responseMimeType"] == "application/json"
    assert "responseSchema" in generation_config
    assert "responseJsonSchema" not in generation_config
    assert "additionalProperties" not in generation_config["responseSchema"]
    assert generation_config["temperature"] == 0.1
    assert generation_config["thinkingConfig"] == {
        "thinkingLevel": "LOW",
        "includeThoughts": False,
    }
    assert text == '{"ok": true}'
    assert payload["candidates"][0]["content"]["parts"][0]["text"] == '{"ok": true}'


@pytest.mark.asyncio
async def test_call_llm_with_error_repairs_google_partial_json_with_same_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "google_api_key", "test-google-key")
    monkeypatch.setattr(settings, "openai_api_key", "")

    # 初回パース失敗後は max_tokens 段階リトライなしで同一プロバイダー修復のみ（OpenAI キー無し）
    responses = iter(
        [
            ('{"ok":', {}),
            ('{"ok": true}', {}),
        ]
    )

    async def fake_google_generate_content(**kwargs):
        return next(responses)

    monkeypatch.setattr(llm, "_call_google_generate_content", fake_google_generate_content)

    result = await llm.call_llm_with_error(
        system_prompt="system",
        user_message="user",
        model="gemini-3.1-pro-preview",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
        retry_on_parse=True,
        disable_fallback=True,
    )

    assert result.success is True
    assert result.data == {"ok": True}


def test_augment_system_prompt_for_provider_text_keeps_non_es_review_prompt_unchanged() -> None:
    assert (
        llm._augment_system_prompt_for_provider_text(
            "openai",
            "system",
            feature="motivation",
        )
        == "system"
    )


def test_repair_json_gpt_fast_max_tokens_matches_policy() -> None:
    assert llm.REPAIR_JSON_OPENAI_MAX_TOKENS == 1500


def test_feature_cross_fallback_model_disabled_for_all_features(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "x")
    assert llm._feature_cross_fallback_model("company_info", "anthropic") is None
    assert llm._feature_cross_fallback_model("selection_schedule", "anthropic") is None
    assert llm._feature_cross_fallback_model("es_review", "anthropic") is None


def test_feature_cross_fallback_model_openai_never_switches_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "y")
    assert llm._feature_cross_fallback_model("company_info", "openai") is None
    assert llm._feature_cross_fallback_model("selection_schedule", "openai") is None


def test_feature_cross_fallback_model_google_never_switch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "o")
    monkeypatch.setattr(settings, "anthropic_api_key", "a")
    assert llm._feature_cross_fallback_model("company_info", "google") is None


@pytest.mark.asyncio
async def test_call_llm_with_error_openai_rate_limit_skips_cross_provider_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "k")
    monkeypatch.setattr(settings, "anthropic_api_key", "a")

    async def fail_responses(*args, **kwargs):
        raise OpenAIAPIError(
            "rate limit 429",
            httpx.Request("POST", "https://api.openai.com/v1/responses"),
            body=None,
        )

    async def no_claude(*args, **kwargs):
        raise AssertionError("claude must not be called when rate_limited")

    monkeypatch.setattr(llm, "_call_openai_responses", fail_responses)
    monkeypatch.setattr(llm, "_call_claude_raw", no_claude)

    result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        feature="company_info",
        response_format="json_schema",
        json_schema={
            "type": "object",
            "properties": {"a": {"type": "string"}},
            "required": ["a"],
        },
        use_responses_api=True,
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "rate_limit"


@pytest.mark.asyncio
async def test_call_llm_with_error_no_openai_key_returns_no_api_key_without_other_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "a")

    async def no_claude(*args, **kwargs):
        raise AssertionError("no fallback to claude when primary key missing")

    monkeypatch.setattr(llm, "_call_claude_raw", no_claude)

    result = await llm.call_llm_with_error(
        system_prompt="s",
        user_message="u",
        model="gpt-fast",
        feature="company_info",
        response_format="json_object",
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "no_api_key"
