# 運用ガイド

就活Pass の開発運用・プラットフォーム管理・本番リリースのガイドです。本番環境の初回構築は [release/](../release/) を、ローカル開発環境は [setup/](../setup/) を参照してください。

## やりたいこと別ガイド

| やりたいこと | 見る文書 |
|---|---|
| 本番リリースしたい | [production/REGULAR_RELEASE.md](./production/REGULAR_RELEASE.md) |
| 本番で障害が起きた | [production/INCIDENT_ROLLBACK.md](./production/INCIDENT_ROLLBACK.md) |
| 環境変数を確認・追加したい | [platform/ENVIRONMENT_VARIABLES.md](./platform/ENVIRONMENT_VARIABLES.md) |
| シークレットを更新・同期したい | [production/SECRETS_MANAGEMENT.md](./production/SECRETS_MANAGEMENT.md) |
| DB マイグレーションを実行したい | [production/DB_MIGRATION.md](./production/DB_MIGRATION.md) |
| AI ハーネスの設定を確認したい | [development/AI_HARNESS.md](./development/AI_HARNESS.md) |
| 運用シナリオの入口を探したい | [production/RUNBOOK.md](./production/RUNBOOK.md) |

---

## ディレクトリ構成

### development/ — AI 開発ハーネス

| 文書 | 説明 |
|---|---|
| [AI_HARNESS.md](./development/AI_HARNESS.md) | Claude Code ハーネスの詳細リファレンス（agents / skills / hooks / MCP） |
| [CODEX_HARNESS.md](./development/CODEX_HARNESS.md) | Codex custom agent / config / wrapper のリファレンス |
| [CURSOR_HARNESS.md](./development/CURSOR_HARNESS.md) | Cursor rules / MCP の設定リファレンス |
| [AI_AGENT_PIPELINE.md](./development/AI_AGENT_PIPELINE.md) | AI 開発パイプライン（5 ステップ） |
| [AI_DEVELOPMENT_PRINCIPLES.md](./development/AI_DEVELOPMENT_PRINCIPLES.md) | AI 継続開発の設計原則 |
| [CLI_GUARDRAILS.md](./development/CLI_GUARDRAILS.md) | CLI の安全な使い方 |
| [TEST_HARNESS.md](./development/TEST_HARNESS.md) | テスト・AI 評価フレームワーク |
| [DEAD_CODE_REMOVAL.md](./development/DEAD_CODE_REMOVAL.md) | デッドコード調査・削除手順 |

### platform/ — プラットフォーム管理

| 文書 | 説明 |
|---|---|
| [ENVIRONMENT_VARIABLES.md](./platform/ENVIRONMENT_VARIABLES.md) | 環境変数 SSOT（唯一の正本） |
| [SECURITY.md](./platform/SECURITY.md) | セキュリティベースライン（HTTP ヘッダ、CSP、レート制限） |
| [MONITORING_SETUP.md](./platform/MONITORING_SETUP.md) | 本番リリース前の監視セットアップ（PII scrub、Sentry） |
| [OBSERVABILITY.md](./platform/OBSERVABILITY.md) | RAG / FastAPI の運用監視メトリクスとアラート |
| [SEO_GOOGLE_SEARCH_CONSOLE.md](./platform/SEO_GOOGLE_SEARCH_CONSOLE.md) | Google Search Console のセットアップと月次モニタリング |
| [STRIPE_CODEX_CLI.md](./platform/STRIPE_CODEX_CLI.md) | Codex 向け Stripe CLI の操作手順 |

### production/ — 本番運用手順

| 文書 | 説明 |
|---|---|
| [RUNBOOK.md](./production/RUNBOOK.md) | 運用ランブック（シナリオ選択の入口） |
| [REGULAR_RELEASE.md](./production/REGULAR_RELEASE.md) | 通常リリース手順（develop → main 9 ステップ） |
| [DB_MIGRATION.md](./production/DB_MIGRATION.md) | DB マイグレーションの分類と実行フロー |
| [INCIDENT_ROLLBACK.md](./production/INCIDENT_ROLLBACK.md) | 障害対応トリアージとロールバック手順 |
| [SECRETS_MANAGEMENT.md](./production/SECRETS_MANAGEMENT.md) | シークレットの同期・ローテーション |
| [HOOK_SAFETY_MAP.md](./production/HOOK_SAFETY_MAP.md) | Hook ディスパッチアーキテクチャとチェックポイント |
