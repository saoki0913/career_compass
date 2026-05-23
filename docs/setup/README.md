# ローカル開発環境セットアップ

ローカル開発環境の構築とツール設定のガイドです。本番環境の初回構築は [release/](../release/) を参照してください。

## やりたいこと別ガイド

| やりたいこと | 見る文書 |
|---|---|
| 開発を始めたい（Quick Start） | [DEVELOPMENT_AND_ENV.md](./DEVELOPMENT_AND_ENV.md) |
| ローカル DB を起動・接続したい | [DB_SUPABASE.md](./DB_SUPABASE.md) |
| ローカル DB をゼロから再構築したい | [DB_REBUILD_CHECKLIST.md](./DB_REBUILD_CHECKLIST.md) |
| MCP サーバーや Notion 連携を設定したい | [MCP_SETUP.md](./MCP_SETUP.md) |

## ファイル一覧

| 文書 | 説明 |
|---|---|
| [DEVELOPMENT_AND_ENV.md](./DEVELOPMENT_AND_ENV.md) | Quick Start、カスタムコマンド、環境変数、外部サービス設定、テスト |
| [DB_SUPABASE.md](./DB_SUPABASE.md) | Supabase / PostgreSQL の接続、マイグレーション、RLS、トラブルシューティング |
| [DB_REBUILD_CHECKLIST.md](./DB_REBUILD_CHECKLIST.md) | ローカル DB の破棄・再作成の判断基準とチェックリスト |
| [MCP_SETUP.md](./MCP_SETUP.md) | MCP サーバー（Playwright / Notion / context7）の設定と Notion 連携 |

## 関連ドキュメント

- 本番環境の初回構築 → [release/](../release/)
- 環境変数の SSOT → [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md)
- システム全体構成 → [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
