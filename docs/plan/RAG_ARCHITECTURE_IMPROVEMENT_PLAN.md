# RAG アーキテクチャ改善計画書

- **起票日**: 2026-04-17
- **最終更新**: 2026-04-27
- **上流レビュー**: [`docs/review/rag-architecture/2026-04-17-rag-design-review.md`](../review/rag-architecture/2026-04-17-rag-design-review.md)
- **スコープ**: P0 (3 項目) + P1 (5 項目) + P2-1 / P2-2 / P2-3 の初期実装
- **方針**: 本書は RFC レベルの設計ドキュメント兼、実装済み差分の正本。実装済み範囲と残件を分けて管理する。

---

## 0. Context

### 0.0 2026-04-27 実装サマリ

今回の実装で、RAG の正本パッケージを `backend/app/rag/` に移し、旧 `backend/app/utils/vector_store.py` / `backend/app/utils/hybrid_search.py` は削除した。長期 re-export shim は置かず、routers / tests / evals は `app.rag.*` import に移行済み。

実装済み:

- P0-3: `app.rag.telemetry` と `app.rag.metrics_exporter` を追加し、FastAPI startup で `127.0.0.1:9464` の内部 Prometheus exporter を起動できるようにした。外部 `/metrics` endpoint は採用しない。
- P1-1: reranker 既定値は `hotchpotch/japanese-reranker-base-v2`。
- P1-2: BM25 書き込み側 / 検索側の keyword extraction で domain expansion を使う。
- P1-3 / P1-4: BM25 atomic write と `secure_logger` 統一は既存実装を確認済み。
- P1-5: culture profile の `employee_interviews=1.4` / `ceo_message=1.3` を反映。
- P2-1: `reference_es__{provider}__{model}` collection と `retrieve_reference_es_semantic()` を追加。`company_id` / `tenant_key` metadata は持たせない。
- P2-2: `ContextualChunker` を追加し、`metadata_only` を既定にした contextual dual-write 用 collection (`company_info__...__ctx`) を追加。
- P2-3: `backend/app/rag/` パッケージを追加し、`vector_store.py` / `hybrid_search.py` / `ids.py` / `chunking.py` / `reference_es.py` / telemetry 系を配置。

残件:

- P0-1 は closeout 済み。golden set 52 件、strict tenant 評価 corpus 再投入 CLI、baseline integrity gate、実検索 baseline を追加した。
- Grafana dashboard は未実装。
- P2-1 の ingest CLI と参考 ES eval set は未実装。現時点では feature flag `REFERENCE_ES_RAG_ENABLED=false` が既定。
- P2-2 は shadow dual-write まで。検索の既定切替は `CONTEXTUAL_RETRIEVAL_ENABLED` の評価後に行う。

### 0.1 なぜこの計画が必要か

レビューで以下 3 リスクが特定された:

1. **R1 検索品質の labeled evaluation set が不在** — unit test 3 ケースのみで、以降のあらゆる改善が regression を防げない。
2. **R2 テナント越境の fail-open 設計** — `X-Career-Principal` HMAC は back-compat、`company_id` metadata filter だけでは bypass リスク。
3. **R3 可観測性不足** — `telemetry.py` は in-process Counter のみ、cache hit rate / rerank 発動率 / BM25 desync が測れない。

この 3 リスクを先に解消しない限り、P1 Quick win も P2 Strategic も**測定不能 / 境界未整備 / 事故時の発見が遅い**状態で進めることになる。本計画は **P0 を必ず先行、P1 はそれを受けた低工数改善**として構成する。

### 0.2 前提と依存

- RAG 正本は `backend/app/rag/`。旧 `backend/app/utils/vector_store.py` / `backend/app/utils/hybrid_search.py` は保持しない。
- secrets は `codex-company/.secrets/career_compass` を正本とし、実ファイルを Read しない (CLAUDE.md)。
- UI 変更は本計画に含まれない (本計画は backend + tests + docs のみ)。
- P0-1/P0-2 は 2026-04-26 時点で一部実装済み。以後は「新設」ではなく、棚卸し済みの不足分を埋める形で進める。

### 0.2.1 2026-04-26 棚卸し結果

- P0-1: `backend/evals/rag/` と `backend/tests/rag_eval/` は存在済み。2026-04-27 に `company_info_v1.jsonl` 52 件、`baseline_v1.json`、`seed_eval_corpus.py`、baseline integrity test、RAG E2E trigger 追従まで完了。実検索 baseline は nDCG@5(src)=0.8184 / MRR(src)=0.8205 / Hit@5(src)=0.8846。
- P0-2: `CareerPrincipal.tenant_key`、BM25 tenant-aware path、Chroma metadata、基本 isolation tests は存在済み。2026-04-26 の実装方針として既存 RAG データは移行せず破棄・再取得し、company_id-only fallback と移行スクリプトは残さない。
- 既存 RAG データは開発段階のため保持しない。strict 化後に必要な企業情報を再取得する。

### 0.3 全体タイムライン (想定)

```
Week 1: P0-2 strict tenant 配線 + 既存 RAG データ削除/再取得 + P0-1 現状同期
Week 2: P0-1 golden set 拡充 + P0-3 metrics skeleton
Week 3: P0-3 Prometheus exporter + P1-3 BM25 atomic write + P1-4 secure_logger
Week 4: P1-1 reranker base v2 昇格
Week 5: P1-2 BM25 domain expansion 有効化 + P1-5 culture boost 調整
Week 6-: P2-1 / P2-2 / P2-3 の shadow / eval / rollout を個別に進める
```

このタイムラインは目安。各項目の Gate を満たすまでは次に進まない。

---

## 1. P0-1: RAG Evaluation Set 新設

### 1.1 目的

「以降のあらゆる改善が regression を防げる状態」を作る。50+ の (query, expected_doc_ids) golden set と nDCG@{5,10} / MRR / Recall@{5,10} 計測器を新設し、`improve-search` baseline に紐付ける。

### 1.2 設計

#### 1.2.1 ディレクトリ構成

```
backend/evals/rag/
  evaluate_retrieval.py         # golden set を読んで search 実行 → metrics 計算
  generate_golden_set.py        # tenant-aware BM25 から candidate 生成
  seed_eval_corpus.py           # tenant-aware BM25 から strict tenant Chroma/BM25 を再投入
  golden/
    company_info_v1.jsonl       # 企業 RAG golden queries (52 件)
    baseline_v1.json            # 実検索 baseline
backend/tests/rag_eval/
  test_*                        # metric / generator / seed / package contract / baseline integrity
```

#### 1.2.2 Golden query レコード schema

```json
{
  "query_id": "q-001",
  "query": "DeNA のエンジニア新卒採用条件は？",
  "company_id": "uuid-dena",
  "query_type": "single-hop",   // single-hop / multi-hop / reasoning / conversational / fact-lookup
  "difficulty": "easy",          // easy / medium / hard
  "gold_chunk_ids": ["chunk-123", "chunk-456"],
  "gold_sources": ["https://dena.com/jp/recruitment/..."],
  "ground_truth_answer": "...",  // LLM 評価用 (Faithfulness metric)
  "metadata": {
    "source": "auto_bm25",       // auto_bm25 / manual / synthetic
    "review_status": "candidate",
    "target_content_type": "new_grad_recruitment"
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

1. **BM25 auto seed 50 件以上**: tenant-aware BM25 から候補生成。`metadata.review_status="candidate"` として保存
2. **Manual review**: SME が candidate を見直し、確認済みだけ `reviewed` に昇格
3. **Synthetic enrichment** (将来): Ragas TestsetGenerator は依存・費用・レビュー工程が増えるため、今回は導入しない
4. **Production log enrichment** (随時): ES レビュー失敗ログから抽出、PII スクラブして追加

### 1.3 実装ステップ

- [x] `docs/testing/RAG_EVAL.md` で更新手順・PR ルールを文書化
- [x] `evaluate_retrieval.py` に nDCG@k, MRR, Recall@k を pure Python で実装 (pytest 内から呼べる)
- [x] `evaluate_retrieval.py` は `dense_hybrid_search` を直接呼び、JSONL 行の `tenant_key` または `--tenant-key` fallback を渡す
- [x] `generate_golden_set.py` を tenant-aware BM25 から 50 件以上の candidate を作れる形に更新
- [x] `golden/company_info_v1.jsonl` を 50 件以上に拡張
- [x] `seed_eval_corpus.py` で strict tenant Chroma/BM25 を local 評価環境に再投入
- [x] CI で JSONL integrity / baseline integrity / metric / generator / seed 単体テストを実行
- [x] 実検索 `golden_eval` を実行し、`--save-baseline` で baseline を明示更新

### 1.4 測定指標

| metric | baseline 目標 | regression 閾値 |
|---|---|---|
| nDCG@5(src) | 0.8184 | -2% 以内 |
| MRR(src) | 0.8205 | -3% 以内 |
| Hit@5(src) | 0.8846 | -2% 以内 |
| Recall@5(src) | 0.8558 | -3% 以内 |

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

- `backend/app/rag/hybrid_search.py` (`dense_hybrid_search`)
- `backend/app/rag/vector_store.py` (`search_company_context_by_type`)
- `docs/testing/RAG_EVAL.md` (既存の評価フォーマット)
- 参考: [Complete Guide to RAG Evaluation (Maxim AI, 2025)](https://www.getmaxim.ai/articles/complete-guide-to-rag-evaluation-metrics-methods-and-best-practices-for-2025/)、[Ragas Golden Dataset (HuggingFace)](https://huggingface.co/datasets/dwb2023/ragas-golden-dataset)

---

## 2. P0-2: テナント越境 fail-closed 化 + `tenant_key` strict 配線

### 2.1 目的

`X-Career-Principal` を必須化済みの RAG endpoint で、FastAPI が計算した `tenant_key` を ChromaDB / BM25 / RAG cache / status / delete の全経路に通し、`company_id` だけの cross-tenant hit をなくす。user memory 層 (P3-2) 導入の前提。

2026-04-26 時点では段階的 rollout ではなく **strict 化を優先**する。既存 RAG データは開発データのため移行せず、必要に応じて削除して再取得する。

### 2.2 `tenant_key` スキーマ

```
tenant_key = HMAC-SHA256(TENANT_KEY_SECRET, f"{owner_type}:{owner_id}").hexdigest()[:32]
```

- `owner_type ∈ {"user", "guest"}` (Postgres `companies` の XOR 制約に対応)
- 出力: hex 32 文字 (16 byte)、`[0-9a-f]{32}` のみ → file-safe
- **なぜ HMAC**: 素の SHA-256 は offline rainbow table で逆引き可能、HMAC なら server-side secret が漏れない限り preimage 不可
- **なぜ 16 byte**: 1M tenant で衝突確率 ~3×10⁻²¹、ChromaDB metadata サイズ 32B/chunk で現実的
- **計算場所**: FastAPI (`backend/app/security/career_principal.py`) が、BFF から受けた署名済み actor (`user` / `guest`) と `TENANT_KEY_SECRET` から計算する。BFF principal token の wire shape は変更しない。

### 2.3 現在の実装状態

#### 2.3.1 実装済み

- `backend/app/security/career_principal.py`: `CareerPrincipal.tenant_key` と `compute_tenant_key()` 実装済み。
- `backend/app/utils/bm25_store.py`: `{tenant_key}__{company_id}.json` path、tenant-aware cache key、unique tempfile + fsync + atomic replace 実装済み。company-only legacy fallback と pickle fallback は撤去済み。
- `backend/app/rag/vector_store.py`: full-text store / search / BM25 rebuild の一部で `tenant_key` 引数対応済み。
- `backend/tests/security/test_tenant_isolation.py`: BM25/Chroma/search/tenant key 計算の基本検証あり。

#### 2.3.2 2026-04-26 実装スライス

- RAG endpoint で `principal.tenant_key` を必須化し、未設定なら 503。
- `company_info_rag_service.py` / `company_info_ingest_service.py` へ `tenant_key` を引数として通す。
- `vector_store.py` の `has_company_rag` / `get_company_rag_status` / `delete_company_rag*` / context cache / direct-source context を tenant scoped にする。
- `hybrid_search.py` の `hybrid_search()` にも `tenant_key` を必須で渡す。
- `RAGCache` の key に `tenant_key` を含め、同じ `company_id + query` でも tenant 間で混ざらないようにする。

### 2.4 既存データの扱い

今回は既存 RAG データを保持しない。理由:

- まだ開発段階で、既存 RAG データを壊してもユーザー影響がない。
- migration 互換を維持すると strict 化の境界が曖昧になる。
- tenant strict 後に再取得すれば `tenant_key` 付き metadata / BM25 path が自然に作られる。

運用手順:

1. 必要なら開発環境の ChromaDB/BM25 既存データを削除する。
2. `TENANT_KEY_SECRET` を設定した状態でアプリを起動する。
3. 企業情報を再取得し、RAG metadata / BM25 path に `tenant_key` が入ることを確認する。

### 2.5 対象ファイル一覧

| ファイル | 変更内容 | 規模 |
|---|---|---|
| `backend/app/routers/company_info.py` | 共通 `require_tenant_key()` を使い、RAG endpoint から service へ tenant_key 配線 | 小 |
| `backend/app/routers/company_info_rag_service.py` | build/context/status/delete/gap-analysis に tenant_key 引数追加 | 中 |
| `backend/app/routers/company_info_ingest_service.py` | upload/crawl store 経路に tenant_key 引数追加 | 小 |
| `backend/app/rag/vector_store.py` | status/delete/search/cache/direct-source を tenant scoped に統一 | 中 |
| `backend/app/rag/hybrid_search.py` | legacy `hybrid_search()` に tenant_key 引数追加 | 小 |
| `backend/app/utils/cache.py` | RAG cache key / invalidation を tenant-aware 化 | 小 |
| `backend/app/utils/rag_gap_analyzer.py` | gap analysis に tenant_key 引数追加 | 小 |
| `backend/tests/security/test_tenant_isolation.py` | status/delete/cache/tenant必須 helper の回帰テスト追加 | 小 |

### 2.6 攻撃シナリオと検証

| # | シナリオ | 現状 | 対策後 | テスト |
|---|---|---|---|---|
| S1 | principal に tenant_key がない | 一部経路で company_id fallback | 503 | `test_rag_endpoint_requires_tenant_key` |
| S2 | 他 tenant の `tenant_key` を推測 | N/A | HMAC で不可 | `test_tenant_key_not_guessable` + `test_wrong_tenant_key_returns_empty` |
| S3 | status / delete が `company_id` だけで他 tenant に当たる | 残存 | tenant scoped | `test_status_is_tenant_scoped`, `test_delete_by_urls_is_tenant_scoped`, `test_delete_all_is_tenant_scoped` |
| S4 | cache key が company/query のみで tenant 間 hit | 残存 | tenant scoped | `test_rag_cache_key_includes_tenant_key` |

### 2.7 監視指標 (P0-3 と連携)

| metric | type | labels | 用途 |
|---|---|---|---|
| `rag_principal_missing_total` | Counter | `endpoint` | tenant strict 化後の攻撃/BFF bug 検出 |
| `rag_principal_mismatch_total` | Counter | `endpoint` | 攻撃痕跡 or BFF bug 検出 |
| `rag_tenant_key_filter_miss_total` | Counter | `endpoint` | tenant 不一致・攻撃兆候 |

**アラート閾値**:
- `rag_principal_mismatch_total` > 0/h → **page**
- `rag_tenant_key_filter_miss_total / rag_retrieval_total` > 1%/5min → warn

### 2.8 Gate (着手条件)

- `TENANT_KEY_SECRET` がローカル実行環境に設定済み。
- 既存 RAG データは削除または再取得前提でよい。
- `pytest backend/tests/security/test_tenant_isolation.py -q` が PASS。
- `pytest backend/tests/rag_eval/test_rag_eval_regression.py::test_golden_set_integrity -q` が PASS。

### 2.9 Rollback

- code revert + 再デプロイ。
- 開発データは再取得前提のため、RAG データ復元は不要。
- production/staging で既存 RAG を保持する運用に切り替える場合は、本計画とは別に明示的な migration RFC を作成する。

### 2.10 Open Questions

1. `TENANT_KEY_SECRET` の rotation (dual-secret 方式?)
2. guest → user 昇格時は既存 guest RAG を破棄し、user tenant で再取得する
3. `reference_es` (P2-1) での `tenant_key` 扱い (`global-reference` 固定 or 指導者別)
4. ChromaDB version の `$and` 互換性 (current version 確認要)

---

## 3. P0-3: RAG Metrics 導入

### 3.1 目的

`app.rag.telemetry` を追加し、cache hit rate / p95 latency / BM25 desync を実測可能にする。外部公開 endpoint は作らず、内部 Prometheus exporter を必要な環境だけで有効化する。

### 3.2 設計

#### 3.2.1 メトリクス命名規則

- `prometheus-client` の `Counter` / `Histogram` を直接使う。
- label は低 cardinality の `profile`, `status`, `stage`, `cache_type`, `endpoint` に限定する。

| metric name | type | 単位 | labels | 備考 |
|---|---|---|---|---|
| `rag_retrieval_requests_total` | Counter | requests | `profile`, `status` | 検索結果 status |
| `rag_retrieval_duration_seconds` | Histogram | s | `stage` | semantic / bm25 / rerank / mmr |
| `rag_expansion_cache_hits_total` | Counter | hits | `cache_type` | expansion / hyde |
| `rag_rerank_invocations_total` | Counter | invocations | `model` | reranker 発動数 |
| `rag_rerank_duration_seconds` | Histogram | s | `model` | reranker latency |
| `rag_bm25_resync_total` | Counter | resyncs | `trigger` | BM25 再同期 |
| `rag_principal_missing_total` | Counter | requests | `endpoint` | P0-2 連携 |
| `rag_principal_mismatch_total` | Counter | requests | `endpoint` | P0-2 連携 |
| `rag_tenant_key_filter_miss_total` | Counter | misses | `endpoint` | P0-2 連携 |

Histogram bucket は `prometheus-client` の既定を使う。

#### 3.2.2 モジュール分割

```
backend/app/rag/telemetry.py         # RAG metrics 定義
backend/app/rag/metrics_exporter.py  # 内部 Prometheus exporter 起動
```

`prometheus-client` がない環境では no-op metric にフォールバックし、RAG 本体の起動を妨げない。

#### 3.2.3 Prometheus 内部 exporter

- FastAPI startup で `start_metrics_exporter_once(settings)` を呼ぶ。
- 既定は `RAG_METRICS_EXPORTER_ENABLED=false`。
- 有効化時は `RAG_METRICS_EXPORTER_HOST=127.0.0.1` / `RAG_METRICS_EXPORTER_PORT=9464` を使う。
- bind 失敗時は warning に落とし、アプリ起動は継続する。

### 3.3 実装ステップ

- [x] 依存追加: `requirements.txt` に `prometheus-client`
- [x] `backend/app/rag/telemetry.py` に Counter / Histogram を追加
- [x] `backend/app/rag/hybrid_search.py` の主要 stage で duration を Histogram に記録
- [x] `_expansion_cache` / `_hyde_cache` で hit を記録
- [x] `backend/app/main.py` startup で内部 exporter を起動
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

- `RAG_METRICS_EXPORTER_ENABLED=false` で exporter を止める。
- `prometheus-client` がない環境では no-op metric にフォールバックする。

### 3.7 リスク

- R1: exporter 起動失敗でアプリ起動が落ちる → `start_metrics_exporter_once()` は例外を warning に落とす
- R2: cardinality 爆発 (company_id を label に入れると危険) → label は profile / stage / endpoint など低 cardinality のみ

### 3.8 関連ファイル

- `backend/app/rag/telemetry.py`
- `backend/app/rag/metrics_exporter.py`
- `backend/app/rag/hybrid_search.py`
- `backend/app/main.py` (startup)
- 参考: [Prometheus / OpenMetrics Compatibility (OTel)](https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/)

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
- `backend/app/rag/hybrid_search.py` (`_rerank_with_cross_encoder`)

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
- `backend/app/rag/hybrid_search.py` (`_keyword_search`)
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

- [x] `bm25_store.py` L190-195 を unique tempfile + fsync + atomic replace に差替
- [ ] `add_documents` 末尾で明示 `build` を呼び、lazy build の pathological spike を解消
- [x] `backend/tests/shared/test_bm25_store_guards.py` で stale fixed tmp を壊さないことを固定
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

`bm25_store.py`, `cache.py`, `japanese_tokenizer.py` に残る RAG/BM25 周辺の `print()` を `secure_logger` に置換。構造化ログ化、prod の可視性向上、機密情報混入防止。

### 7.2 設計

- `backend/app/utils/secure_logger.py` の `get_logger(__name__)` を import
- `print("Warning: ...")` → `logger.warning("...")`、`print("Loaded ...")` → `logger.info("...")`
- message 内に PII (userId, guestId, 本文 snippet) を**混入しない**ルールを徹底 (`secure_logger` の redact 機能を使う)

### 7.3 実装ステップ

- [x] `bm25_store.py`, `cache.py`, `japanese_tokenizer.py` の `print()` を全列挙
- [x] 対象箇所を `logger.{info,warning,error}` に置換
- [x] `backend/app/utils/japanese_tokenizer.py` L25 の `print("Warning: fugashi...")` も同様
- [ ] lint rule `ruff` で `print` 禁止 ルールを `backend/app/utils/**` に追加

### 7.4 測定指標

- `grep -rn "print(" backend/app/utils/bm25_store.py backend/app/utils/cache.py backend/app/utils/japanese_tokenizer.py` が 0 件
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

- `backend/app/rag/hybrid_search.py`

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

1. **Week 1**: P0-2 strict tenant 配線、既存開発 RAG データ削除/再取得
2. **Week 2**: P0-1 golden set 拡充、CI 連携方針確定
3. **Week 3**: P0-3 metrics skeleton + Prometheus exporter 方針確定
4. **Week 4**: P1-3 / P1-4 (安全性改善) を atomic commit
5. **Week 5**: P1-1 reranker 昇格
6. **Week 6**: P1-2 BM25 domain expansion + P1-5 culture boost

### 9.3 横断リスク

| # | リスク | 緩和策 |
|---|---|---|
| X1 | P0-1 golden set の品質不足で以降の判断が誤る | Ragas pipeline + SME review 2 round、production log で継続更新 |
| X2 | strict tenant 配線で `TENANT_KEY_SECRET` 未設定環境の RAG endpoint が 503 になる | secret inventory check と local preflight を実装前後の Gate にする |
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

## 11. P2-1 参考 ES Embedding 化

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

## 12. P2-2 Contextual Retrieval 導入

### 12.1 目的

Anthropic Contextual Retrieval (2024) を chunker に組込み、chunk 毎に「この chunk が document 全体のどこか」を 50 token で前置。retrieval failure -35〜49% (英語ベンチ) を日本語 / 就活 RAG で検証、+5pt nDCG@10 を狙う。

### 12.2 設計スケッチ

- **新クラス** `ContextualChunker(base, summarizer, mode)` を `text_chunker.py` に追加
  - `mode="metadata_only"`: chunk.text は変えず metadata 側に prefix 保持、埋め込み時のみ「prefix + text」を embed 対象に、BM25 は chunk.text のみ (BM25 トークン分布副作用回避)
  - `mode="prefix_text"`: text 冒頭にも prefix 付与 (A/B 用)
- **新モジュール** `backend/app/rag/document_summarizer.py`
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

## 13. P2-3 `backend/app/rag/` パッケージ分割

### 13.1 目的

`vector_store.py` (1648 行) と `hybrid_search.py` (1417 行) の god module 化を解消。責務を 5 + 6 ブロックに分解し、`backend/app/rag/` パッケージに再配置。

### 13.2 新構成

```
backend/app/rag/
  __init__.py            # ~40 行  公開 API re-export
  config.py              # ~200 行  CONTENT_TYPE_BOOSTS, profile, fetch_k 定数
  cache.py               # ~150 行  expansion / HyDE TTL cache
  telemetry.py           # RAG metrics
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

P0-2 の詳細設計 (tenant_key スキーマ、HMAC 選択理由、16 byte 選択理由、攻撃シナリオ 4 種のテスト、strict fail-closed 方針、rollback) は以下に別ファイルで展開済み:

`/Users/saoki/.claude/plans/rag-web-askuserquestiontool-nested-raccoon-agent-a81220a595bdcd3f9.md` (security-auditor 作成)

本計画書の §2 は要約のみ。実装着手時はこの RFC を参照。

---

## 15. 参考資料

### 外部ベンチマーク / ベストプラクティス

- [Anthropic: Contextual Retrieval (2024)](https://www.anthropic.com/news/contextual-retrieval) — P2-2 の根拠
- [Mem0: Production-Ready AI Agents (arXiv 2504.19413)](https://arxiv.org/html/2504.19413v1) — P3-2 (将来) の根拠
- [MMTEB (ICLR 2025, arXiv 2502.13595)](https://arxiv.org/abs/2502.13595) — embedding モデル比較
- [BAAI/bge-reranker-v2-m3 (HuggingFace)](https://huggingface.co/BAAI/bge-reranker-v2-m3) — P1-1 代替候補
- [Prometheus / OpenMetrics Compatibility (OTel)](https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/) — P0-3 exporter 参考
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
- 2026-04-27: P0-3/P1/P2 初期実装を反映。RAG 正本を `backend/app/rag/` に移動し、内部 Prometheus exporter / reference ES collection / contextual dual-write を追加。

---

**本計画書の原則**:
1. 本書は設計と実装状況の正本として維持する。
2. P0-1 の評価基盤を完成させてから、P2 の default-on 切替を判断する。
3. 各項目の Gate / Rollback / リスクを満たせない場合、本書を更新してから実装する。
4. `docs/review/` との整合性を常に保つ (本計画完了時にレビューを更新)。
