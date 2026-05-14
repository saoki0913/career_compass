# 就活Pass (シューパス) リリース・運用ガイド

**本番ドメイン**: `www.shupass.jp`（`shupass.jp` は `www` にリダイレクト）

## 構成

```
                 www.shupass.jp
                        |
                    +----v----+
                    | お名前   |  registrar
                    | .com    |
                    +----+----+
                         |
                    +----v----+
                    |Cloudflare| authoritative DNS
                    +----+----+
                         |
+-------------+     +---v---------+     +---------+
|   Vercel     |---->|  Railway     |---->| Supabase |
|  (Next.js)   |     |  (FastAPI)   |     |(Postgres)|
| www.shupass.jp|     |  Port $PORT  |     |          |
+------+-------+     +------+------+     +----------+
       |                    |
       |                    +-- ChromaDB (Railway Volume)
       |                    +-- BM25 Index (Railway Volume)
       |
       +-- Stripe (決済)
       +-- Google OAuth (認証)
       +-- OpenAI / Anthropic (AI)
```

---

## 初めてセットアップする場合

[setup/PRODUCTION_SETUP.md](./setup/PRODUCTION_SETUP.md) を起点に、以下の順で進めてください。

| Step | 内容 | ドキュメント |
|---|---|---|
| **Step 0** | ドメイン運用正本（Web / Mail / 解約判断） | [DOMAIN_OPERATIONS.md](./setup/DOMAIN_OPERATIONS.md) |
| **Step 1** | Supabase (PostgreSQL) 本番データベース | [SUPABASE.md](./setup/SUPABASE.md) |
| **Step 2** | Stripe 本番設定 | [STRIPE.md](./setup/STRIPE.md) |
| **Step 3** | Railway にバックエンドをデプロイ | [RAILWAY.md](./setup/RAILWAY.md) |
| **Step 4** | Vercel にフロントエンドをデプロイ | [VERCEL.md](./setup/VERCEL.md) |
| **Step 5** | 外部サービスの本番設定（Google OAuth, CORS, Upstash） | [EXTERNAL_SERVICES.md](./setup/EXTERNAL_SERVICES.md) |
| **Ref** | 環境変数クイックリファレンス | [ENV_REFERENCE.md](./setup/ENV_REFERENCE.md) |
| **Ref** | 個人事業主コンプライアンス（特商法・Stripe 審査） | [INDIVIDUAL_BUSINESS_COMPLIANCE.md](./setup/INDIVIDUAL_BUSINESS_COMPLIANCE.md) |

---

## 運用タスクを実行する場合

[ops/RUNBOOK.md](./ops/RUNBOOK.md) を起点に、シナリオに応じた手順書を参照してください。

| ドキュメント | 内容 |
|---|---|
| [RUNBOOK.md](./ops/RUNBOOK.md) | 運用ランブック（シナリオ選択の入口） |
| [REGULAR_RELEASE.md](./ops/REGULAR_RELEASE.md) | 通常リリース手順（develop → main） |
| [DB_MIGRATION.md](./ops/DB_MIGRATION.md) | DB マイグレーション手順（分類・安全ゲート） |
| [MIGRATION_RUNBOOK.md](./ops/MIGRATION_RUNBOOK.md) | Supabase CLI / Drizzle マイグレーション運用 |
| [INCIDENT_ROLLBACK.md](./ops/INCIDENT_ROLLBACK.md) | 障害対応・ロールバック手順 |

---

## クイックコマンドリファレンス

| コマンド | 用途 |
|---|---|
| `make ops-release-check` | リリース前提チェック（provider auth、secret inventory、branch 前提） |
| `make release-pr` | develop → main の release PR を作成 |
| `make deploy` | 一括リリース（staging gate → production deploy） |
| `make deploy-staging` | staging のみデプロイ |
| `make deploy-production` | 本番のみデプロイ（staging gate あり） |
| `make rollback-prod TARGET=<id>` | 本番ロールバック（dry-run + 計画確認） |
| `make doctor` | 本番診断 + P0/P1 トリアージ |
| `make doctor-check` | 本番診断のみ（修復なし） |
| `make db-validate` | DB スキーマバリデーション |
| `make db-migrate-check` | マイグレーション適用状況の確認 |
| `make db-drift-check` | DB ドリフト検出 |
| `make deploy-status` | デプロイ状況の確認 |
| `make ops-secrets-sync` | secret bundle の provider 同期チェック |
