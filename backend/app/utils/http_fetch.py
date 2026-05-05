"""
HTTP fetch utilities with SSL fallback strategies.
"""

from __future__ import annotations

import logging
import ssl
import asyncio
from typing import Optional
from urllib.parse import urlparse

import certifi
import httpx
from bs4 import BeautifulSoup
from app.utils.public_url_guard import MAX_REDIRECTS, resolve_redirect_url, validate_public_url

logger = logging.getLogger(__name__)

MAX_FETCH_BYTES = 20 * 1024 * 1024
MAX_HEADER_BYTES = 64 * 1024


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


def _ssl_context_from_verify(verify: bool | ssl.SSLContext) -> ssl.SSLContext:
    if isinstance(verify, ssl.SSLContext):
        return verify
    if verify is True:
        return ssl.create_default_context(cafile=certifi.where())
    raise httpx.ConnectError("Insecure TLS verification is not allowed")


def _request_target(url: str) -> str:
    parsed = urlparse(url)
    target = parsed.path or "/"
    if parsed.query:
        target = f"{target}?{parsed.query}"
    return target


def _host_header(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.port and parsed.port != 443:
        return f"{host}:{parsed.port}"
    return host


async def _read_until_headers(reader: asyncio.StreamReader) -> tuple[bytes, bytes]:
    data = bytearray()
    while b"\r\n\r\n" not in data:
        chunk = await reader.read(4096)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > MAX_HEADER_BYTES:
            raise httpx.HTTPError("Response headers too large")
    header_bytes, separator, remainder = bytes(data).partition(b"\r\n\r\n")
    if not separator:
        raise httpx.HTTPError("Malformed HTTP response")
    return header_bytes, remainder


def _parse_response_headers(header_bytes: bytes) -> tuple[int, dict[str, str]]:
    lines = header_bytes.decode("iso-8859-1", errors="replace").split("\r\n")
    status_parts = lines[0].split(" ", 2)
    if len(status_parts) < 2 or not status_parts[1].isdigit():
        raise httpx.HTTPError("Malformed HTTP status line")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    return int(status_parts[1]), headers


async def _read_body(reader: asyncio.StreamReader, headers: dict[str, str], initial: bytes) -> bytes:
    content_length = headers.get("content-length")
    if content_length is not None:
        try:
            expected = int(content_length)
        except ValueError:
            expected = None
        if expected is not None:
            if expected > MAX_FETCH_BYTES:
                raise httpx.HTTPError(
                    f"Response too large: content-length exceeds {MAX_FETCH_BYTES} bytes"
                )
            body = bytearray(initial)
            while len(body) < expected:
                chunk = await reader.read(min(65536, expected - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
            return bytes(body[:expected])

    body = bytearray(initial)
    while len(body) <= MAX_FETCH_BYTES:
        chunk = await reader.read(65536)
        if not chunk:
            break
        body.extend(chunk)
    if len(body) > MAX_FETCH_BYTES:
        raise httpx.HTTPError(
            f"Response too large: streamed body exceeds {MAX_FETCH_BYTES} bytes"
        )
    return bytes(body)


async def _pinned_https_get(
    url: str,
    *,
    resolved_ips: list[str],
    headers: dict[str, str],
    verify: bool | ssl.SSLContext,
    timeout: float,
) -> tuple[int, dict[str, str], bytes]:
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise httpx.ConnectError("Invalid URL hostname")
    context = _ssl_context_from_verify(verify)
    request = (
        f"GET {_request_target(url)} HTTP/1.1\r\n"
        f"Host: {_host_header(url)}\r\n"
        + "".join(f"{name}: {value}\r\n" for name, value in headers.items())
        + "Connection: close\r\n\r\n"
    ).encode("ascii", errors="ignore")

    last_error: Exception | None = None
    for address in resolved_ips:
        writer: asyncio.StreamWriter | None = None
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(
                    host=address,
                    port=parsed.port or 443,
                    ssl=context,
                    server_hostname=hostname,
                ),
                timeout=timeout,
            )
            writer.write(request)
            await asyncio.wait_for(writer.drain(), timeout=timeout)
            header_bytes, initial_body = await asyncio.wait_for(
                _read_until_headers(reader),
                timeout=timeout,
            )
            status_code, response_headers = _parse_response_headers(header_bytes)
            body = await asyncio.wait_for(
                _read_body(reader, response_headers, initial_body),
                timeout=timeout,
            )
            return status_code, response_headers, body
        except Exception as exc:
            last_error = exc
            continue
        finally:
            if writer is not None:
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
    raise httpx.ConnectError(
        f"Failed to connect to validated public address: {str(last_error)[:100] if last_error else 'unknown'}"
    )


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
            current_url = str(url)
            for _ in range(MAX_REDIRECTS + 1):
                validation = validate_public_url(current_url)
                if not validation.allowed or not validation.resolved_ips:
                    raise httpx.ConnectError(validation.reason or "URL validation failed")

                status_code, response_headers, body = await _pinned_https_get(
                    current_url,
                    resolved_ips=validation.resolved_ips,
                    headers=headers,
                    verify=strategy["verify"],
                    timeout=timeout,
                )
                if status_code in {301, 302, 303, 307, 308}:
                    location = response_headers.get("location")
                    if not location:
                        raise httpx.ConnectError("Redirect location is missing")
                    current_url = resolve_redirect_url(current_url, location)
                    continue

                response = httpx.Response(
                    status_code,
                    request=httpx.Request("GET", current_url),
                    content=body,
                )
                response.raise_for_status()
                return body

            raise httpx.ConnectError("Too many redirects")

        except httpx.NetworkError as e:
            if _is_ssl_related_error(e):
                last_error = e
                continue
            raise
        except httpx.TimeoutException:
            raise
        except httpx.HTTPStatusError:
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
