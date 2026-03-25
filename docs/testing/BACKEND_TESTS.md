## Backend Search Tests

バックエンドの「検索」検証だけをまとめたドキュメントです。

ES添削の固定品質監視については [ES_REVIEW_QUALITY.md](./ES_REVIEW_QUALITY.md) を参照してください。

### Live ES添削 provider gate

default では `gpt-5.4-mini` に対して、`smoke` case set の ES添削を実 API で実行し、`md/json` レポートを保存します。ローカル秘密情報は repo root の `.env.local` から読み込みます。`extended` は **未指定時** `gpt-5.4-mini,gpt-5.4,claude-sonnet,gemini-3.1-pro-preview` の 4 モデルで直積します（`DEFAULT_LIVE_PROVIDERS_EXTENDED`）。`canary` case set はコードに残っていますが、GitHub Actions の専用 canary ジョブは廃止し、extended 側に統合しています。

```bash
make backend-test-live-es-review
```

主な環境変数:

- `LIVE_ES_REVIEW_CASE_SET=smoke|extended|canary`
- `LIVE_ES_REVIEW_PROVIDERS`（空なら smoke は mini、extended は 4 モデル既定）
- `LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=0|1`
- `LIVE_ES_REVIEW_OUTPUT_DIR=backend/tests/output`
- `LIVE_ES_REVIEW_ENABLE_JUDGE=0|1`
- `LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=0|1`
- `LIVE_ES_REVIEW_COLLECT_ONLY=0|1`（`1` で pytest を最後まで緑にし、失敗もレポートのみ）
- `LIVE_ES_REVIEW_JUDGE_MODEL=gpt-5.4-mini`
- `LIVE_ES_REVIEW_CASE_FILTER=case_id_a,case_id_b`

直接実行する場合:

```bash
RUN_LIVE_ES_REVIEW=1 \
LIVE_ES_REVIEW_CASE_SET=smoke \
LIVE_ES_REVIEW_PROVIDERS=gpt-5.4-mini \
npx dotenv -e .env.local -- \
python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -v -s -m "integration"
```

拡張（4 モデル既定・ジャッジ付き）:

```bash
LIVE_ES_REVIEW_CASE_SET=extended \
LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
make backend-test-live-es-review
```

全標準モデル（`low-cost` 等を含む）:

```bash
LIVE_ES_REVIEW_CASE_SET=extended \
LIVE_ES_REVIEW_PROVIDERS=all_standard \
LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
make backend-test-live-es-review
```

ローカルで smoke / extended を各 5 回ずつ集計する場合は [ES_REVIEW_QUALITY.md](./ES_REVIEW_QUALITY.md) のスイープ節と `./scripts/dev/run-live-es-review-sweep.sh` を参照。

出力先:

- `backend/tests/output/` に `live_es_review_<timestamp>.md/.json`

注意:

- ネットワーク必須
- `RUN_LIVE_ES_REVIEW=1` が無い場合は skip
- GitHub Actions では **常時実行しない**。`Main Release Gate / ai-live-smoke` で AI 関連差分がある PR のみ `smoke` を実行し、それ以外は no-op success にする
- `extended` の 4 モデル sweep はローカルで `LIVE_ES_REVIEW_PROVIDERS` 未指定の `extended`、または [ES_REVIEW_QUALITY.md](./ES_REVIEW_QUALITY.md) の手動コマンド例
- より広い行列は `LIVE_ES_REVIEW_PROVIDERS=all_standard`

### GitHub Actions の deterministic backend suite

`Develop CI` と `Main Release Gate` は `scripts/ci/run-backend-deterministic.sh` を正本として、次を常時実行する。

- `company_info`: `public_url_guard`, `content_type_keywords`, `domain_pattern_matching`, `hybrid_search_short_circuit`, `schedule_search_policy`, `upload_pdf_ingestion`
- `es_review`: `quality_rubric`, `final_quality_cases`, `prompt_structure`, `rag_profiles`, `template_rag_policy`, `template_repairs`, `live_gate_support`, `reference_es_quality`, `review_telemetry_summary`
- `motivation`, `gakuchika`, `shared`: streaming / message normalization / provider routing / prompt safety / streaming json

### Live検索レポート（Legacy + Hybrid）

`backend/data/company_mappings.json` からランダムに30社を抽出し、採用/コーポレート検索を **Legacy と Hybrid の両方**で実行して結果を `md/json` レポート出力します。

```bash
make backend-test-live-search
```

片方だけ:

```bash
make backend-test-live-search-hybrid
make backend-test-live-search-legacy
```

主な環境変数（Makefile側で上書き可能）:

- `LIVE_SEARCH_MODES=hybrid,legacy`
- `LIVE_SEARCH_CACHE_MODE=use|refresh|bypass`
- `LIVE_SEARCH_SAMPLE_SEED=42`
- `LIVE_SEARCH_SAMPLE_SIZE=30`
- `LIVE_SEARCH_MAX_RESULTS=5`
- `LIVE_SEARCH_TOKENS_PER_SECOND=1.0`, `LIVE_SEARCH_MAX_TOKENS=1.0`

出力先:

- `backend/tests/output/` に `live_company_info_search_<timestamp>_seed<seed>.md/.json`

注意:

- ネットワーク必須（DuckDuckGo 検索: `ddgs` が無い場合は skip）
- 実行時間が長くなるためローカル手動実行向け

### 参考: 旧テストターゲット

`backend-test-search` / `backend-test-content-type` / `backend-test-comprehensive` などのターゲットは Makefile に残っていますが、該当の `backend/tests/test_*.py` が削除されている場合は実行できません（エラーメッセージを出して終了します）。
