from __future__ import annotations

import asyncio

import pytest

from app.config import settings
from app.utils import qwen_es_review


@pytest.fixture(autouse=True)
def _reset_qwen_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", False)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")
    monkeypatch.setattr(settings, "qwen_es_review_api_key", "")
    monkeypatch.setattr(settings, "qwen_es_review_timeout_seconds", 120)
    monkeypatch.setattr(settings, "qwen_es_review_timeout_improvement_seconds", 30)
    monkeypatch.setattr(settings, "qwen_es_review_timeout_rewrite_seconds", 90)
    monkeypatch.setattr(settings, "qwen_es_review_timeout_compact_rewrite_seconds", 45)
    monkeypatch.setattr(settings, "qwen_es_review_timeout_length_fix_seconds", 20)
    monkeypatch.setattr(settings, "qwen_es_review_total_budget_seconds", 150)
    monkeypatch.setattr(settings, "qwen_es_review_adapter_id", "")
    monkeypatch.setattr(qwen_es_review, "_qwen_client", None)


def test_resolve_qwen_es_review_model_name_prefers_adapter_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")
    monkeypatch.setattr(settings, "qwen_es_review_adapter_id", "tenant/qwen3-es-review-lora")

    assert qwen_es_review.resolve_qwen_es_review_model_name() == "tenant/qwen3-es-review-lora"


def test_ensure_no_think_prefix_is_added_once() -> None:
    assert qwen_es_review._ensure_no_think("system prompt").startswith("/no_think\n")
    assert qwen_es_review._ensure_no_think("/no_think\nsystem prompt") == "/no_think\nsystem prompt"


def test_extract_text_content_strips_think_block() -> None:
    text = "<think>\ninternal\n</think>\n改善案です。"
    assert qwen_es_review._extract_text_content(text) == "改善案です。"


@pytest.mark.asyncio
async def test_get_qwen_es_review_client_disables_sdk_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")

    captured_kwargs: dict[str, object] = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

    monkeypatch.setattr(qwen_es_review.openai, "AsyncOpenAI", FakeClient)

    client = await qwen_es_review.get_qwen_es_review_client()

    assert isinstance(client, FakeClient)
    assert captured_kwargs["timeout"] == 120
    assert captured_kwargs["max_retries"] == 0


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
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    captured_kwargs: dict[str, object] = {}

    async def fake_completion(**kwargs):
        captured_kwargs.update(kwargs)
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
    assert captured_kwargs["json_schema"] is not None


@pytest.mark.asyncio
async def test_call_qwen_chat_completion_uses_non_thinking_and_strict_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    captured_request: dict[str, object] = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            captured_request.update(kwargs)

            class Message:
                content = '{"top3":[{"category":"結論","issue":"結論が遅い","suggestion":"冒頭で結論を示す"}]}'

            class Choice:
                message = Message()

            class Response:
                choices = [Choice()]

            return Response()

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    async def fake_get_client():
        return FakeClient()

    monkeypatch.setattr(qwen_es_review, "_get_qwen_request_client", lambda timeout_seconds: fake_get_client())

    result = await qwen_es_review._call_qwen_chat_completion(
        system_prompt="system prompt",
        user_message="user prompt",
        max_tokens=123,
        temperature=0.15,
        json_schema={"type": "object", "properties": {"top3": {"type": "array"}}},
    )

    assert result.startswith("{")
    assert captured_request["response_format"]["json_schema"]["strict"] is True
    assert captured_request["extra_body"]["chat_template_kwargs"]["enable_thinking"] is False
    assert captured_request["max_tokens"] == 123


@pytest.mark.asyncio
async def test_call_qwen_chat_completion_text_uses_non_thinking_controls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    captured_request: dict[str, object] = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            captured_request.update(kwargs)

            class Message:
                content = "改善案です。"

            class Choice:
                message = Message()

            class Response:
                choices = [Choice()]

            return Response()

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    async def fake_get_client():
        return FakeClient()

    monkeypatch.setattr(qwen_es_review, "_get_qwen_request_client", lambda timeout_seconds: fake_get_client())

    result = await qwen_es_review._call_qwen_chat_completion(
        system_prompt="system prompt",
        user_message="user prompt",
        max_tokens=321,
        temperature=0.2,
        json_schema=None,
    )

    assert result == "改善案です。"
    assert captured_request["max_tokens"] == 321
    assert captured_request["top_p"] == 0.8
    assert captured_request["extra_body"]["chat_template_kwargs"]["enable_thinking"] is False


@pytest.mark.asyncio
async def test_call_qwen_chat_completion_applies_per_request_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    seen_timeouts: list[int | None] = []

    class FakeCompletions:
        async def create(self, **kwargs):
            class Message:
                content = "改善案です。"

            class Choice:
                message = Message()

            class Response:
                choices = [Choice()]

            return Response()

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

        def with_options(self, **kwargs):
            seen_timeouts.append(kwargs.get("timeout"))
            return self

    async def fake_get_client():
        return FakeClient()

    monkeypatch.setattr(qwen_es_review, "get_qwen_es_review_client", fake_get_client)

    result = await qwen_es_review._call_qwen_chat_completion(
        system_prompt="system prompt",
        user_message="user prompt",
        max_tokens=321,
        temperature=0.2,
        json_schema=None,
        timeout_seconds=37,
    )

    assert result == "改善案です。"
    assert seen_timeouts == [37]


@pytest.mark.asyncio
async def test_call_qwen_es_review_json_uses_parse_retry_instructions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    seen_prompts: list[str] = []
    responses = iter(
        [
            '{"top3":[{"category":"結論"',
            '{"top3":[{"category":"結論","issue":"結論が遅い","suggestion":"冒頭で結論を示す"}]}',
        ]
    )

    async def fake_completion(**kwargs):
        seen_prompts.append(str(kwargs["system_prompt"]))
        return next(responses)

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
        retry_on_parse=True,
        parse_retry_instructions="必ず有効なJSONのみを返してください。コードブロックは禁止です。",
    )

    assert result.success is True
    assert len(seen_prompts) == 2
    assert "JSON出力の厳守" in seen_prompts[1]
    assert "コードブロックは禁止です。" in seen_prompts[1]


@pytest.mark.asyncio
async def test_call_qwen_es_review_text_returns_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    captured_kwargs: dict[str, object] = {}

    async def fake_completion(**kwargs):
        captured_kwargs.update(kwargs)
        assert kwargs["json_schema"] is None
        return "改善案です。"

    monkeypatch.setattr(qwen_es_review, "_call_qwen_chat_completion", fake_completion)

    result = await qwen_es_review.call_qwen_es_review_text_with_error(
        system_prompt="system",
        user_message="user",
    )

    assert result.success is True
    assert result.data == {"text": "改善案です。"}
    assert captured_kwargs["max_tokens"] == 2000


@pytest.mark.asyncio
async def test_call_qwen_es_review_text_classifies_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "qwen_es_review_enabled", True)
    monkeypatch.setattr(settings, "qwen_es_review_base_url", "http://localhost:8001/v1")
    monkeypatch.setattr(settings, "qwen_es_review_model", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2")

    async def fake_completion(**kwargs):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(qwen_es_review, "_call_qwen_chat_completion", fake_completion)

    result = await qwen_es_review.call_qwen_es_review_text_with_error(
        system_prompt="system",
        user_message="user",
        timeout_seconds=21,
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.error_type == "timeout"
