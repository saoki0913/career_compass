# テスト / AI ハーネス運用メモ

**最終確認**: 2026-04-29

## 現状

- Frontend unit / API route / library: `npm run test:unit` (`Vitest`)
- Backend deterministic: `bash scripts/ci/run-backend-deterministic.sh` (`pytest` の明示 subset)
- Browser E2E: `npm run test:e2e` / `bash scripts/ci/run-main-e2e.sh`
- AI Functional E2E: `scripts/ci/run-e2e-functional.sh` と `scripts/dev/run-ai-live-local.sh`
- Harness tests: `npm run test:harness` / `npm run test:ci-tools`
- Commit gate: `.githooks/pre-commit` が local AI Live manifest と lightweight security scan を検証する

## 追加・変更時のルール

新機能や既存機能の変更では、変更した責務に合わせて次を更新する。

- UI / hook / route logic: 近い `src/**/*.test.ts(x)` を追加または更新する。
- FastAPI / AI品質: `backend/tests/**` に deterministic test を追加し、必要なら integration / AI Live に昇格する。
- ブラウザ上の主要導線: `e2e/functional/**` または AI Live の該当 feature を更新する。
- AI出力品質: deterministic scorer、heuristic scorer、LLM judge のどれで守るかを明示する。
- Harness / hooks / CI: `scripts/harness/**/*.test.mjs`、`scripts/claude/claude-harness.test.mjs`、`scripts/codex/codex-harness.test.mjs` を更新する。

## AI 評価の設計方針

OpenAI Evals、Inspect AI、OpenHands、SWE-agent、LangSmith の作法を参考にするが、第一弾では外部評価フレームワークを依存追加しない。既存の `pytest` / `Playwright` / manifest に次の概念を寄せる。

- `dataset`: 評価ケースと入力条件
- `target`: 実行する就活Pass機能
- `scorer`: rule / heuristic / model judge
- `experiment`: model、prompt version、実行時刻、結果 artifact
- `trace`: request id、会話履歴、judge 入力、失敗理由

次期 AI Live manifest は次の項目を標準化する。

- `feature`
- `case_id`
- `dataset_version`
- `scorer_versions`
- `model`
- `judge_model`
- `hard_failures`
- `soft_failures`
- `judge_scores`
- `trace_path`
- `request_ids`

## CI の役割

- `develop-ci`: build / unit / backend deterministic / security と、AI Functional の差分 scope レポートを担当する。
- local pre-commit: staged diff に紐づいた local AI Live manifest を hard gate とする。
- main promotion: staging E2E、AI live smoke、差分ベース AI Functional smoke を blocking gate とする。

重い AI Live を develop push ごとに必ず走らせると API コストと待ち時間が増えるため、develop では scope 検出と可視化までに留める。
