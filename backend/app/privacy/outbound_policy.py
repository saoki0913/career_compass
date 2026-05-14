from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

DataSensitivity = Literal["public", "user_personal", "secret", "private_material"]
OutboundPurpose = Literal["embedding", "retrieval_query", "hyde", "query_expansion"]
RetentionClass = Literal["none", "ephemeral", "indexed"]
ProviderPolicy = Literal["public_allowed", "explicit_consent_required", "blocked"]

REDACTION = "[REDACTED]"

_EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)
_BEARER_RE = re.compile(r"Bearer\s+[a-zA-Z0-9._\-]{12,}", re.IGNORECASE)
_JWT_RE = re.compile(r"eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+")
_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?:api[_-]?key|secret|token|password|authorization|cookie)[\"'\s:=]+[a-zA-Z0-9._:/+=\-]{8,}",
    re.IGNORECASE,
)
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)")

_MAX_CHARS_BY_PURPOSE: dict[OutboundPurpose, int] = {
    "embedding": 8000,
    "retrieval_query": 400,
    "hyde": 400,
    "query_expansion": 400,
}


@dataclass(frozen=True)
class OutboundPolicyResult:
    text: str
    purpose: OutboundPurpose
    sensitivity: DataSensitivity
    retention: RetentionClass
    provider_policy: ProviderPolicy
    redaction_applied: bool
    truncated: bool


def prepare_outbound_text(
    text: str,
    *,
    purpose: OutboundPurpose,
    sensitivity: DataSensitivity = "user_personal",
    retention: RetentionClass = "ephemeral",
    provider_policy: ProviderPolicy = "explicit_consent_required",
    max_chars: int | None = None,
) -> OutboundPolicyResult:
    """Minimize and redact text before sending it to external AI providers."""
    limit = max_chars or _MAX_CHARS_BY_PURPOSE[purpose]
    value = text or ""
    redacted = _redact_direct_identifiers(value)
    truncated = len(redacted) > limit
    if truncated:
        redacted = redacted[:limit]
    return OutboundPolicyResult(
        text=redacted,
        purpose=purpose,
        sensitivity=sensitivity,
        retention=retention,
        provider_policy=provider_policy,
        redaction_applied=redacted != value,
        truncated=truncated,
    )


def _redact_direct_identifiers(text: str) -> str:
    result = text
    for pattern in (_EMAIL_RE, _BEARER_RE, _JWT_RE, _SECRET_ASSIGNMENT_RE, _PHONE_RE):
        result = pattern.sub(REDACTION, result)
    return result
