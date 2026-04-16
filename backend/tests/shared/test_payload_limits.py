"""Tests for the JSON payload size middleware and upload size helper (D-2)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.security.payload_limits import (
    MAX_JSON_PAYLOAD_BYTES,
    JsonPayloadSizeLimitMiddleware,
)
from app.security.upload_limits import (
    MAX_PDF_UPLOAD_BYTES,
    enforce_pdf_upload_size,
)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(JsonPayloadSizeLimitMiddleware)

    @app.post("/echo")
    async def echo(payload: dict | None = None):  # pragma: no cover - simple echo
        return {"ok": True, "payload": payload}

    @app.post("/upload")
    async def upload(file_bytes: bytes = b""):  # pragma: no cover - multipart pathway
        return {"ok": True, "size": len(file_bytes)}

    @app.get("/health")
    async def health():
        return {"ok": True}

    return app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(_build_app())


def test_small_json_passes(client: TestClient) -> None:
    response = client.post("/echo", json={"hello": "world"})
    assert response.status_code == 200


def test_oversized_json_rejected(client: TestClient) -> None:
    # Construct a body slightly larger than the 1 MiB limit.
    big_value = "x" * (MAX_JSON_PAYLOAD_BYTES + 1)
    response = client.post(
        "/echo",
        data=f'{{"v":"{big_value}"}}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    body = response.json()
    assert body["reason"] == "content_length_exceeds_limit"
    assert body["max_bytes"] == MAX_JSON_PAYLOAD_BYTES


def test_chunked_json_rejected(client: TestClient) -> None:
    # Clients that omit Content-Length via chunked encoding must be rejected
    # because we cannot pre-check their size.
    response = client.post(
        "/echo",
        data='{"v":"hello"}',
        headers={
            "Content-Type": "application/json",
            "Transfer-Encoding": "chunked",
        },
    )
    assert response.status_code == 413
    assert response.json()["reason"] == "chunked_transfer_encoding_not_allowed_for_json"


def test_multipart_passes_through(client: TestClient) -> None:
    # Multipart uploads are policed by ``upload_limits`` at the route layer;
    # the JSON middleware must not interfere even with a large Content-Length.
    big_file_bytes = b"x" * (MAX_JSON_PAYLOAD_BYTES + 10)
    response = client.post(
        "/upload",
        files={"file_bytes": ("big.bin", big_file_bytes, "application/octet-stream")},
    )
    # The route accepts the request — middleware didn't block it.
    # (Whether the app logic accepts the body content is orthogonal.)
    assert response.status_code in {200, 422}


def test_get_request_bypasses_middleware(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200


def test_malformed_content_length_rejected() -> None:
    # ``requests`` and ``httpx`` normalize Content-Length before sending, so we
    # exercise the middleware directly by building a minimal Starlette request
    # with a malformed header and running dispatch.
    import asyncio

    from starlette.requests import Request

    middleware = JsonPayloadSizeLimitMiddleware(app=None)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/echo",
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", b"not-a-number"),
        ],
        "query_string": b"",
        "server": ("testserver", 80),
        "scheme": "http",
        "client": ("testclient", 0),
    }
    request = Request(scope)

    async def _boom(_request):  # pragma: no cover - should not be reached
        raise AssertionError("call_next must not run for rejected requests")

    response = asyncio.run(middleware.dispatch(request, _boom))
    assert response.status_code == 413
    # JSONResponse content is bytes at this layer.
    import json as _json

    body = _json.loads(response.body)
    assert body["reason"] == "invalid_content_length"


def test_enforce_pdf_upload_size_allows_ok_payload() -> None:
    enforce_pdf_upload_size(b"x" * 1024)  # 1 KiB — well under limit


def test_enforce_pdf_upload_size_raises_for_oversized_payload() -> None:
    too_big = b"x" * (MAX_PDF_UPLOAD_BYTES + 1)
    with pytest.raises(HTTPException) as exc_info:
        enforce_pdf_upload_size(too_big)
    assert exc_info.value.status_code == 413
