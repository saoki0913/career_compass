## Backend Search Tests

バックエンドの「検索」検証だけをまとめたドキュメントです。

ES添削の固定品質監視については [ES_REVIEW_QUALITY.md](./ES_REVIEW_QUALITY.md) を参照してください。

### Live ES添削 provider gate

4 provider (`Claude / GPT-5.1 / Gemini / Cohere Command A`) に対して、代表3ケースの ES添削を実 API で実行し、`md/json` レポートを保存します。

```bash
make backend-test-live-es-review
```

主な環境変数:

- `LIVE_ES_REVIEW_PROVIDERS=claude-sonnet,gpt-5.1,gemini-3.1-pro-preview,command-a-03-2025`
- `LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=0|1`
- `LIVE_ES_REVIEW_OUTPUT_DIR=backend/tests/output`

出力先:

- `backend/tests/output/` に `live_es_review_<timestamp>.md/.json`

注意:

- ネットワーク必須
- `RUN_LIVE_ES_REVIEW=1` が無い場合は skip
- CI では 4 provider 全部を毎回 gate として回す想定

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
