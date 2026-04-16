"""JSON payload size guard middleware (Phase 7 象限③).

The upload path enforces its own per-route ceiling via
``app.security.upload_limits``. Everything else — company_info crawl configs,
ES review streams, motivation start requests, internal auth callbacks — is
``application/json`` bodies that should never exceed 1 MB in the honest case.

Without this guard, an attacker can post a 500 MB JSON body and force the
server to allocate and parse it before any route-level validation runs. The
middleware:

1. Only inspects requests whose ``Content-Type`` begins with
   ``application/json`` (case-insensitive; skip multipart and form bodies).
2. Reads ``Content-Length`` and rejects with 413 when it exceeds the limit.
3. Rejects ``Transfer-Encoding: chunked`` for JSON requests: our clients
   (Next.js BFF, internal integration tests) always send Content-Length for
   JSON, so chunked JSON is either misconfigured or an evasion attempt.
4. Passes multipart bodies through untouched; those are handled by
   ``enforce_pdf_upload_size`` and friends at the route layer.

Fail-open is intentional when the request has *no* Content-Length at all
(e.g. empty bodies, or proxies that strip the header). The 413 only fires
when we have a positive signal that the payload is oversized.
"""

from __future__ import annotations

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

# 1 MiB upper bound for JSON payloads. Matches the BFF proxy limit so both
# edges reject identically-sized bodies.
MAX_JSON_PAYLOAD_BYTES: int = 1 * 1024 * 1024


def _is_json_request(request: Request) -> bool:
    content_type = (request.headers.get("content-type") or "").lower()
    # Accept ``application/json`` and ``application/json; charset=utf-8`` alike.
    return content_type.startswith("application/json")


def _too_large_response(reason: str, max_bytes: int) -> JSONResponse:
    return JSONResponse(
        status_code=413,
        content={
            "detail": "Request payload too large",
            "reason": reason,
            "max_bytes": max_bytes,
        },
    )


class JsonPayloadSizeLimitMiddleware(BaseHTTPMiddleware):
    """Enforce ``MAX_JSON_PAYLOAD_BYTES`` for JSON request bodies."""

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        if request.method in {"GET", "HEAD", "OPTIONS", "DELETE"}:
            return await call_next(request)

        if not _is_json_request(request):
            # multipart/form-data and x-www-form-urlencoded are handled by
            # upload_limits at the route layer so streamed boundaries still
            # parse cleanly.
            return await call_next(request)

        transfer_encoding = (request.headers.get("transfer-encoding") or "").lower()
        if "chunked" in transfer_encoding:
            logger.warning(
                "[payload-limit] rejected chunked JSON request path=%s",
                request.url.path,
            )
            return _too_large_response(
                "chunked_transfer_encoding_not_allowed_for_json",
                MAX_JSON_PAYLOAD_BYTES,
            )

        content_length_header = request.headers.get("content-length")
        if content_length_header is None:
            # No explicit length (e.g. empty body). Let the route handle it.
            return await call_next(request)

        try:
            content_length = int(content_length_header)
        except ValueError:
            logger.warning(
                "[payload-limit] malformed Content-Length header value=%r path=%s",
                content_length_header,
                request.url.path,
            )
            return _too_large_response(
                "invalid_content_length",
                MAX_JSON_PAYLOAD_BYTES,
            )

        if content_length > MAX_JSON_PAYLOAD_BYTES:
            logger.warning(
                "[payload-limit] rejected oversized JSON body bytes=%d path=%s",
                content_length,
                request.url.path,
            )
            return _too_large_response(
                "content_length_exceeds_limit",
                MAX_JSON_PAYLOAD_BYTES,
            )

        return await call_next(request)
