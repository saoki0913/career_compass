from __future__ import annotations

from typing import Protocol

from app.utils.secure_logger import get_logger

try:
    from prometheus_client import start_http_server as _start_http_server
except Exception:  # pragma: no cover - optional dependency guard
    _start_http_server = None

logger = get_logger(__name__)
_started = False


class MetricsExporterSettings(Protocol):
    rag_metrics_exporter_enabled: bool
    rag_metrics_exporter_host: str
    rag_metrics_exporter_port: int


def start_metrics_exporter_once(settings: MetricsExporterSettings) -> bool:
    """Start the internal Prometheus exporter once per process.

    Returns True only when this call starts a new server. Bind failures are
    fail-open so app startup is not blocked by local port reuse.
    """
    global _started
    if _started or not settings.rag_metrics_exporter_enabled:
        return False
    if _start_http_server is None:
        logger.warning("RAG metrics exporter disabled: prometheus_client unavailable")
        return False
    try:
        _start_http_server(
            int(settings.rag_metrics_exporter_port),
            addr=str(settings.rag_metrics_exporter_host),
        )
    except OSError as exc:
        logger.warning("RAG metrics exporter not started: %s", exc)
        return False
    _started = True
    logger.info(
        "RAG metrics exporter started on %s:%s",
        settings.rag_metrics_exporter_host,
        settings.rag_metrics_exporter_port,
    )
    return True
