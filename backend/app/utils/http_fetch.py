"""
HTTP fetch utilities with SSL fallback strategies.
"""

from __future__ import annotations

import logging
import ssl
from typing import Optional

import certifi
import httpx
from bs4 import BeautifulSoup
from app.utils.public_url_guard import MAX_REDIRECTS, resolve_redirect_url, validate_public_url

logger = logging.getLogger(__name__)


def _is_ssl_related_error(exc: Exception) -> bool:
    """Check if the exception is SSL-related."""
    current = exc
    while current is not None:
        if isinstance(current, ssl.SSLError):
            return True
        current = getattr(current, "__cause__", None)

    error_msg = str(exc).lower()
    ssl_keywords = ["ssl", "tls", "handshake", "certificate", "sslv3_alert"]
    return any(kw in error_msg for kw in ssl_keywords)


def create_ssl_context(
    seclevel: int = 2, legacy_connect: bool = False
) -> ssl.SSLContext:
    """Create SSL context with specified security level."""
    context = ssl.create_default_context(cafile=certifi.where())
    context.set_ciphers(f"DEFAULT@SECLEVEL={seclevel}")

    if legacy_connect:
        legacy_option = getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
        context.options |= legacy_option

    return context


async def fetch_page_content(url: str, timeout: float = 30.0) -> bytes:
    """Fetch page content from URL with SSL fallback strategies."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    ssl_strategies = [
        {"verify": True, "name": "default"},
        {"verify": create_ssl_context(seclevel=1), "name": "seclevel1"},
        {"verify": create_ssl_context(seclevel=0), "name": "seclevel0"},
        {"verify": create_ssl_context(seclevel=1, legacy_connect=True), "name": "legacy-seclevel1"},
        {"verify": create_ssl_context(seclevel=0, legacy_connect=True), "name": "legacy-seclevel0"},
        # NOTE: verify=False intentionally removed — MITM risk too high
    ]

    last_error: Optional[Exception] = None

    for strategy in ssl_strategies:
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=False,
                verify=strategy["verify"],
                headers=headers,
            ) as client:
                current_url = str(url)
                for _ in range(MAX_REDIRECTS + 1):
                    validation = validate_public_url(current_url)
                    if not validation.allowed:
                        raise httpx.ConnectError(validation.reason or "URL validation failed")

                    response = await client.get(current_url)
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise httpx.ConnectError("Redirect location is missing")
                        current_url = resolve_redirect_url(current_url, location)
                        continue

                    response.raise_for_status()
                    return response.content

                raise httpx.ConnectError("Too many redirects")

        except httpx.NetworkError as e:
            if _is_ssl_related_error(e):
                last_error = e
                continue
            raise
        except httpx.TimeoutException:
            raise
        except httpx.HTTPStatusError as e:
            raise

    logger.warning(
        "All SSL strategies exhausted for %s: %s",
        url,
        str(last_error)[:200] if last_error else "unknown",
    )
    raise httpx.ConnectError(
        f"SSL connection failed: {str(last_error)[:100] if last_error else 'unknown'}"
    )


def extract_text_from_html(html: bytes, max_text_chars: int | None = None) -> str:
    """Extract readable text from HTML."""
    soup = BeautifulSoup(html, "html.parser")

    for script in soup(["script", "style", "noscript", "iframe"]):
        script.decompose()

    text = soup.get_text(separator="\n")

    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = "\n".join(chunk for chunk in chunks if chunk)

    limit = 15000 if max_text_chars is None else max(1, int(max_text_chars))
    return text[:limit]
