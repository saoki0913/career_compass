# 就活Pass ドキュメント入口

このページは `docs/` の読者別入口です。全ファイルの目録は [INDEX.md](./INDEX.md)、新規文書の置き場所は [CONVENTIONS.md](./CONVENTIONS.md) を参照してください。

## 最初に選ぶ入口

| やりたいこと | 最初に見る文書 |
|---|---|
| 開発を始める | [setup/DEVELOPMENT_AND_ENV.md](./setup/DEVELOPMENT_AND_ENV.md) → [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) |
| 機能を変更する | [features/](./features/) → [architecture/](./architecture/) → [testing/](./testing/) |
| AI エージェントで作業する | [../AGENTS.md](../AGENTS.md) → [operations/development/AI_HARNESS.md](./operations/development/AI_HARNESS.md) → [operations/development/TEST_HARNESS.md](./operations/development/TEST_HARNESS.md) |
| 本番を運用する | [operations/production/RUNBOOK.md](./operations/production/RUNBOOK.md) → [operations/platform/ENVIRONMENT_VARIABLES.md](./operations/platform/ENVIRONMENT_VARIABLES.md) |
| 初回本番構築をする | [release/PRODUCTION_SETUP.md](./release/PRODUCTION_SETUP.md) |
| LP / SEO を変更する | [SPEC.md](./SPEC.md) → [marketing/LP.md](./marketing/LP.md) → [marketing/README.md](./marketing/README.md) |
| テスト・品質ゲートを見る | [testing/E2E.md](./testing/E2E.md) → [operations/development/TEST_HARNESS.md](./operations/development/TEST_HARNESS.md) |
| 計画・レビュー履歴を見る | [plan/execution-order.md](./plan/execution-order.md) → [plan/plan-tasks.json](./plan/plan-tasks.json) → [review/REVIEW_POLICY.md](./review/REVIEW_POLICY.md) |

## 正本のルール

- 正しい runtime 挙動の一次情報はコードです。
- 環境変数の意味・必須性は [operations/platform/ENVIRONMENT_VARIABLES.md](./operations/platform/ENVIRONMENT_VARIABLES.md) が正本です。
- 本番の日常運用手順は [operations/production/](./operations/production/) が正本です。
- 本番の初回構築手順は [release/](./release/) に置きます。
- `docs/prompts/`、`docs/reference/`、`docs/review/` は runtime 非連携または作成時点のスナップショットです。
- 実 secret ファイルは直接読まず、棚卸しは `scripts/release/sync-career-compass-secrets.sh --check` 系で行います。

## ディレクトリ地図

| ディレクトリ | 役割 |
|---|---|
| [architecture/](./architecture/) | 横断設計・境界・状態機械・契約 |
| [features/](./features/) | 機能別の実装参照付き仕様 |
| [operations/development/](./operations/development/) | AI harness、CLI guardrails、test harness、開発運用 |
| [operations/platform/](./operations/platform/) | 環境変数、security、observability、monitoring、SEO / Stripe CLI |
| [operations/production/](./operations/production/) | 本番 runbook、release、DB migration、secrets、incident |
| [release/](./release/) | Vercel / Railway / Supabase / Stripe / domain の初回構築 |
| [setup/](./setup/) | ローカル開発環境 |
| [testing/](./testing/) | テスト方針 |
| [prompts/](./prompts/) | LLM プロンプトの人間レビュー用 snapshot |
| [reference/](./reference/) | 参考 ES ヒントの offline input |
| [plan/](./plan/) | 改善計画。進捗状態は `plan-tasks.json` が SSOT |
| [review/](./review/) | 監査・レビューの時点スナップショット |
| [marketing/](./marketing/) | LP・SEO・訴求戦略 |
