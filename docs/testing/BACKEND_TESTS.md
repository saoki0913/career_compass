## Backend Search Tests

バックエンドの「検索」検証だけをまとめたドキュメントです。

ES添削の固定品質監視については [ES_REVIEW_QUALITY.md](./ES_REVIEW_QUALITY.md) を参照してください。

### Live ES添削 provider gate

default では `gpt-5.4-mini` に対して、`smoke` case set の ES添削を実 API で実行し、`md/json` レポートを保存します。ローカル秘密情報は repo root の `.env.local` から読み込みます。`extended` は手動・夜間で全標準モデル sweep に使い、`canary` は非 blocker の sanity 用です。

```bash
make backend-test-live-es-review
```

主な環境変数:

- `LIVE_ES_REVIEW_CASE_SET=smoke|extended|canary`
- `LIVE_ES_REVIEW_PROVIDERS=gpt-5.4-mini|all_standard|claude-sonnet,...`
- `LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=0|1`
- `LIVE_ES_REVIEW_OUTPUT_DIR=backend/tests/output`
- `LIVE_ES_REVIEW_ENABLE_JUDGE=0|1`
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

拡張 sweep:

```bash
LIVE_ES_REVIEW_CASE_SET=extended \
LIVE_ES_REVIEW_PROVIDERS=all_standard \
LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
make backend-test-live-es-review
```

Claude canary:

```bash
LIVE_ES_REVIEW_CASE_SET=canary \
LIVE_ES_REVIEW_PROVIDERS=claude-sonnet,gemini-3.1-pro-preview \
LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
make backend-test-live-es-review
```

`canary` は non-blocking です。レポートには `failure_kind=quality|infra|config` と `preflight_status` が入り、Claude / Gemini の DNS・接続・鍵不足を品質 fail と分離して確認できます。

出力先:

- `backend/tests/output/` に `live_es_review_<timestamp>.md/.json`

注意:

- ネットワーク必須
- `RUN_LIVE_ES_REVIEW=1` が無い場合は skip
- PR / `main` では `gpt-5.4-mini` の `smoke` を required gate に使う
- `extended` の全標準モデル sweep は `LIVE_ES_REVIEW_PROVIDERS=all_standard` で回せる
- `extended` と `claude-sonnet / gemini-3.1-pro-preview` canary は nightly / manual regression として回す
- `canary` は provider preflight を先に行い、API key 不足や DNS 失敗は `infra/config` としてレポートする

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
