"""
Structured logging utility with automatic sensitive data redaction.

Mirrors the behavior of src/lib/logger.ts on the frontend:
- Redacts API keys, tokens, and secrets from log output
- Provides structured JSON logging
- Omits stack traces in production
"""

import logging
from typing import Any

from app.utils.sanitizer import redact_sensitive, scrub_exception, scrub_mapping


def _get_is_production() -> bool:
    from app.config import settings

    return settings.is_production


class _RedactingFormatter(logging.Formatter):
    """Logging formatter that automatically redacts sensitive data."""

    def format(self, record: logging.LogRecord) -> str:
        record.msg = redact_sensitive(str(record.msg))
        if record.args:
            record.args = tuple(
                redact_sensitive(str(a)) if isinstance(a, str) else a
                for a in record.args
            )
        formatted = super().format(record)
        return redact_sensitive(formatted)


def get_logger(name: str) -> logging.Logger:
    """
    Get a configured logger with automatic sensitive data redaction.

    Usage:
        from app.utils.secure_logger import get_logger
        logger = get_logger(__name__)
        logger.info("Processing request")
        logger.error("API call failed", exc_info=True)
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler()
        fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        handler.setFormatter(_RedactingFormatter(fmt, datefmt="%Y-%m-%d %H:%M:%S"))
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG if not _get_is_production() else logging.INFO)
        logger.propagate = False

    return logger


def log_error(context: str, error: Exception, extra: dict[str, Any] | None = None) -> None:
    """
    Log an error with context, redacting sensitive data.

    Equivalent of logError() in src/lib/logger.ts.
    """
    logger = get_logger(context)
    safe_error = scrub_exception(error)
    msg = str(safe_error.get("message") or type(error).__name__)

    extra_str = ""
    if extra:
        safe_extra = scrub_mapping(extra)
        extra_str = f" | {safe_extra}"

    if _get_is_production():
        logger.error(f"{msg}{extra_str}")
    else:
        tb_str = str(safe_error.get("stack") or "")
        logger.error(f"{msg}{extra_str}\n{tb_str}")
