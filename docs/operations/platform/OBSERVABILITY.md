# Observability

最終更新: 2026-05-05

この文書は就活Passの運用監視で使う主要メトリクスの正本。RAG は FastAPI 内部 exporter (`127.0.0.1:9464`) で Prometheus 互換メトリクスを公開し、外部公開 `/metrics` endpoint は作らない。

Phase 0 の外部監視と PII scrub 方針は `docs/operations/platform/MONITORING_SETUP.md` を正本にする。Sentry は Replay 完全 OFF、`sendDefaultPii=false`、`beforeSend` recursive scrub を前提に有効化する。

## RAG Metrics

| metric | type | labels | 用途 |
|---|---|---|---|
| `rag_retrieval_requests_total` | Counter | `profile`, `status` | retrieval 成功、空結果、backend 不在、例外の件数 |
| `rag_retrieval_duration_seconds` | Histogram | `stage` | semantic / expansion / fusion / bm25 / mmr / rerank の p95 監視 |
| `rag_expansion_cache_hits_total` | Counter | `cache_type` | expansion / HyDE cache の効き具合 |
| `rag_rerank_invocations_total` | Counter | `model` | cross-encoder rerank の発動数 |
| `rag_rerank_duration_seconds` | Histogram | `model` | reranker latency |
| `rag_bm25_resync_total` | Counter | `trigger` | BM25 再同期の頻度 |
| `rag_principal_missing_total` | Counter | `endpoint` | tenant principal 欠落 |
| `rag_principal_mismatch_total` | Counter | `endpoint` | tenant principal 不一致 |
| `rag_tenant_key_filter_miss_total` | Counter | `endpoint` | tenant filter miss |

## Alert Rules

- `rag_principal_mismatch_total > 0/h`: page。BFF署名、owner境界、攻撃試行を確認する。
- `rag_tenant_key_filter_miss_total / rag_retrieval_requests_total > 1% / 5m`: warn。tenant metadata と再取得経路を確認する。
- `histogram_quantile(0.95, rag_retrieval_duration_seconds{stage="rerank"}) > 2s / 10m`: warn。reranker model と fallback を確認する。
- `rag_retrieval_requests_total{status="error"} > 5 / 5m`: warn。Chroma / BM25 / embedding backend を確認する。

## Dashboard

Grafana dashboard JSON は `docs/operations/platform/grafana/rag-dashboard.json` に置く。dashboard は以下を見る。

- retrieval request rate by status
- p95 stage latency
- rerank invocation rate and p95
- expansion / HyDE cache hits
- tenant boundary counters
- BM25 resync rate

## Runbook

1. tenant boundary alert は、該当時間帯の BFF request id と FastAPI logs を突合する。
2. retrieval error spike は、Chroma collection、BM25 file、embedding provider status の順に確認する。
3. contextual retrieval default-on 判定前後は `backend/evals/rag/compare_contextual_retrieval.py` の出力を保存し、RAG plan に記録する。
