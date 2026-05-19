"""Privacy-first Sentry setup for FastAPI."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from app.utils.sanitizer import scrub_mapping, scrub_value
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

DROPPED_VALUE = "[DROPPED]"
SENTRY_SERVICE_NAME = "career-compass-backend"
SENTRY_RUNTIME = "fastapi"
_REQUEST_DROP_FIELDS = ("headers", "cookies", "data", "query_string")


def init_sentry(settings: Any) -> bool:
    dsn = _resolve_sentry_dsn(settings)
    if not dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning("Sentry DSN configured but sentry-sdk is not installed")
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=getattr(settings, "sentry_environment", None)
        or getattr(settings, "environment", None),
        release=getattr(settings, "sentry_release", "") or None,
        send_default_pii=False,
        traces_sample_rate=0.0,
        before_send=_before_send,
        before_send_transaction=_before_send_transaction,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    )
    service_tag = getattr(settings, "sentry_service", SENTRY_SERVICE_NAME)
    sentry_sdk.set_tag("service", service_tag or SENTRY_SERVICE_NAME)
    sentry_sdk.set_tag("runtime", SENTRY_RUNTIME)
    return True


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    del hint
    return scrub_mapping(_drop_fastapi_request_details(event))


def _before_send_transaction(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    del hint
    return scrub_mapping(_drop_fastapi_request_details(event))


def scrub_sentry_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return scrub_mapping(_drop_fastapi_request_details(value))
    return scrub_value(value)


def _resolve_sentry_dsn(settings: Any) -> str:
    return (
        getattr(settings, "sentry_fastapi_dsn", "")
        or getattr(settings, "backend_sentry_dsn", "")
        or getattr(settings, "sentry_dsn", "")
        or ""
    )


def _drop_fastapi_request_details(event: Mapping[str, Any]) -> dict[str, Any]:
    copied = deepcopy(dict(event))
    request = copied.get("request")
    if not isinstance(request, dict):
        return copied

    url = request.get("url")
    if isinstance(url, str) and url:
        request["url"] = _strip_url_query_and_fragment(url)

    for field in _REQUEST_DROP_FIELDS:
        request[field] = DROPPED_VALUE

    return copied


def _strip_url_query_and_fragment(url: str) -> str:
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
