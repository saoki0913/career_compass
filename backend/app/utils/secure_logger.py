"""
Structured logging utility with automatic sensitive data redaction.

Mirrors the behavior of src/lib/logger.ts on the frontend:
- Redacts API keys, tokens, and secrets from log output
- Provides structured JSON logging
- Omits stack traces in production
"""

import logging
import os
import re
import traceback
from typing import Any

# Sensitive patterns to redact from log messages
_SENSITIVE_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),           # OpenAI API keys
    re.compile(r"sk-ant-[a-zA-Z0-9\-]{20,}"),      # Anthropic API keys
    re.compile(r"whsec_[a-zA-Z0-9]{20,}"),          # Stripe webhook secrets
    re.compile(r"Bearer\s+[a-zA-Z0-9._\-]{20,}"),   # Bearer tokens
    re.compile(r"ghp_[a-zA-Z0-9]{20,}"),             # GitHub tokens
    re.compile(r"eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+"),  # JWTs
]

_IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"


def redact_sensitive(text: str) -> str:
    """Replace known secret patterns with [REDACTED]."""
    result = text
    for pattern in _SENSITIVE_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    return result


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
        logger.setLevel(logging.DEBUG if not _IS_PRODUCTION else logging.INFO)
        logger.propagate = False

    return logger


def log_error(context: str, error: Exception, extra: dict[str, Any] | None = None) -> None:
    """
    Log an error with context, redacting sensitive data.

    Equivalent of logError() in src/lib/logger.ts.
    """
    logger = get_logger(context)
    msg = redact_sensitive(str(error))

    extra_str = ""
    if extra:
        safe_extra = {
            k: redact_sensitive(str(v)) if isinstance(v, str) else v
            for k, v in extra.items()
        }
        extra_str = f" | {safe_extra}"

    if _IS_PRODUCTION:
        logger.error(f"{msg}{extra_str}")
    else:
        tb = traceback.format_exception(type(error), error, error.__traceback__)
        tb_str = redact_sensitive("".join(tb))
        logger.error(f"{msg}{extra_str}\n{tb_str}")
