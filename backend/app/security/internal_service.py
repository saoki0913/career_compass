import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, HTTPException, Request, status

from app.config import settings

INTERNAL_SERVICE_ISSUER = "next-bff"
INTERNAL_SERVICE_AUDIENCE = "career-compass-fastapi"
INTERNAL_SERVICE_SUBJECT = "next-bff"
LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _verify_hs256(token: str, secret: str) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token format") from exc

    signed = f"{header_b64}.{payload_b64}".encode()
    expected = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), signed, hashlib.sha256).digest()
    ).decode().rstrip("=")
    if not hmac.compare_digest(expected, signature_b64):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token signature")

    try:
        header = json.loads(_decode_base64url(header_b64))
        payload = json.loads(_decode_base64url(payload_b64))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token body") from exc

    if header.get("alg") != "HS256":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unsupported token algorithm")

    now = int(time.time())
    if payload.get("iss") != INTERNAL_SERVICE_ISSUER:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token issuer")
    if payload.get("aud") != INTERNAL_SERVICE_AUDIENCE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token audience")
    if payload.get("sub") != INTERNAL_SERVICE_SUBJECT or payload.get("service") != INTERNAL_SERVICE_SUBJECT:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token subject")

    exp = int(payload.get("exp") or 0)
    nbf = int(payload.get("nbf") or 0)
    if exp <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token expired")
    if nbf > now + 5:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token not yet valid")

    return payload


def require_internal_service(request: Request):
    secret = settings.internal_api_jwt_secret.strip()
    host = request.url.hostname or ""
    if not secret:
        if os.getenv("ENVIRONMENT", "development") == "production":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized",
            )
        if host in LOCAL_HOSTS:
            return {"service": INTERNAL_SERVICE_SUBJECT, "mode": "local-dev"}
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="internal service auth is not configured",
        )

    auth_header = request.headers.get("authorization", "").strip()
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing internal auth")

    token = auth_header[7:].strip()
    return _verify_hs256(token, secret)


InternalServiceDep = Depends(require_internal_service)
