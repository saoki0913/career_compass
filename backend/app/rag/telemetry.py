from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterator

try:
    from prometheus_client import Counter as _counter_factory
    from prometheus_client import Histogram as _histogram_factory
except Exception:  # pragma: no cover - exporter dependency may be absent before install
    class _NoopMetric:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def labels(self, **_labels: object) -> "_NoopMetric":
            return self

        def inc(self, *_args: object, **_kwargs: object) -> None:
            return None

        def observe(self, *_args: object, **_kwargs: object) -> None:
            return None

    def _counter_factory(*_args: object, **_kwargs: object) -> _NoopMetric:
        return _NoopMetric()

    def _histogram_factory(*_args: object, **_kwargs: object) -> _NoopMetric:
        return _NoopMetric()

rag_retrieval_requests = _counter_factory(
    "rag_retrieval_requests_total",
    "RAG retrieval requests",
    ["profile", "status"],
)
rag_retrieval_duration = _histogram_factory(
    "rag_retrieval_duration_seconds",
    "RAG retrieval stage duration",
    ["stage"],
)
rag_expansion_cache_hits = _counter_factory(
    "rag_expansion_cache_hits_total",
    "RAG expansion cache hits",
    ["cache_type"],
)
rag_rerank_invocations = _counter_factory(
    "rag_rerank_invocations_total",
    "RAG reranker invocations",
    ["model"],
)
rag_rerank_duration = _histogram_factory(
    "rag_rerank_duration_seconds",
    "RAG reranker duration",
    ["model"],
)
rag_bm25_resync = _counter_factory(
    "rag_bm25_resync_total",
    "RAG BM25 resyncs",
    ["trigger"],
)
rag_principal_missing = _counter_factory(
    "rag_principal_missing_total",
    "RAG principal missing failures",
    ["endpoint"],
)
rag_principal_mismatch = _counter_factory(
    "rag_principal_mismatch_total",
    "RAG principal mismatch failures",
    ["endpoint"],
)
rag_tenant_key_filter_miss = _counter_factory(
    "rag_tenant_key_filter_miss_total",
    "RAG tenant-key filter misses",
    ["endpoint"],
)


@contextmanager
def record_stage_duration(stage: str) -> Iterator[None]:
    started = time.perf_counter()
    try:
        yield
    finally:
        rag_retrieval_duration.labels(stage=stage).observe(time.perf_counter() - started)
