"""Tests for the X-Career-Principal BFF → FastAPI propagation."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import time
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.security.career_principal import (
    PRINCIPAL_HEADER,
    require_career_principal,
)

SECRET = "test-career-principal-hmac-secret"


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _build_token(
    *,
    secret: str = SECRET,
    scope: str = "company",
    actor_kind: str = "user",
    actor_id: str = "user-1",
    plan: str = "standard",
    company_id: str | None = "company-1",
    now: int | None = None,
    exp_offset: int = 60,
    nbf_offset: int = -5,
    iss: str = "next-bff",
    aud: str = "career-compass-fastapi",
    alg: str = "HS256",
    jti: str = "jti-1",
) -> str:
    if now is None:
        now = int(time.time())
    header = _b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    payload = _b64url(
        json.dumps(
            {
                "iss": iss,
                "aud": aud,
                "scope": scope,
                "actor": {"kind": actor_kind, "id": actor_id},
                "company_id": company_id,
                "plan": plan,
                "iat": now,
                "nbf": now + nbf_offset,
                "exp": now + exp_offset,
                "jti": jti,
            }
        ).encode()
    )
    signature = _b64url(
        hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def _make_request(token: str | None) -> MagicMock:
    req = MagicMock()

    def _header_get(name: str, default: str = "") -> str:
        if name.lower() == PRINCIPAL_HEADER and token is not None:
            return token
        return default

    req.headers.get.side_effect = _header_get
    return req


def _resolve(dep, request):
    # Using ``asyncio.get_event_loop()`` here silently reused whatever loop the
    # previous test created, which in newer pytest+asyncio combinations leaves
    # the main thread without a current loop after a prior ``asyncio.run()``
    # block (see ``test_sse_concurrency.py``). Spin up a fresh loop every call
    # so the tests pass regardless of sibling test ordering.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(dep(request))
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _configure_secret(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "career_principal_hmac_secret", SECRET)


def test_accepts_valid_company_principal():
    token = _build_token(scope="company", company_id="company-1")
    dep = require_career_principal("company")

    principal = _resolve(dep, _make_request(token))

    assert principal.scope == "company"
    assert principal.actor_kind == "user"
    assert principal.actor_id == "user-1"
    assert principal.plan == "standard"
    assert principal.company_id == "company-1"
    assert principal.jti == "jti-1"


def test_accepts_ai_stream_without_company_id():
    token = _build_token(
        scope="ai-stream",
        actor_kind="guest",
        actor_id="guest-1",
        plan="guest",
        company_id=None,
    )
    dep = require_career_principal("ai-stream")

    principal = _resolve(dep, _make_request(token))

    assert principal.scope == "ai-stream"
    assert principal.company_id is None


def test_rejects_missing_header():
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(None))
    assert exc_info.value.status_code == 401


def test_rejects_bad_signature():
    token = _build_token(secret="wrong-secret")
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_wrong_audience():
    token = _build_token(aud="wrong-aud")
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_wrong_issuer():
    token = _build_token(iss="attacker")
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_expired_token():
    token = _build_token(exp_offset=-1)
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_not_yet_valid_token():
    token = _build_token(nbf_offset=3600)
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_scope_mismatch():
    token = _build_token(scope="ai-stream", company_id=None)
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 403


def test_rejects_company_scope_without_company_id():
    token = _build_token(scope="company", company_id=None)
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_unknown_actor_kind():
    token = _build_token(actor_kind="admin")
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_unknown_plan():
    token = _build_token(plan="enterprise")
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_rejects_unsupported_algorithm():
    token = _build_token(alg="none")
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 401


def test_fails_closed_when_secret_not_configured(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "career_principal_hmac_secret", "")
    token = _build_token()
    dep = require_career_principal("company")
    with pytest.raises(HTTPException) as exc_info:
        _resolve(dep, _make_request(token))
    assert exc_info.value.status_code == 503
