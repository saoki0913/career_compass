from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


EXPECTED_RAG_METRICS = {
    "rag_retrieval_requests_total": ("profile", "status"),
    "rag_retrieval_duration_seconds": ("stage",),
    "rag_expansion_cache_hits_total": ("cache_type",),
    "rag_rerank_invocations_total": ("model",),
    "rag_rerank_duration_seconds": ("model",),
    "rag_bm25_resync_total": ("trigger",),
    "rag_principal_missing_total": ("endpoint",),
    "rag_principal_mismatch_total": ("endpoint",),
    "rag_tenant_key_filter_miss_total": ("endpoint",),
}


def test_observability_doc_lists_rag_metric_contract() -> None:
    doc = Path("docs/ops/OBSERVABILITY.md").read_text(encoding="utf-8")

    assert "外部公開 `/metrics` endpoint は作らない" in doc
    for metric_name, labels in EXPECTED_RAG_METRICS.items():
        assert f"`{metric_name}`" in doc
        for label in labels:
            assert f"`{label}`" in doc


def test_rag_telemetry_exposes_expected_metric_names() -> None:
    from app.rag import telemetry

    for metric_name in EXPECTED_RAG_METRICS:
        metric_attr = metric_name.removesuffix("_total").removesuffix("_seconds")
        assert hasattr(telemetry, metric_attr)


def test_metrics_exporter_stays_internal_and_fail_open(monkeypatch) -> None:
    from app.rag import metrics_exporter

    calls: list[tuple[int, str]] = []

    def fake_start_http_server(port: int, addr: str) -> object:
        calls.append((port, addr))
        raise OSError("port already in use")

    @dataclass
    class DummySettings:
        rag_metrics_exporter_enabled: bool = True
        rag_metrics_exporter_host: str = "127.0.0.1"
        rag_metrics_exporter_port: int = 9464

    monkeypatch.setattr(metrics_exporter, "_started", False)
    monkeypatch.setattr(metrics_exporter, "_start_http_server", fake_start_http_server)

    assert metrics_exporter.start_metrics_exporter_once(DummySettings()) is False
    assert calls == [(9464, "127.0.0.1")]
    assert metrics_exporter._started is False
