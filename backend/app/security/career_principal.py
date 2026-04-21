"""
X-Career-Principal propagation (BFF → FastAPI).

The Next BFF mints an HS256 token carrying the authenticated *actor* (user or
guest), the *scope* of the downstream operation, the *plan*, and an optional
*company_id*. FastAPI endpoints that need actor-level authorization depend on
`require_career_principal(scope=...)` — the dependency verifies the signature
against ``settings.career_principal_hmac_secret``, enforces the scope claim,
and exposes the decoded principal to the handler.

This header is additive to the existing `Authorization: Bearer <internal-jwt>`
service authentication — the service JWT says "this request came from the BFF",
the career principal says "…on behalf of user X with scope Y".

See docs/security/principal_spec.md for the spec.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal

from fastapi import HTTPException, Request, status

from app.config import settings

PRINCIPAL_HEADER = "x-career-principal"
PRINCIPAL_ISSUER = "next-bff"
PRINCIPAL_AUDIENCE = "career-compass-fastapi"

CareerPrincipalScope = Literal["company", "ai-stream"]
CareerPrincipalActorKind = Literal["user", "guest"]
CareerPrincipalPlan = Literal["guest", "free", "standard", "pro"]
_VALID_SCOPES: frozenset[str] = frozenset(["company", "ai-stream"])
_VALID_ACTOR_KINDS: frozenset[str] = frozenset(["user", "guest"])
_VALID_PLANS: frozenset[str] = frozenset(["guest", "free", "standard", "pro"])


@dataclass(frozen=True)
class CareerPrincipal:
    """Decoded principal passed from BFF.

    Attributes:
        scope: The operation scope this principal was minted for.
        actor_kind: "user" for a signed-in account, "guest" for a device-token guest.
        actor_id: Stable identifier (user id / guest id).
        plan: Plan tier — drives tier-specific limits on the FastAPI side.
        company_id: Present for company-scoped operations, None for ai-stream
            tied to no company.
        jti: Unique token id (can be used for anti-replay if we add a cache).
        tenant_key: HMAC-derived key for ChromaDB/BM25 data isolation.
            None when TENANT_KEY_SECRET is not configured.
    """

    scope: CareerPrincipalScope
    actor_kind: CareerPrincipalActorKind
    actor_id: str
    plan: CareerPrincipalPlan
    company_id: str | None
    jti: str
    tenant_key: str | None = None


def compute_tenant_key(actor_kind: str, actor_id: str) -> str | None:
    """Derive a deterministic tenant key from the actor identity.

    Returns a 32-char hex string, or None if TENANT_KEY_SECRET is not set.
    """
    secret = settings.tenant_key_secret.strip()
    if not secret:
        return None
    msg = f"{actor_kind}:{actor_id}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _verify_signature(header_b64: str, payload_b64: str, signature_b64: str, secret: str) -> None:
    signed = f"{header_b64}.{payload_b64}".encode()
    expected = (
        base64.urlsafe_b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest())
        .decode()
        .rstrip("=")
    )
    if not hmac.compare_digest(expected, signature_b64):
        raise _unauthorized("invalid career principal signature")


def _decode_principal_token(token: str, secret: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:
        raise _unauthorized("invalid career principal format") from exc

    _verify_signature(header_b64, payload_b64, signature_b64, secret)

    try:
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:  # noqa: BLE001 - want to map *any* decode failure to 401
        raise _unauthorized("invalid career principal body") from exc

    if header.get("alg") != "HS256":
        raise _unauthorized("unsupported career principal algorithm")

    now = int(time.time())
    if payload.get("iss") != PRINCIPAL_ISSUER:
        raise _unauthorized("invalid career principal issuer")
    if payload.get("aud") != PRINCIPAL_AUDIENCE:
        raise _unauthorized("invalid career principal audience")

    exp = int(payload.get("exp") or 0)
    nbf = int(payload.get("nbf") or 0)
    if exp <= now:
        raise _unauthorized("career principal expired")
    if nbf > now + 5:
        raise _unauthorized("career principal not yet valid")

    return payload


def _extract_principal(request: Request, expected_scope: CareerPrincipalScope) -> CareerPrincipal:
    secret = settings.career_principal_hmac_secret.strip()
    if not secret:
        # Fail closed — this header is a defense-in-depth check, but once
        # endpoints depend on it, a missing secret is a misconfiguration.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="career principal is not configured",
        )

    raw_token = request.headers.get(PRINCIPAL_HEADER, "").strip()
    if not raw_token:
        raise _unauthorized("missing career principal")

    payload = _decode_principal_token(raw_token, secret)

    scope = payload.get("scope")
    if scope not in _VALID_SCOPES:
        raise _unauthorized("invalid career principal scope")
    if scope != expected_scope:
        raise _forbidden("career principal scope mismatch")

    actor = payload.get("actor") or {}
    actor_kind = actor.get("kind")
    actor_id = actor.get("id")
    if actor_kind not in _VALID_ACTOR_KINDS or not isinstance(actor_id, str) or not actor_id:
        raise _unauthorized("invalid career principal actor")

    plan = payload.get("plan")
    if plan not in _VALID_PLANS:
        raise _unauthorized("invalid career principal plan")

    company_id = payload.get("company_id")
    if company_id is not None and not isinstance(company_id, str):
        raise _unauthorized("invalid career principal company_id")

    if scope == "company" and not company_id:
        raise _unauthorized("career principal missing company_id for company scope")

    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti:
        raise _unauthorized("invalid career principal jti")

    return CareerPrincipal(
        scope=scope,  # type: ignore[arg-type]
        actor_kind=actor_kind,  # type: ignore[arg-type]
        actor_id=actor_id,
        plan=plan,  # type: ignore[arg-type]
        company_id=company_id,
        jti=jti,
        tenant_key=compute_tenant_key(actor_kind, actor_id),
    )


def require_career_principal(
    expected_scope: CareerPrincipalScope,
) -> Callable[[Request], CareerPrincipal]:
    """FastAPI dependency factory.

    Usage:

        @router.post("/rag/context")
        async def rag_context(
            principal: CareerPrincipal = Depends(require_career_principal("company")),
        ):
            ...

    For ``company`` scope, callers should additionally assert
    ``principal.company_id == path_company_id`` in the handler.
    """

    async def _dependency(request: Request) -> CareerPrincipal:
        return _extract_principal(request, expected_scope)

    return _dependency
