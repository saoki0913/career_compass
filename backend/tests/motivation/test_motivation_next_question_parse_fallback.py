from types import SimpleNamespace

import pytest

from app.routers.motivation import (
    NextQuestionRequest,
    _motivation_question_parse_fallback_model,
    _retry_motivation_question_parse_fallback,
    get_next_question,
)


@pytest.mark.asyncio
async def test_parse_failure_retries_with_cross_provider_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict] = []

    async def fake_call_llm_with_error(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            success=True,
            data={"question": "事業のどの点に関心を持ちましたか？"},
            error=None,
        )

    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing._feature_cross_fallback_model",
        lambda feature, provider: "gpt-mini",
    )
    monkeypatch.setattr(
        "app.routers.motivation.call_llm_with_error",
        fake_call_llm_with_error,
    )

    original_result = SimpleNamespace(
        success=False,
        data=None,
        error=SimpleNamespace(error_type="parse", provider="anthropic"),
    )

    result = await _retry_motivation_question_parse_fallback(
        llm_result=original_result,
        prompt="system prompt",
        user_message="user prompt",
        messages=[{"role": "user", "content": "志望理由を深掘りしてください。"}],
    )

    assert result.success is True
    assert result.data["question"] == "事業のどの点に関心を持ちましたか？"
    assert calls
    assert calls[0]["model"] == "gpt-mini"
    assert calls[0]["feature"] == "motivation"
    assert calls[0]["temperature"] == 0.4
    assert calls[0]["retry_on_parse"] is True
    assert calls[0]["disable_fallback"] is True


def test_parse_fallback_model_uses_sonnet_when_cross_provider_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing._feature_cross_fallback_model",
        lambda feature, provider: None,
    )
    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing.get_model_config",
        lambda: {"motivation": "claude-haiku"},
    )
    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing._provider_has_api_key",
        lambda provider: provider == "anthropic",
    )

    assert _motivation_question_parse_fallback_model("anthropic") == "claude-sonnet"


@pytest.mark.asyncio
async def test_next_question_endpoint_uses_parse_fallback_before_raising_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict] = []

    async def fake_summarize(messages, conversation_context, company_name):
        return messages, ""

    async def fake_prepare(request, tenant_key=None):
        return SimpleNamespace(
            is_complete=False,
            was_draft_ready=False,
            has_generated_draft=False,
        )

    async def fake_call_llm_with_error(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return SimpleNamespace(
                success=False,
                data=None,
                error=SimpleNamespace(
                    error_type="parse",
                    provider="anthropic",
                    message="AIからの応答を解析できませんでした。",
                ),
            )
        return SimpleNamespace(
            success=True,
            data={"question": "株式会社テストの事業のどの点に関心がありますか？"},
            error=None,
        )

    async def fake_assemble_response(request, prep, data):
        return {"question": data["question"]}

    monkeypatch.setattr("app.routers.motivation.maybe_summarize_older_messages", fake_summarize)
    monkeypatch.setattr("app.routers.motivation._prepare_motivation_next_question", fake_prepare)
    monkeypatch.setattr(
        "app.routers.motivation._build_motivation_question_system_prompt",
        lambda request, prep: "system prompt",
    )
    monkeypatch.setattr("app.routers.motivation._should_use_deepdive_mode", lambda prep: False)
    monkeypatch.setattr("app.routers.motivation._build_question_messages", lambda messages: messages)
    monkeypatch.setattr("app.routers.motivation._build_question_user_message", lambda messages: "user prompt")
    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing._feature_cross_fallback_model",
        lambda feature, provider: "gpt-mini",
    )
    monkeypatch.setattr(
        "app.routers.motivation.call_llm_with_error",
        fake_call_llm_with_error,
    )
    monkeypatch.setattr(
        "app.routers.motivation._assemble_regular_next_question_response",
        fake_assemble_response,
    )

    endpoint = getattr(get_next_question, "__wrapped__", get_next_question)
    result = await endpoint(
        NextQuestionRequest(
            company_id="company_test",
            company_name="株式会社テスト",
            industry="IT・通信",
            conversation_history=[],
            question_count=0,
            conversation_context={},
        ),
        SimpleNamespace(),
        SimpleNamespace(company_id="company_test", tenant_key="tenant-test"),
    )

    assert result["question"] == "株式会社テストの事業のどの点に関心がありますか？"
    assert len(calls) == 2
    assert calls[0].get("model") is None
    assert calls[1]["model"] == "gpt-mini"


@pytest.mark.asyncio
async def test_non_parse_failure_does_not_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_if_called(*args, **kwargs):
        raise AssertionError("fallback should not be called")

    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing._feature_cross_fallback_model",
        lambda feature, provider: "gpt-mini",
    )
    monkeypatch.setattr("app.routers.motivation.call_llm_with_error", fail_if_called)

    original_result = SimpleNamespace(
        success=False,
        data=None,
        error=SimpleNamespace(error_type="network", provider="anthropic"),
    )

    result = await _retry_motivation_question_parse_fallback(
        llm_result=original_result,
        prompt="system prompt",
        user_message="user prompt",
        messages=[],
    )

    assert result is original_result


@pytest.mark.asyncio
async def test_parse_failure_keeps_original_error_when_fallback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_call_llm_with_error(**kwargs):
        return SimpleNamespace(
            success=False,
            data=None,
            error=SimpleNamespace(error_type="parse", provider="openai"),
        )

    monkeypatch.setattr(
        "app.routers.motivation.llm_model_routing._feature_cross_fallback_model",
        lambda feature, provider: "gpt-mini",
    )
    monkeypatch.setattr(
        "app.routers.motivation.call_llm_with_error",
        fake_call_llm_with_error,
    )

    original_result = SimpleNamespace(
        success=False,
        data=None,
        error=SimpleNamespace(error_type="parse", provider="anthropic"),
    )

    result = await _retry_motivation_question_parse_fallback(
        llm_result=original_result,
        prompt="system prompt",
        user_message="user prompt",
        messages=[],
    )

    assert result is original_result
