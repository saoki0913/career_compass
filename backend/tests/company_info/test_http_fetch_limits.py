from __future__ import annotations

import socket
import httpx
import pytest

from app.utils import http_fetch


@pytest.fixture(autouse=True)
def _public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_getaddrinfo(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


@pytest.mark.asyncio
async def test_fetch_page_content_rejects_large_content_length(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_pinned_get(*args, **kwargs):
        raise httpx.HTTPError(
            f"Response too large: content-length exceeds {http_fetch.MAX_FETCH_BYTES} bytes"
        )

    monkeypatch.setattr(http_fetch, "_pinned_https_get", fake_pinned_get)

    with pytest.raises(httpx.HTTPError) as exc_info:
        await http_fetch.fetch_page_content("https://example.com/recruit")

    assert "response too large" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_fetch_page_content_interrupts_oversized_chunked_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_pinned_get(*args, **kwargs):
        raise httpx.HTTPError(
            f"Response too large: streamed body exceeds {http_fetch.MAX_FETCH_BYTES} bytes"
        )

    monkeypatch.setattr(http_fetch, "_pinned_https_get", fake_pinned_get)

    with pytest.raises(httpx.HTTPError) as exc_info:
        await http_fetch.fetch_page_content("https://example.com/recruit")

    assert "response too large" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_fetch_page_content_uses_validated_resolved_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict] = []

    async def fake_pinned_get(*args, **kwargs):
        calls.append(kwargs)
        return 200, {}, b"<html>ok</html>"

    monkeypatch.setattr(http_fetch, "_pinned_https_get", fake_pinned_get)

    body = await http_fetch.fetch_page_content("https://example.com/recruit")

    assert body == b"<html>ok</html>"
    assert calls[0]["resolved_ips"] == ["93.184.216.34"]
