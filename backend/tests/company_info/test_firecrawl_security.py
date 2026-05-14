from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.utils import firecrawl


@pytest.mark.asyncio
async def test_firecrawl_rejects_unsafe_url_before_api_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(firecrawl.settings, "firecrawl_api_key", "fc-test")
    monkeypatch.setattr(
        firecrawl,
        "validate_public_url",
        lambda _url: SimpleNamespace(allowed=False, reason="内部アドレスにはアクセスできません。"),
    )

    result = await firecrawl.scrape_url_with_schema(
        "https://127.0.0.1/recruit",
        schema={},
        system_prompt="system",
        prompt="prompt",
    )

    assert result.success is False
    assert result.diagnostics["error"] == "unsafe_url"
    assert result.diagnostics["reason"] == "内部アドレスにはアクセスできません。"
