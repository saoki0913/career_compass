import os
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.utils.secure_logger import get_logger

router = APIRouter()
logger = get_logger(__name__)

SERVICE_NAME = "career-compass-backend"
BUILD_SHA = os.getenv("RAILWAY_GIT_COMMIT_SHA")
BUILD_TIME = os.getenv("BUILD_TIME")


@router.get("/health")
async def health_check():
    return {"status": "healthy"}


@router.get("/health/version")
async def version_check():
    try:
        from app.config import settings  # noqa: PLC0415

        environment = settings.logical_app_environment
    except Exception:
        logger.warning("Version check: settings unavailable", exc_info=True)
        environment = None

    return {
        "service": SERVICE_NAME,
        "sha": BUILD_SHA[:8] if BUILD_SHA else None,
        "build_time": BUILD_TIME or None,
        "environment": environment,
    }


@router.get("/health/ready")
async def readiness_check():
    started_at = time.monotonic()
    failed: list[str] = []
    warnings: list[str] = []
    circuits = {}

    try:
        from app.config import settings  # noqa: PLC0415
    except Exception:
        logger.warning("Readiness check failed: settings_loaded", exc_info=True)
        settings = None
        failed.append("settings_loaded")

    try:
        import httpx
        from app.utils.http_fetch import fetch_page_content
        from app.utils.web_search import hybrid_web_search

        bool(httpx and fetch_page_content and hybrid_web_search)
    except Exception:
        logger.warning("Readiness check failed: imports_ok", exc_info=True)
        failed.append("imports_ok")

    llm_key_configured = False
    if settings is not None:
        try:
            llm_key_configured = bool(
                settings.openai_api_key
                or settings.anthropic_api_key
                or settings.google_api_key
            )
        except Exception:
            logger.warning("Readiness check failed: llm_key_configured", exc_info=True)

    if not llm_key_configured:
        warnings.append("provider_credentials_unavailable")
        logger.warning("Readiness check warning: llm provider credentials unavailable")

    try:
        from app.utils.llm_client_registry import get_circuit_breaker

        for provider in ("anthropic", "openai"):
            cb = get_circuit_breaker(provider)
            if cb is not None:
                circuit_key = f"provider_{len(circuits) + 1}"
                circuits[circuit_key] = {
                    "state": "open" if cb.is_open() else "closed",
                    "failures": cb.failures,
                    "threshold": cb.threshold,
                }
                if cb.is_open():
                    warnings.append("provider_circuit_open")
        if circuits and all(c.get("state") == "open" for c in circuits.values() if c):
            warnings.append("all_llm_circuits_open")
    except Exception:
        logger.warning("Readiness check: circuit breaker status unavailable", exc_info=True)

    elapsed_ms = round((time.monotonic() - started_at) * 1000, 2)
    if failed:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "failed": failed,
                "warnings": warnings,
                "circuits": circuits,
                "elapsed_ms": elapsed_ms,
            },
        )

    return {
        "status": "ready",
        "warnings": warnings,
        "circuits": circuits,
        "elapsed_ms": elapsed_ms,
    }
