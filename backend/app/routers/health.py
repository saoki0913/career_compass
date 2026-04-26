import logging
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    return {"status": "healthy"}


@router.get("/health/ready")
async def readiness_check():
    started_at = time.monotonic()
    failed: list[str] = []
    warnings: list[str] = []

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
        warnings.append("llm_key_configured")

    elapsed_ms = round((time.monotonic() - started_at) * 1000, 2)
    if failed:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "failed": failed,
                "warnings": warnings,
                "elapsed_ms": elapsed_ms,
            },
        )

    return {
        "status": "ready",
        "warnings": warnings,
        "checks": {"llm_key_configured": llm_key_configured},
        "elapsed_ms": elapsed_ms,
    }
