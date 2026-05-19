"""Redis key helpers shared by FastAPI cache and lease code."""

from __future__ import annotations

from urllib.parse import quote

from app.config import settings

MAX_KEY_PART_LENGTH = 200


def _safe_part(value: object) -> str:
    return quote(str(value), safe="")[:MAX_KEY_PART_LENGTH]


def _namespace() -> str:
    configured = settings.redis_namespace.strip()
    logical_env = settings.logical_app_environment
    if configured and configured != logical_env:
        raise RuntimeError(
            f"REDIS_NAMESPACE must match APP_ENV ({logical_env}); got {configured}"
        )
    return logical_env


def redis_key(domain: str, *parts: object) -> str:
    return ":".join(["cc", _namespace(), domain, *(_safe_part(part) for part in parts)])


def redis_pattern(domain: str, *parts: object) -> str:
    encoded_parts = [
        "*" if part == "*" else _safe_part(part)
        for part in parts
    ]
    return ":".join(["cc", _namespace(), domain, *encoded_parts])
