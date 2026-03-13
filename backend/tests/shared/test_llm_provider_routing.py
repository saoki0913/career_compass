from __future__ import annotations

import pytest

from app.config import settings
from app.utils import llm


@pytest.fixture(autouse=True)
def _reset_provider_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "google_api_key", "")
    monkeypatch.setattr(settings, "cohere_api_key", "")
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    monkeypatch.setattr(settings, "openai_model", "gpt-5-mini")
    monkeypatch.setattr(settings, "google_model", "gemini-3.1-pro-preview")
    monkeypatch.setattr(settings, "cohere_model", "command-a-03-2025")
    monkeypatch.setattr(settings, "deepseek_model", "deepseek-chat")
    monkeypatch.setattr(settings, "model_es_review", "claude-sonnet")
    monkeypatch.setattr(llm, "_model_config", None)
    monkeypatch.setattr(llm, "_openai_client", None)
    monkeypatch.setattr(llm, "_openai_client_rag", None)
    monkeypatch.setattr(llm, "_compat_clients", {})
    monkeypatch.setattr(llm, "_google_http_client", None)
    monkeypatch.setattr(llm, "_google_http_client_rag", None)


def test_resolve_model_target_supports_explicit_provider_models() -> None:
    assert llm._resolve_model_target("es_review", "gpt-5.1").provider == "openai"
    assert llm._resolve_model_target("es_review", "gemini-3.1-pro-preview").provider == "google"
    assert llm._resolve_model_target("es_review", "command-a-03-2025").provider == "cohere"
    assert llm._resolve_model_target("es_review", "deepseek-chat").provider == "deepseek"


def test_resolve_feature_model_metadata_uses_current_feature_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "model_es_review", "gemini-3.1-pro-preview")
    monkeypatch.setattr(llm, "_model_config", None)

    provider, model_name = llm.resolve_feature_model_metadata("es_review")

    assert provider == "google"
    assert model_name == "gemini-3.1-pro-preview"


def test_resolve_feature_model_metadata_supports_request_override() -> None:
    provider, model_name = llm.resolve_feature_model_metadata("es_review", "deepseek-chat")

    assert provider == "deepseek"
    assert model_name == "deepseek-chat"


def test_build_chat_response_format_maps_provider_capabilities() -> None:
    schema = {
        "type": "object",
        "properties": {"answer": {"type": "string"}},
        "required": ["answer"],
    }

    assert llm._build_chat_response_format("deepseek", "json_schema", schema) == {
        "type": "json_object"
    }
    assert llm._build_chat_response_format("cohere", "json_schema", schema) == {
        "type": "json_object",
        "schema": schema,
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
        temperature=0.1,
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

    responses = iter(
        [
            ('{"ok":', {}),
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


@pytest.mark.asyncio
async def test_call_llm_with_error_routes_deepseek_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-deepseek-key")

    seen: dict[str, object] = {}

    async def fake_openai_compatible(**kwargs):
        seen.update(kwargs)
        return {"ok": True}

    monkeypatch.setattr(llm, "_call_openai_compatible", fake_openai_compatible)

    result = await llm.call_llm_with_error(
        system_prompt="system",
        user_message="user",
        model="deepseek",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}},
        disable_fallback=True,
    )

    assert result.success is True
    assert result.data == {"ok": True}
    assert seen["provider"] == "deepseek"
    assert seen["model"] == "deepseek-chat"


@pytest.mark.asyncio
async def test_call_llm_with_error_routes_explicit_cohere_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "cohere_api_key", "test-cohere-key")

    seen: dict[str, object] = {}

    async def fake_openai_compatible(**kwargs):
        seen.update(kwargs)
        return {"answer": "改善案"}

    monkeypatch.setattr(llm, "_call_openai_compatible", fake_openai_compatible)

    result = await llm.call_llm_with_error(
        system_prompt="system",
        user_message="user",
        model="command-a-03-2025",
        response_format="json_schema",
        json_schema={"type": "object", "properties": {"answer": {"type": "string"}}},
        disable_fallback=True,
    )

    assert result.success is True
    assert result.data == {"answer": "改善案"}
    assert seen["provider"] == "cohere"
    assert seen["model"] == "command-a-03-2025"
