from types import SimpleNamespace

import pytest

from app.utils import content_classifier


@pytest.mark.asyncio
async def test_classify_content_category_with_llm_formats_optional_fields_safely(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    monkeypatch.setattr(
        content_classifier,
        "get_managed_prompt_content",
        lambda _key, *, fallback: fallback,
    )

    async def _fake_call_llm_with_error(**kwargs):
        captured["user_message"] = kwargs["user_message"]
        return SimpleNamespace(success=True, data={"category": "corporate_site"})

    monkeypatch.setattr(
        content_classifier,
        "call_llm_with_error",
        _fake_call_llm_with_error,
    )

    result = await content_classifier.classify_content_category_with_llm(
        source_url="https://example.com/company",
        heading=None,
        text="会社概要です",
        source_channel=None,
    )

    assert result == "corporate_site"
    assert "source_channel: \n" in captured["user_message"]
    assert "見出し: \n" in captured["user_message"]
