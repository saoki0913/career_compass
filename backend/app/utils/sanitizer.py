"""Shared PII scrubbing helpers for logs and external telemetry."""

from __future__ import annotations

import math
import os
import re
import traceback
from collections.abc import Mapping, Sequence
from typing import Any

REDACTED_VALUE = "[REDACTED]"
DROPPED_VALUE = "[DROPPED]"
MAX_DEPTH_VALUE = "[MAX_DEPTH]"

DEFAULT_MAX_DEPTH = 6
DEFAULT_MAX_STRING_LENGTH = 2000

SENSITIVE_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"sk-ant-[a-zA-Z0-9\-]{20,}"),
    re.compile(r"whsec_[a-zA-Z0-9]{20,}"),
    re.compile(r"Bearer\s+[a-zA-Z0-9._\-]{12,}", re.IGNORECASE),
    re.compile(r"eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+"),
    re.compile(
        r"(?:better-auth\.session_token|guest_device_token|csrf_token|x-device-token|stripe-signature)=?[\"\s:]*[a-zA-Z0-9._:\-]{8,}",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:access|refresh|session|device|api|secret|token|password|authorization|cookie)[\"'\s:=]+[a-zA-Z0-9._:/+=\-]{8,}",
        re.IGNORECASE,
    ),
    re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE),
]

DROP_KEY_PATTERNS = [
    re.compile(r"^(authorization|cookie|set-cookie|x-device-token|x-career-principal|stripe-signature)$", re.IGNORECASE),
    re.compile(r"(password|secret|token|cookie|authorization|signature|credential|api[_-]?key)", re.IGNORECASE),
    re.compile(
        r"^(body|rawBody|requestBody|responseBody|query|prompt|completion|messages|content|answer|draft|essay|esText|gakuchika|motivation)$",
        re.IGNORECASE,
    ),
]
FREE_TEXT_KEY_PATTERN = re.compile(r"^(message|value)$", re.IGNORECASE)

_IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"


def redact_sensitive(text: str) -> str:
    """Replace known sensitive substrings with a stable redaction marker."""
    result = text
    for pattern in SENSITIVE_PATTERNS:
        result = pattern.sub(REDACTED_VALUE, result)
    return _truncate(result, DEFAULT_MAX_STRING_LENGTH)


def scrub_value(value: Any, *, max_depth: int = DEFAULT_MAX_DEPTH, max_string_length: int = DEFAULT_MAX_STRING_LENGTH) -> Any:
    """Return a JSON-safe value with sensitive keys dropped and strings redacted."""
    return _scrub_value(value, max_depth=max_depth, max_string_length=max_string_length, depth=0)


def scrub_mapping(value: Mapping[str, Any], *, max_depth: int = DEFAULT_MAX_DEPTH, max_string_length: int = DEFAULT_MAX_STRING_LENGTH) -> dict[str, Any]:
    """Scrub a mapping while preserving non-sensitive keys."""
    return {
        str(key): _scrub_value(item, max_depth=max_depth, max_string_length=max_string_length, depth=1, key=str(key))
        for key, item in value.items()
    }


def scrub_exception(error: BaseException) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": type(error).__name__,
        "message": redact_sensitive(str(error)),
    }
    if not _IS_PRODUCTION:
        result["stack"] = redact_sensitive("".join(traceback.format_exception(type(error), error, error.__traceback__)))
    return result


def _scrub_value(value: Any, *, max_depth: int, max_string_length: int, depth: int, key: str | None = None) -> Any:
    if key and _should_drop_key(key):
        return DROPPED_VALUE
    if key and isinstance(value, str) and FREE_TEXT_KEY_PATTERN.search(key):
        redacted = redact_sensitive(value)
        return redacted if redacted != value else "[SCRUBBED_TEXT]"
    if depth > max_depth:
        return MAX_DEPTH_VALUE
    if value is None:
        return None
    if isinstance(value, str):
        return _truncate(redact_sensitive(value), max_string_length)
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, BaseException):
        return scrub_exception(value)
    if isinstance(value, Mapping):
        return {
            str(child_key): _scrub_value(
                child_value,
                max_depth=max_depth,
                max_string_length=max_string_length,
                depth=depth + 1,
                key=str(child_key),
            )
            for child_key, child_value in value.items()
        }
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        return [
            _scrub_value(item, max_depth=max_depth, max_string_length=max_string_length, depth=depth + 1)
            for item in value
        ]
    return redact_sensitive(str(value))


def _should_drop_key(key: str) -> bool:
    return any(pattern.search(key) for pattern in DROP_KEY_PATTERNS)


def _truncate(text: str, max_length: int) -> str:
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}...[TRUNCATED]"
