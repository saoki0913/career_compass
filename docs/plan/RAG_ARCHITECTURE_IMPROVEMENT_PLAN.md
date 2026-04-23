# RAG アーキテクチャ改善計画書

- **起票日**: 2026-04-17
- **上流レビュー**: [`docs/review/rag-architecture/2026-04-17-rag-design-review.md`](../review/rag-architecture/2026-04-17-rag-design-review.md)
- **スコープ**: P0 (3 項目) + P1 (5 項目) = 合計 8 項目の実装計画
- **付録**: P2-1 / P2-2 / P2-3 の先行スケッチ
- **方針**: 本書は RFC レベルの設計ドキュメント。実装判断は各項目の前提条件 (Gate) を満たしてから着手する。

---

## 0. Context

### 0.1 なぜこの計画が必要か

レビューで以下 3 リスクが特定された:

1. **R1 検索品質の labeled evaluation set が不在** — unit test 3 ケースのみで、以降のあらゆる改善が regression を防げない。
2. **R2 テナント越境の fail-open 設計** — `X-Career-Principal` HMAC は back-compat、`company_id` metadata filter だけでは bypass リスク。
3. **R3 可観測性不足** — `telemetry.py` は in-process Counter のみ、cache hit rate / rerank 発動率 / BM25 desync が測れない。

この 3 リスクを先に解消しない限り、P1 Quick win も P2 Strategic も**測定不能 / 境界未整備 / 事故時の発見が遅い**状態で進めることになる。本計画は **P0 を必ず先行、P1 はそれを受けた低工数改善**として構成する。

### 0.2 前提と依存

- `backend/app/utils/` 配下の大規模ファイル (`vector_store.py` 1648 行、`hybrid_search.py` 1417 行) への追加・変更は、CLAUDE.md の「500 行超ファイルは code-reviewer へ委譲」ルールに従う。
- secrets は `codex-company/.secrets/career_compass` を正本とし、実ファイルを Read しない (CLAUDE.md)。
- UI 変更は本計画に含まれない (本計画は backend + tests + docs のみ)。
- 本計画は実装を含まない。着手時は個別 PR で進め、本書をリファレンスに使う。

### 0.3 全体タイムライン (想定)

```
Week 1: P0-1 evaluation set 基盤 + P0-3 OTel metrics skeleton
Week 2: P0-1 golden set 50 件 seed + P0-2 W1 (metrics only) + P0-3 Prometheus exporter
Week 3: P0-2 W2 (2 endpoint fail-closed) + P1-3 BM25 atomic write + P1-4 secure_logger
Week 4: P0-2 W3 (全 endpoint fail-closed) + P1-1 reranker base v2 昇格
Week 5: P1-2 BM25 domain expansion 有効化 + P1-5 culture boost 調整
Week 6-: P2-1 / P2-2 / P2-3 (付録) の個別 planning へ移行
```

このタイムラインは目安。各項目の Gate を満たすまでは次に進まない。

---

## 1. P0-1: RAG Evaluation Set 新設

### 1.1 目的

「以降のあらゆる改善が regression を防げる状態」を作る。50+ の (query, expected_doc_ids) golden set と nDCG@{5,10} / MRR / Recall@{5,10} 計測器を新設し、`improve-search` baseline に紐付ける。

### 1.2 設計

#### 1.2.1 ディレクトリ構成

```
backend/tests/rag_eval/
  README.md                     # 使い方・更新手順
  golden/
    company_info_v1.jsonl       # 企業 RAG golden queries (50+ 件)
    reference_es_v1.jsonl       # (P2-1 用、Phase 2 で追加)
  metrics.py                    # nDCG@k, MRR, Recall@k 実装
  runner.py                     # golden set を読んで search 実行 → metrics 計算
  snapshots/
    baseline_2026-04-xx.json    # 改善前の baseline
    runs/                       # 各 PR 実行結果
```

#### 1.2.2 Golden query レコード schema

```json
{
  "query_id": "q-001",
  "query": "DeNA のエンジニア新卒採用条件は？",
  "company_id": "uuid-dena",
  "question_type": "basic",
  "query_type": "single-hop",   // single-hop / multi-hop / reasoning / fact-lookup
  "difficulty": "easy",          // easy / medium / hard
  "expected_doc_ids": ["chunk-123", "chunk-456"],
  "expected_source_urls": ["https://dena.com/jp/recruitment/..."],
  "ground_truth_answer": "...",  // LLM 評価用 (Faithfulness metric)
  "metadata": {
    "source": "manual",          // manual / production_log / synthetic
    "annotator": "saoki",
    "created_at": "2026-04-22",
    "license": "internal"
  }
}
```

#### 1.2.3 Query mix (Ragas 2025 ベストプラクティス準拠)

- 単純 lookup (fact): 30%
- 複数 hop (multi-hop): 20%
- 推論 (reasoning, 因果・比較): 20%
- 会話的 (conversational): 15%
- 誤字・省略・俗語: 10%
- 対応不可 (unanswerable): 5% (システムが「該当なし」を返せるかのテスト)

#### 1.2.4 シード手順

1. **Manual seed 30 件**: SME (開発チーム) が企業 RAG の中核ユースケースを手書き
2. **Synthetic 20+ 件**: Ragas TestsetGenerator で企業 5 社分から自動生成 → 人手レビューで silver → gold 昇格
3. **Production log enrichment** (随時): ES レビュー失敗ログから抽出、PII スクラブして追加

### 1.3 実装ステップ

- [ ] `backend/tests/rag_eval/README.md` で更新手順・PR ルールを文書化
- [ ] `metrics.py` に nDCG@k, MRR, Recall@k を pure Python で実装 (pytest 内から呼べる)
- [ ] `runner.py` は `dense_hybrid_search` (`backend/app/utils/hybrid_search.py` L946) を直接呼ぶ
- [ ] `golden/company_info_v1.jsonl` に 30 件を手書き seed
- [ ] Ragas で 20+ 件自動生成 → SME レビュー 1 round
- [ ] CI で PR 毎に `runner.py` 実行 → `snapshots/runs/pr-{N}.json` を出力 → baseline 比較
- [ ] `.github/workflows/rag-eval.yml` で nDCG@10 が baseline -2% を超えたら fail

### 1.4 測定指標

| metric | baseline 目標 | regression 閾値 |
|---|---|---|
| nDCG@5 | 初回測定で記録 | -2% 以内 |
| nDCG@10 | 同上 | -2% 以内 |
| MRR | 同上 | -3% 以内 |
| Recall@10 | 同上 | -3% 以内 |

### 1.5 Gate (着手条件)

- なし (最初の前提)

### 1.6 Rollback

- CI fail を override できる `rag-eval-skip` ラベルを用意 (非常時のみ)
- Snapshot ファイルは常に git 履歴に残し、誤判定時は baseline を旧版に巻戻せる

### 1.7 リスク

- R1: golden set の bias (easy query に偏ると production 品質を過大評価、Meta AI 研究で -25〜30% 差)。→ Query mix で強制分散
- R2: synthetic query の generator bias 継承。→ 必ず人手レビューを挟む
- R3: eval 実行コスト (OpenAI embedding + reranker)。→ 50 query × 月 1 回で月 $1 未満、CI 実行頻度は PR 毎で許容

### 1.8 関連ファイル

- `backend/app/utils/hybrid_search.py` (`dense_hybrid_search` L946)
- `backend/app/utils/vector_store.py` (`search_company_context_by_type` L819)
- `docs/testing/RAG_EVAL.md` (既存の評価フォーマット)
- 参考: [Complete Guide to RAG Evaluation (Maxim AI, 2025)](https://www.getmaxim.ai/articles/complete-guide-to-rag-evaluation-metrics-methods-and-best-practices-for-2025/)、[Ragas Golden Dataset (HuggingFace)](https://huggingface.co/datasets/dwb2023/ragas-golden-dataset)

---

## 2. P0-2: テナント越境 fail-closed 化 + `tenant_key` 導入

### 2.1 目的

`X-Career-Principal` の back-compat 動作を段階的に fail-closed に切り替え、ChromaDB metadata / BM25 ファイル名に `tenant_key` を追加して二重フィルタで cross-tenant leak を物理的に不可能にする。user memory 層 (P3-2) 導入の前提。

### 2.2 `tenant_key` スキーマ

```
tenant_key = HMAC-SHA256(TENANT_KEY_SECRET, f"{owner_type}:{owner_id}").hexdigest()[:32]
```

- `owner_type ∈ {"user", "guest"}` (Postgres `companies` の XOR 制約に対応)
- 出力: hex 32 文字 (16 byte)、`[0-9a-f]{32}` のみ → file-safe
- **なぜ HMAC**: 素の SHA-256 は offline rainbow table で逆引き可能、HMAC なら server-side secret が漏れない限り preimage 不可
- **なぜ 16 byte**: 1M tenant で衝突確率 ~3×10⁻²¹、ChromaDB metadata サイズ 32B/chunk で現実的
- **計算場所**: BFF (`src/lib/fastapi/career-principal.ts`) が正本、`principal.tenant_key` claim として FastAPI に伝播。`TENANT_KEY_SECRET` は BFF + FastAPI 両側に配布 (`sync-career-compass-secrets.sh` 管理)

### 2.3 Migration 手順

#### 2.3.1 ChromaDB metadata

新スキーマ:

```json
{
  "company_id": "<uuid>",
  "tenant_key": "<hex32>",
  "owner_type": "user",
  "source_url": "...",
  "content_type": "...",
  "ingest_session_id": "..."
}
```

Backfill スクリプト `backend/scripts/migrate_tenant_key.py` (新規):

1. Postgres から `companies` 全行を取得 (`id`, `userId`, `guestId`)
2. `owner_type / owner_id` を XOR 制約から決定し `tenant_key` を HMAC 計算
3. ChromaDB 全 collection を iterate し、`collection.update(ids=[...], metadatas=[{..., "tenant_key": ...}])` で in-place merge
4. idempotent: `tenant_key` が既にある chunk はスキップ
5. `--dry-run` フラグと chunk 件数レポート
6. **stage 環境で先に実行 → prod は手動実行**

Search 側 where 句切替:

```python
# 現行
collection.query(where={"company_id": company_id}, ...)

# 新 (TENANT_KEY_FILTER_ENABLED=true 時)
collection.query(
    where={"$and": [{"company_id": company_id}, {"tenant_key": tenant_key}]},
    ...
)
```

#### 2.3.2 BM25 ファイル

`backend/data/bm25/{company_id}.json` → `backend/data/bm25/{tenant_key}__{company_id}.json`

- `BM25Index.__init__(company_id, tenant_key)` シグネチャ拡張
- LRU cache key を `(tenant_key, company_id)` の tuple に変更 (cross-tenant cache hit を構造的に不可能化)
- migration script 内で Postgres lookup → rename batch を同時実行
- 読込は新 path → 旧 path (fallback) の順、旧 path 読み込み時に即 rename + 再保存

### 2.4 Principal fail-closed 切替タイムライン

| Week | 対象 endpoint | 動作 | Kill switch |
|---|---|---|---|
| W1 | 全 RAG endpoint | metrics のみ、fail-closed **off**。`rag_principal_missing_total{endpoint}` で「fail-closed にしたら何%落ちるか」測定 | N/A |
| W2 | `/company-info/rag/context` と `/company-info/rag/build` の 2 endpoint | warn log + fail-closed 化 | `CAREER_PRINCIPAL_REQUIRED=false` で即解除 |
| W3 | 全 RAG + SSE endpoint | fail-closed default on、`CAREER_PRINCIPAL_REQUIRED=true` を prod default | 同上 |
| W4 | `internal_service.py` の back-compat | service JWT 単独経路削除、principal 必須一本化 | rollback は W3 の flag で |

**切替判定**: W1 で `principal_missing_total` が 24h 移動平均 < 0.1% になるまで W2 に進まない。BFF 側の発行漏れを `src/lib/fastapi/client.ts` の全呼び出し経路 grep で洗い出し済みにしてから。

### 2.5 対象ファイル一覧

| ファイル | 変更内容 | 規模 |
|---|---|---|
| `backend/app/security/career_principal.py` | `CareerPrincipal.tenant_key` 追加、payload 検証 | +30 行 |
| `backend/app/security/internal_service.py` | `CAREER_PRINCIPAL_REQUIRED` 参照、W3 以降で 401 | +20 行 |
| `backend/app/routers/company_info.py` | 全 RAG endpoint に `Depends(require_career_principal("company"))`、`_assert_principal_owns_company` 展開 | +100 行 |
| `backend/app/routers/motivation.py` / `es_review.py` | 同上 | +50 行 ずつ |
| `backend/app/utils/vector_store.py` | `store_chunks / search / delete` で `tenant_key` metadata write/filter | +80 行 |
| `backend/app/utils/bm25_store.py` | `BM25Index.__init__(company_id, tenant_key)`、cache key tuple、ファイル名、legacy fallback | +60 行 |
| `backend/scripts/migrate_tenant_key.py` | 新規、Postgres → chroma update + BM25 rename の backfill CLI | 新規 200 行 |
| `backend/app/config.py` | `career_principal_required: bool`, `tenant_key_secret: str` 追加 | +10 行 |
| `src/lib/fastapi/career-principal.ts` | principal payload に `tenant_key` 計算 (Node `crypto`) | +20 行 |
| `docs/ops/SECURITY.md` | V-1 fail-closed 完了記述、L70-72 back-compat 注記削除 | docs |
| `docs/architecture/TENANT_ISOLATION_AUDIT.md` | Critical/High 解消済みマーク、`tenant_key` 記述追加 | docs |
| `backend/tests/security/test_tenant_isolation.py` | 新規、下記攻撃シナリオ S1–S4 網羅 | 新規 300 行 |

### 2.6 攻撃シナリオと検証

| # | シナリオ | 現状 | 対策後 | テスト |
|---|---|---|---|---|
| S1 | principal 未送信 + 既知 `company_id` で RAG 読む | 通る | W3 以降 401 | `test_principal_missing_returns_401` |
| S2 | 他 tenant の `tenant_key` を推測 | N/A | HMAC で不可 | `test_tenant_key_not_guessable` + `test_wrong_tenant_key_returns_empty` |
| S3 | BM25 ファイル path traversal (`tenant_key = "../../../etc/passwd"`) | N/A | `^[0-9a-f]{32}$` 正規表現で reject | `test_tenant_key_charset_enforced` |
| S4 | `principal.company_id ≠ path.company_id` | 3 endpoint でのみ検知 | 全 endpoint で 403 | `test_principal_company_id_mismatch_returns_403` |

### 2.7 監視指標 (P0-3 と連携)

| metric | type | labels | 用途 |
|---|---|---|---|
| `rag_principal_missing_total` | Counter | `endpoint` | W1 観察用、W2 以降は攻撃/BFF bug 検出 |
| `rag_principal_mismatch_total` | Counter | `endpoint` | 攻撃痕跡 or BFF bug 検出 |
| `rag_tenant_key_filter_miss_total` | Counter | `endpoint` | backfill 漏れ or 攻撃兆候 |
| `rag_tenant_key_backfill_progress` | Gauge | — | backfill 済み chunk 比率、W3 前に 100% |
| `bm25_legacy_path_read_total` | Counter | — | W4 で 0 確認 |

**アラート閾値**:
- `rag_principal_mismatch_total` > 0/h → **page**
- `rag_tenant_key_filter_miss_total / rag_retrieval_total` > 1%/5min → warn
- `bm25_legacy_path_read_total` が W4 以降に > 0 → page

### 2.8 Gate (着手条件)

- P0-3 の Counter 追加のみ先行 (Prometheus exporter 前でも可)
- `TENANT_KEY_SECRET` が dev/stage/prod に配備済み (`sync-career-compass-secrets.sh --check`)
- BFF 側の principal 発行漏れゼロ (事前チェックリスト完了)

### 2.9 Rollback

- **即時** (deploy 不要): `CAREER_PRINCIPAL_REQUIRED=false` + `TENANT_KEY_FILTER_ENABLED=false` に env flip + 再起動
- **データ互換性**: `tenant_key` は metadata に残しても filter off で現行動作、BM25 旧パスは W4 まで保持
- **例外**: W4 の back-compat 削除後は code revert + redeploy 必要

### 2.10 Open Questions

1. `TENANT_KEY_SECRET` の rotation (dual-secret 方式?)
2. guest → user 昇格時の `tenant_key` 再生成 or 破棄
3. `reference_es` (P2-1) での `tenant_key` 扱い (`global-reference` 固定 or 指導者別)
4. ChromaDB version の `$and` 互換性 (current version 確認要)

---

## 3. P0-3: OpenTelemetry Metrics 導入

### 3.1 目的

`telemetry.py` を in-process Counter から Prometheus/OpenTelemetry exporter に切り替え、cache hit rate / p95 latency / BM25 desync を実測可能にする。P0-2 の監視指標と合流。

### 3.2 設計

#### 3.2.1 メトリクス命名規則 (OTel semantic conventions 2025 準拠)

- OTel 側は**単位サフィックスなし**、Prometheus exporter で `_total` / `_seconds` 等が自動付与される
- GenAI/RAG 向けの semantic conventions を踏襲 (`rag.*` prefix)

| OTel name | type | 単位 | labels | Prometheus 名 |
|---|---|---|---|---|
| `rag.retrieval.requests` | Counter (Sum) | {requests} | `profile`, `status` | `rag_retrieval_requests_total` |
| `rag.retrieval.duration` | Histogram | s | `stage` (semantic/bm25/rerank/mmr) | `rag_retrieval_duration_seconds` |
| `rag.expansion.cache.hits` | Counter | {hits} | `cache_type` (expansion/hyde) | `rag_expansion_cache_hits_total` |
| `rag.rerank.invocations` | Counter | {invocations} | `model` | `rag_rerank_invocations_total` |
| `rag.rerank.duration` | Histogram | s | `model` | `rag_rerank_duration_seconds` |
| `rag.bm25.resync` | Counter | {resyncs} | `trigger` | `rag_bm25_resync_total` |
| `rag.chroma.chunks` | Gauge (UpDownCounter) | {chunks} | — (集約) | `rag_chroma_chunks` |
| `rag.principal.missing` | Counter | {requests} | `endpoint` | `rag_principal_missing_total` (P0-2 連携) |
| `rag.principal.mismatch` | Counter | {requests} | `endpoint` | `rag_principal_mismatch_total` (P0-2 連携) |
| `rag.tenant_key.filter_miss` | Counter | {misses} | `endpoint` | `rag_tenant_key_filter_miss_total` (P0-2 連携) |

Histogram bucket は OTel SDK default (5ms, 10ms, 25ms, 50ms, 75ms, 100ms, 250ms, 500ms, 750ms, 1s, 2.5s, 5s, 7.5s, 10s) を流用。

#### 3.2.2 モジュール分割

```
backend/app/utils/telemetry.py       # 旧: in-process Counter
                                     # ↓ 新規移行
backend/app/rag/telemetry.py         # OTel metrics 実装 (P2-3 と合流する package 配置)
backend/app/observability/exporter.py # Prometheus exporter 設定
```

本計画段階では `backend/app/utils/telemetry.py` を**拡張**し、`opentelemetry-api` / `opentelemetry-exporter-prometheus` への依存を追加。package 分割 (P2-3) 時に `app.rag.telemetry` に移動する前提。

#### 3.2.3 Prometheus 公開 endpoint

- FastAPI に `/metrics` を追加 (`prometheus-client` の `make_asgi_app()`)
- 認証: `require_internal_service` で BFF / 内部監視のみ許可
- 配信: Grafana Cloud or 社内 Prometheus (運用側で選定)

### 3.3 実装ステップ

- [ ] 依存追加: `pyproject.toml` or `requirements.txt` に `opentelemetry-api`, `opentelemetry-sdk`, `opentelemetry-exporter-prometheus`, `prometheus-client`
- [ ] `backend/app/utils/telemetry.py` に OTel Meter 初期化、Counter / Histogram / Gauge の factory 関数を追加
- [ ] `backend/app/utils/hybrid_search.py` の各 stage (`semantic_search`, `_keyword_search`, `_rerank_with_cross_encoder`, `rrf_merge_results`, `_apply_mmr`) で duration を Histogram に記録
- [ ] `backend/app/utils/bm25_store.py` の sync / update で Counter、`_expansion_cache` / `_hyde_cache` で hit/miss を記録
- [ ] `backend/app/main.py` に `/metrics` endpoint を追加
- [ ] `docs/ops/OBSERVABILITY.md` (新規) で metric 一覧と alerting ルールを文書化
- [ ] Grafana dashboard の JSON を `docs/ops/grafana/rag-dashboard.json` に commit

### 3.4 測定指標 (メタ)

- cache hit rate ≥ 30% (expansion), ≥ 40% (HyDE) → docs で主張している「-20〜30% cost 削減」の実測
- rerank 発動率 30〜50% (`_should_rerank` の variance gate の効果測定)
- BM25 resync 回数 = ingest 回数 ± 0 (desync なし)
- p95 retrieval duration < 2s

### 3.5 Gate

- P0-1 の evaluation set が動き始めていること (metric 正当性の cross-check に使う)

### 3.6 Rollback

- `OTEL_ENABLED=false` で新規 exporter を止め、in-process Counter だけを動かす fallback を残す
- `/metrics` endpoint は feature flag で disable 可能

### 3.7 リスク

- R1: OTel SDK 初期化コストで cold start 遅延 → Lazy init で回避
- R2: cardinality 爆発 (company_id を label に入れると危険) → label は profile / stage / endpoint など低 cardinality のみ

### 3.8 関連ファイル

- `backend/app/utils/telemetry.py`
- `backend/app/utils/hybrid_search.py` (全 stage で instrumenting)
- `backend/app/main.py` (`/metrics` endpoint)
- 参考: [OTel Metrics Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/metrics/)、[Prometheus/OpenMetrics Compatibility](https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/)

---

## 4. P1-1: Reranker Model を base v2 へ昇格

### 4.1 目的

`hotchpotch/japanese-reranker-small-v2` (70M, JQaRA avg 0.879) → `hotchpotch/japanese-reranker-base-v2` (130M, avg 0.893) に昇格し、nDCG@10 を +1.4〜4.2pt 向上。**3 行変更で最もコスパの良い改善**。

### 4.2 設計

#### 4.2.1 モデル選定

- **採用**: `hotchpotch/japanese-reranker-base-v2` (130M)
  - JQaRA avg 0.893 (+1.4pt vs small v2)
  - Latency: 1 クエリあたり ~40–80ms 追加 (SSE 全体数秒の中で許容)
- **見送り**: `cl-nagoya/ruri-v3-reranker-310m` (avg 0.917, SOTA)
  - 310M でメモリ圧迫、Replit / Vercel serverless 環境で startup 遅延
- **フォールバック**: GPU/ONNX 非対応環境で `japanese-reranker-xsmall-v2` (30M) へ env toggle

#### 4.2.2 変更点

```python
# backend/app/utils/reranker.py L46
DEFAULT_CROSS_ENCODER_MODEL = "hotchpotch/japanese-reranker-base-v2"
```

環境変数で override 可能に:

```python
# backend/app/config.py
cross_encoder_model: str = Field(default="hotchpotch/japanese-reranker-base-v2")
cross_encoder_fallback: str = Field(default="hotchpotch/japanese-reranker-xsmall-v2")
```

### 4.3 実装ステップ

- [ ] P0-1 evaluation set で small v2 の baseline を取得 (nDCG@5/10, MRR, Recall@10)
- [ ] base v2 に差し替え → 同一 query set で再測定
- [ ] 差分を `backend/tests/rag_eval/snapshots/reranker-upgrade.md` にレポート
- [ ] p95 latency が +100ms 以内に収まっていれば昇格、超えていれば xsmall v2 にフォールバック
- [ ] `docs/features/COMPANY_RAG.md` のモデル一覧を更新

### 4.4 測定指標

- nDCG@10 +1.4pt 以上 (JQaRA ベンチ期待値)
- ES レビューの retry 率が +5pp 以内 (`docs/testing/ES_REVIEW_QUALITY.md` gate)
- rerank 単体 p95 latency +80ms 以内

### 4.5 Gate

- P0-1 evaluation set の baseline snapshot 取得済み
- P0-3 で `rag.rerank.duration` Histogram が動いていること

### 4.6 Rollback

- `CROSS_ENCODER_MODEL` env を `japanese-reranker-small-v2` に戻す
- モデルキャッシュは残すのでコールドスタート影響なし

### 4.7 リスク

- R1: HF model download 時間 → Docker build 時に pre-fetch してコンテナイメージに焼き込む
- R2: latency 増で SSE user UX 悪化 → P95 監視で閾値超えたら自動 xsmall フォールバック (`_should_rerank` 内で model swap)

### 4.8 関連ファイル

- `backend/app/utils/reranker.py` L46
- `backend/app/config.py`
- `backend/app/utils/hybrid_search.py` (`_rerank_with_cross_encoder`)

---

## 5. P1-2: BM25 書き込みで Domain Expansion 有効化

### 5.1 目的

既存の `tokenize_with_domain_expansion` (複合語展開) が**死蔵**されている問題の解消。`bm25_store.py` L73 の `add_document` で base `tokenize(text)` のみが呼ばれており、`domain_terms.json` の社名・職種名・学科名の展開が index 側に効いていない。

### 5.2 設計

```python
# 現行: backend/app/utils/bm25_store.py L73
tokens = tokenize(text)

# 変更後
tokens = tokenize_with_domain_expansion(text)
```

さらに `japanese_tokenizer.py` の `tokenize_with_domain_expansion` が現状どう実装されているか確認し、

- 書き込み側 (`add_document`): expansion 有効 (複合語も検索対象にする)
- 検索側 (`hybrid_search._keyword_search`): expansion 有効 (同じ分割ルール)

で**両側同じ tokenizer を通す**ことを保証する (mismatch 防止)。

### 5.3 実装ステップ

- [ ] `japanese_tokenizer.py` の `tokenize_with_domain_expansion` シグネチャ確認、単体テストがあれば通す
- [ ] `bm25_store.py` L73 の差替え
- [ ] `_keyword_search` 側が `tokenize` を呼んでいる箇所も `tokenize_with_domain_expansion` に統一
- [ ] **全既存 BM25 index を再構築** (`scripts/rebuild_bm25.py` 新規、or `update_bm25_index` を全 company 分 loop)
- [ ] P0-1 evaluation set で before/after 測定

### 5.4 測定指標

- 社名 recall +5–8pp (golden query のうち「社名含む query」subset)
- 職種名 precision +3–5pp (「職種名 query」subset)
- nDCG@10 全体 +2〜3pt

### 5.5 Gate

- P0-1 evaluation set 完成
- `domain_terms.json` の語彙が就活ドメインで妥当であることを SME 確認

### 5.6 Rollback

- `bm25_store.py` の差分 revert → BM25 index 再構築 (rollback cost)
- `USE_DOMAIN_EXPANSION` env flag で toggle 可能にする案も検討

### 5.7 リスク

- R1: 再構築中の検索劣化 → stage で先に rebuild + 品質確認、prod は maintenance window
- R2: `domain_terms.json` の登録ミスが recall/precision 両方に影響 → 変更前に SME レビュー必須

### 5.8 関連ファイル

- `backend/app/utils/bm25_store.py` L73
- `backend/app/utils/japanese_tokenizer.py` (`tokenize_with_domain_expansion`)
- `backend/app/utils/hybrid_search.py` (`_keyword_search` L621)
- `backend/data/domain_terms.json`

---

## 6. P1-3: BM25 ファイル Atomic Write

### 6.1 目的

現状 `bm25_store.py` L192 の `open("w")` 直書きは途中 crash で 0 byte 化リスク。`tempfile` + `os.replace()` で atomic rename に変える。低コスト高 safety。

### 6.2 設計

```python
# 現行 (擬似コード)
with open(path, "w") as f:
    json.dump(data, f)

# 変更後
import tempfile, os
dir_name = os.path.dirname(path)
with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False) as tmp:
    json.dump(data, tmp)
    tmp.flush()
    os.fsync(tmp.fileno())
    tmp_path = tmp.name
os.replace(tmp_path, path)  # atomic on POSIX
```

### 6.3 実装ステップ

- [ ] `bm25_store.py` L190-195 を atomic write に差替
- [ ] `add_documents` 末尾で明示 `build` を呼び、lazy build の pathological spike を解消
- [ ] `tests/test_bm25_atomic_write.py` で crash simulation (途中 kill) を書く
- [ ] Windows 環境での `os.replace` 挙動も確認 (POSIX と同じ atomic semantics が保証される)

### 6.4 測定指標

- 0 byte 化障害の発生数 = 0 (長期監視)
- `add_documents` 後の初回 search での p99 latency < 200ms (spike 解消)

### 6.5 Gate

- P0-3 metrics で BM25 sync の現状 baseline 取得

### 6.6 Rollback

- 差分を revert (副作用なし)

### 6.7 リスク

- R1: `tempfile` の NFS/CIFS 環境での atomic 保証 → 本番は local disk のため問題なし
- R2: 旧ファイルが読み込まれた後の race → `os.replace` は atomic なので新規 read は必ず完全 file を取得

### 6.8 関連ファイル

- `backend/app/utils/bm25_store.py` L190-195

---

## 7. P1-4: secure_logger 統一

### 7.1 目的

`bm25_store.py` L195, L236 などに残る `print()` を `secure_logger` に置換。構造化ログ化、prod の可視性向上、機密情報混入防止。

### 7.2 設計

- `backend/app/utils/secure_logger.py` の `get_logger(__name__)` を import
- `print("Warning: ...")` → `logger.warning("...")`、`print("Loaded ...")` → `logger.info("...")`
- message 内に PII (userId, guestId, 本文 snippet) を**混入しない**ルールを徹底 (`secure_logger` の redact 機能を使う)

### 7.3 実装ステップ

- [ ] `grep -rn "print(" backend/app/utils/` で残存箇所を全列挙
- [ ] 各箇所を `logger.{debug,info,warning,error}` に置換
- [ ] `backend/app/utils/japanese_tokenizer.py` L25 の `print("Warning: fugashi...")` も同様
- [ ] lint rule `ruff` で `print` 禁止 ルールを `backend/app/utils/**` に追加

### 7.4 測定指標

- `grep -rn "print(" backend/app/utils/` が 0 件
- prod ログに構造化 record が入り、`level=warning` で検索可能

### 7.5 Gate

- なし (独立タスク、P2-3 の Phase 3 に合流させる選択肢もあり)

### 7.6 Rollback

- 差分 revert のみ

### 7.7 リスク

- 低。ログ出力の変更のみで機能影響なし。

### 7.8 関連ファイル

- `backend/app/utils/bm25_store.py` L195, L236
- `backend/app/utils/japanese_tokenizer.py` L25
- `backend/app/utils/secure_logger.py`

---

## 8. P1-5: Culture Boost 1.6 → 1.4 への調整

### 8.1 目的

`CONTENT_TYPE_BOOSTS["culture"]["employee_interviews"] = 1.6` (`hybrid_search.py` L76) が乗算ブーストで過大の疑い。社風クエリで IR 資料 / 中期経営計画が妥当な場合の取りこぼしを削減。

### 8.2 設計

- `hybrid_search.py` L76: `"employee_interviews": 1.6` → `"employee_interviews": 1.4`
- `ceo_message`: 1.4 → 1.3 (相対バランス維持)
- RRF 後 (`_apply_content_type_boost` L1031) / rerank 前 (L1168) の 2 回適用箇所にコメント追加 (二重適用の意図を明示)

### 8.3 実装ステップ

- [ ] P0-1 evaluation set の「culture query subset」で before/after 測定
- [ ] `CONTENT_TYPE_BOOSTS` の数値を更新
- [ ] 2 回適用箇所に `# NOTE: intentional double-apply for initial + merged results` コメント追加
- [ ] 単体テスト `test_content_type_boost_no_double_application.py` を追加 (initial_results と merged で別箇所適用であることを assert)

### 8.4 測定指標

- culture query subset の nDCG@10 が低下しない (+0pt 維持)
- IR / 中期計画が妥当な culture query (例: 「風通しの良さを KPI 化」) での Recall@10 +5pp

### 8.5 Gate

- P0-1 evaluation set 完成 (culture query を 10 件以上含む前提)

### 8.6 Rollback

- 数値を 1.6 に戻すだけ

### 8.7 リスク

- R1: culture query の SME 分類が主観的 → 複数 SME で inter-annotator agreement を測る
- R2: 他 profile (deadline: 1.6, business: 1.5) への波及欲求 → 本計画では culture のみ調整、他は P0-1 の結果次第で別 PR

### 8.8 関連ファイル

- `backend/app/utils/hybrid_search.py` L48-97, L1031, L1168

---

## 9. 横断: Verification と Rollout Strategy

### 9.1 PR レビューゲート

各 PR は以下を必ず満たす:

1. P0-1 evaluation set で nDCG@10 baseline -2% 以内
2. `backend/tests/` 全 pass (`pytest -x`)
3. `docs/` を本計画書の該当項目にリンクする
4. Rollback 手順が PR description に明記
5. 該当する場合、metric が追加され Grafana dashboard も更新

### 9.2 デプロイ順序

1. **Week 1-2**: P0-1 / P0-3 → 観測基盤が先
2. **Week 2-3**: P0-2 W1 (metrics only) で現状把握 → W2 (2 endpoint) で部分 fail-closed
3. **Week 3**: P1-3 / P1-4 (安全性改善) を atomic commit
4. **Week 4**: P0-2 W3 (全 endpoint fail-closed) + P1-1 (reranker 昇格)
5. **Week 5**: P1-2 (BM25 domain expansion) + P1-5 (culture boost)
6. **Week 6**: P0-2 W4 (back-compat 削除) + P1-1 後処理 (ruri-310m への再検討開始)

### 9.3 横断リスク

| # | リスク | 緩和策 |
|---|---|---|
| X1 | P0-1 golden set の品質不足で以降の判断が誤る | Ragas pipeline + SME review 2 round、production log で継続更新 |
| X2 | P0-2 W3 で principal 発行漏れが露呈し全 RAG endpoint 停止 | W1/W2 で徹底観測、24h < 0.1% を Gate |
| X3 | P0-3 の cardinality 爆発で Prometheus OOM | label は profile/stage/endpoint のみ、company_id は gauge 集約 |
| X4 | P1-1 reranker 昇格で latency 悪化 | xsmall v2 フォールバックを env flag で即適用 |
| X5 | P1-2 BM25 rebuild 中の検索劣化 | stage で事前 rebuild + 品質確認 |

---

## 10. Open Questions (計画全体)

1. `TENANT_KEY_SECRET` の rotation 手順 (dual-secret 方式を採用するか)
2. guest → user 昇格時の `tenant_key` 再生成 vs 破棄 (Product 判断)
3. Prometheus 配信先 (Grafana Cloud / 社内 / Datadog) の選定
4. P0-1 golden set の license (社内機密 / 匿名化して公開可)
5. ruri-v3-reranker-310m への再昇格トリガ (GPU 環境整備 vs ONNX 変換)
6. P1-2 で `tokenize_with_domain_expansion` を両側に入れた後、`domain_terms.json` の保守責任者 (SME 指名)

---

## 11. 付録 A: P2-1 参考 ES Embedding 化 (先行スケッチ)

### 11.1 目的

参考 ES を「quality scoring 用テキスト」から「設問タイプ + 業界で検索可能な知識資産」へ昇格。ES レビューの personalize 軸を獲得し、**企業 RAG とは別 collection に物理分離**して cross-tenant leak の単一障害点化を避ける。

### 11.2 設計スケッチ

- **新 collection**: `reference_es__{provider}__{model}`、`company_id` は絶対に付けない (混同防止)
- **metadata schema**: `question_type`, `industry`, `es_id`, `chunk_index`, `char_max`, `source_hash`, `anonymized: true`, `ingest_session_id`, `source_version`
- **chunk 戦略**: 1 ES = 1 chunk を既定。`len(text) > 600` のみ `JapaneseTextChunker(chunk_size=400, chunk_overlap=80)` で分割
- **ingest script**: `backend/scripts/ingest_reference_es.py` (新規)、sha256 による `source_hash` で idempotent、`ingest_session_id = UUIDv7`
- **検索 API**: `retrieve_reference_es_semantic(question_type, *, industry, char_max, query_text, top_k=5)` を `reference_es.py` に追加 (既存 `load_reference_examples` は破壊しない)
- **prompt 連携**: `es_review.py` の prompt 組み立てに「参考 ES samples」slot を新設、**企業根拠 context とは連結しない**
- **feature flag**: `REFERENCE_ES_RAG_ENABLED=false` で default off、shadow 1 週間後に on

### 11.3 測定指標

- `nDCG@5 >= 0.75`, `Recall@10 >= 0.85` (参考 ES eval set)
- ES レビュー下流: retry 率 -10% 以上
- latency: 追加 p95 <= 80ms (別 collection で並列発火)
- cost: embed 1 回あたり 0.3M tokens 未満 ($0.01 前後/回)

### 11.4 リスク

- R1: 参考 ES の逆流出 (prompt injection) → 入力防御 + LLM 出力類似度ガード
- R2: 企業 RAG との混同 → collection prefix `reference_es__` を grep + assertion
- R3: 法務判断保留 → feature flag ガード、off で既存 scoring のみ動作

### 11.5 依存

- **前提**: P0-1 / P0-2 完了 + 著作権・利用許諾の法務 OK
- **並行可**: P1-1 reranker 昇格とは独立

### 11.6 詳細プラン参照

`/Users/saoki/.claude/plans/rag-web-askuserquestiontool-nested-raccoon-agent-a5bd6ee8881c0b1d0.md` (rag-engineer 作成、P2-1 + P2-2 の実装スケッチ)

---

## 12. 付録 B: P2-2 Contextual Retrieval 導入 (先行スケッチ)

### 12.1 目的

Anthropic Contextual Retrieval (2024) を chunker に組込み、chunk 毎に「この chunk が document 全体のどこか」を 50 token で前置。retrieval failure -35〜49% (英語ベンチ) を日本語 / 就活 RAG で検証、+5pt nDCG@10 を狙う。

### 12.2 設計スケッチ

- **新クラス** `ContextualChunker(base, summarizer, mode)` を `text_chunker.py` に追加
  - `mode="metadata_only"`: chunk.text は変えず metadata 側に prefix 保持、埋め込み時のみ「prefix + text」を embed 対象に、BM25 は chunk.text のみ (BM25 トークン分布副作用回避)
  - `mode="prefix_text"`: text 冒頭にも prefix 付与 (A/B 用)
- **新モジュール** `backend/app/utils/document_summarizer.py` (新規)
  - `DocumentSummarizer.summarize(document_text, *, meta) -> str`
  - 使用モデル: Claude Haiku 4.5 or Gemini Flash (cost 理由)、**prompt cache 必須** (document 単位で 1 回、N chunk に使い回し)
  - 出力: 50 tokens 目安「この抜粋は [company_name] の [content_type] / [section_heading] より。文書主題: [one_line_topic]」
- **shadow collection**: `company_info__{provider}__{model}__ctx` で dual-write、feature flag `CONTEXTUAL_RETRIEVAL_ENABLED` で rollback 可

### 12.3 コスト試算

- 月間 100 社 × 10 URL = 1,000 documents
- Haiku 4.5 で 1 document 3k token 入力 → `$0.25/M × 3k = $0.00075`、要約 200 token 出力 → `$1.25/M × 200 = $0.00025`
- document 単位 $0.001 × 1,000 = **月 $1 前後**、prompt cache 90% で **$0.1 オーダー**

### 12.4 測定指標

- nDCG@10 +5pt 以上 (P0-1 golden set before/after)
- 多文書企業 (≥10 source) subset で Recall@10 +10pp
- ingest p95 +200ms 以内、検索 p95 不変 (prefix は書込時のみ)

### 12.5 リスク

- R1: 要約ハルシネーション → 抽出寄り prompt、サンプル 50 document 人手 QA
- R2: BM25 との齟齬 → metadata_only mode 既定で BM25 無汚染
- R3: summarizer 障害 → flag off で従来経路に即時フォールバック

### 12.6 依存

- **前提**: P0-1 / P0-3 完了 (cache hit / summarizer latency 観測可能)
- **並行可**: P1-1, P1-2

### 12.7 詳細プラン参照

上記と同じ `/Users/saoki/.claude/plans/rag-web-askuserquestiontool-nested-raccoon-agent-a5bd6ee8881c0b1d0.md`

---

## 13. 付録 C: P2-3 `backend/app/rag/` パッケージ分割 (先行 RFC)

### 13.1 目的

`vector_store.py` (1648 行) と `hybrid_search.py` (1417 行) の god module 化を解消。責務を 5 + 6 ブロックに分解し、`backend/app/rag/` パッケージに再配置。

### 13.2 新構成

```
backend/app/rag/
  __init__.py            # ~40 行  公開 API re-export
  config.py              # ~200 行  CONTENT_TYPE_BOOSTS, profile, fetch_k 定数
  cache.py               # ~150 行  expansion / HyDE TTL cache
  telemetry.py           # ~250 行  OTel metrics (P0-3 と合流)
  ids.py                 # ~180 行  session/source hash, collection 名
  ingest.py              # ~400 行  store_company_info, store_full_text_content
  admin.py               # ~220 行  get_company_rag_status, delete_* 系
  bm25_sync.py           # ~150 行  schedule_bm25_update, update_bm25_index
  search/
    __init__.py          #   ~20 行
    dense.py             # ~300 行  semantic_search, dense_hybrid_search
    keyword.py           # ~200 行  _keyword_search, _merge
    fusion.py            # ~350 行  RRF, MMR, content boost, priority source
    rerank.py            # ~220 行  cross-encoder wrapper
  context.py             # ~400 行  get_enhanced_context_for_review_*
```

### 13.3 Migration Phase (6 段階)

1. **Phase 1**: skeleton 作成 (影響ゼロ)
2. **Phase 2**: `config.py` 移動 (純粋定数)
3. **Phase 3**: `cache.py` 独立 (P1-4 secure_logger と合流)
4. **Phase 4**: `search/*` 移動 (最大リスク、4 サブ PR に分割)
5. **Phase 5**: `ingest.py` / `admin.py` / `bm25_sync.py` / `context.py` 移動、legacy を thin re-export に縮小、90 日 DeprecationWarning
6. **Phase 6**: 呼び出し元切替 (routers/tests/evals)、legacy ファイル削除

### 13.4 最大の障壁

`vector_store.py` (L627, L933) と `hybrid_search.py` で**双方向 lazy import** が既に成立。依存方向を `ingest/admin/bm25_sync → search → context` の DAG に固定する。

### 13.5 依存

- **P0-3 を Phase 1 で先行**: telemetry.py を分割時点で rag/ に入れることで、search pipeline 分割後の metric 名変更コストを削減
- **P0-2 を Phase 5 前に**: ingest / admin の metadata schema に `tenant_key` を足す変更は B/C ブロックに集中、Phase 5 と同 PR に束ねる
- **P1-4 を Phase 3/4 に合流**: cache / search の secure_logger 切替を同時に

### 13.6 詳細プラン参照

`/Users/saoki/.claude/plans/rag-web-askuserquestiontool-nested-raccoon-agent-ab6bc83fe1bed539d.md` (architect 作成、責務マッピング + 6 Phase Migration + 後方互換)

---

## 14. 付録 D: P0-2 詳細 RFC 参照

P0-2 の詳細設計 (tenant_key スキーマ、HMAC 選択理由、16 byte 選択理由、backfill 手順、攻撃シナリオ 4 種のテスト、4-week fail-closed timeline、rollback) は以下に別ファイルで展開済み:

`/Users/saoki/.claude/plans/rag-web-askuserquestiontool-nested-raccoon-agent-a81220a595bdcd3f9.md` (security-auditor 作成)

本計画書の §2 は要約のみ。実装着手時はこの RFC を参照。

---

## 15. 参考資料

### 外部ベンチマーク / ベストプラクティス

- [Anthropic: Contextual Retrieval (2024)](https://www.anthropic.com/news/contextual-retrieval) — P2-2 の根拠
- [Mem0: Production-Ready AI Agents (arXiv 2504.19413)](https://arxiv.org/html/2504.19413v1) — P3-2 (将来) の根拠
- [MMTEB (ICLR 2025, arXiv 2502.13595)](https://arxiv.org/abs/2502.13595) — embedding モデル比較
- [BAAI/bge-reranker-v2-m3 (HuggingFace)](https://huggingface.co/BAAI/bge-reranker-v2-m3) — P1-1 代替候補
- [OpenTelemetry Metrics Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/metrics/) — P0-3 命名規則
- [Prometheus / OpenMetrics Compatibility (OTel)](https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/) — P0-3 exporter
- [Complete Guide to RAG Evaluation (Maxim AI, 2025)](https://www.getmaxim.ai/articles/complete-guide-to-rag-evaluation-metrics-methods-and-best-practices-for-2025/) — P0-1 の golden dataset 構築
- [Ragas Golden Dataset (HuggingFace)](https://huggingface.co/datasets/dwb2023/ragas-golden-dataset) — P0-1 参考実装
- [AutoRAG BM25 documentation](https://marker-inc-korea.github.io/AutoRAG/nodes/retrieval/bm25.html) — SudachiPy 採用事例

### 社内ドキュメント

- [`docs/review/rag-architecture/2026-04-17-rag-design-review.md`](../review/rag-architecture/2026-04-17-rag-design-review.md) — 本計画の上流レビュー
- [`docs/features/COMPANY_RAG.md`](../features/COMPANY_RAG.md) — 既存 RAG アーキ詳細
- [`docs/testing/RAG_EVAL.md`](../testing/RAG_EVAL.md) — 既存評価フォーマット (P0-1 の出発点)
- [`docs/testing/ES_REVIEW_QUALITY.md`](../testing/ES_REVIEW_QUALITY.md) — ES レビュー品質 gate (P1-1 / P2-1 の下流影響監視)
- [`docs/ops/SECURITY.md`](../ops/SECURITY.md) — V-1 principal 分離 (P0-2 の前提)
- [`docs/architecture/TENANT_ISOLATION_AUDIT.md`](../architecture/TENANT_ISOLATION_AUDIT.md) — テナント越境監査 (P0-2 の対象)

---

## 16. Change Log

- 2026-04-17: 初版起票。P0 (3) + P1 (5) + P2 先行スケッチ (3) + 付録。

---

**本計画書の原則**:
1. 実装は本書では行わない。着手時は個別 PR で本書を参照。
2. P0 を満たしてから P1、P1 を満たしてから P2 に進む。
3. 各項目の Gate / Rollback / リスクを満たせない場合、本書を更新してから実装する。
4. `docs/review/` との整合性を常に保つ (本計画完了時にレビューを更新)。
