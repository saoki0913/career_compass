"""Privacy-first Sentry setup for FastAPI."""

from __future__ import annotations

from typing import Any

from app.utils.sanitizer import scrub_mapping, scrub_value
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


def init_sentry(settings: Any) -> bool:
    dsn = getattr(settings, "sentry_dsn", "")
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
        environment=getattr(settings, "sentry_environment", None) or getattr(settings, "environment", None),
        release=getattr(settings, "sentry_release", "") or None,
        send_default_pii=False,
        traces_sample_rate=float(getattr(settings, "sentry_traces_sample_rate", 0.05)),
        before_send=_before_send,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    )
    return True


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    del hint
    return scrub_mapping(event)


def scrub_sentry_value(value: Any) -> Any:
    return scrub_value(value)
