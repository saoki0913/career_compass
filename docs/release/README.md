# 本番環境の初回構築

就活Pass (シューパス) の本番環境をゼロから構築する手順書です。日常の運用は [operations/](../operations/) を参照してください。

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

## セットアップ手順

[PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) を起点に、以下の順で進めてください。

| Step | 内容 | ドキュメント |
|---|---|---|
| **Step 0** | ドメイン運用（Web / Mail / DNS） | [DOMAIN_OPERATIONS.md](./DOMAIN_OPERATIONS.md) |
| **Step 1** | Supabase (PostgreSQL) 本番データベース | [SUPABASE.md](./SUPABASE.md) |
| **Step 2** | Stripe 本番設定 | [STRIPE.md](./STRIPE.md) |
| **Step 3** | Railway にバックエンドをデプロイ | [RAILWAY.md](./RAILWAY.md) |
| **Step 4** | Vercel にフロントエンドをデプロイ | [VERCEL.md](./VERCEL.md) |
| **Step 5a** | Google Cloud / OAuth / CORS | [GOOGLE_CLOUD.md](./GOOGLE_CLOUD.md) |
| **Step 5b** | Upstash Redis（レート制限） | [UPSTASH_REDIS.md](./UPSTASH_REDIS.md) |
| **Step 5c** | Sentry（エラー追跡・外部監視） | [SENTRY.md](./SENTRY.md) |
| **Ref** | 環境変数リファレンス（SSOT） | [ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) |
| **Ref** | 個人事業主コンプライアンス（特商法・Stripe 審査） | [INDIVIDUAL_BUSINESS_COMPLIANCE.md](./INDIVIDUAL_BUSINESS_COMPLIANCE.md) |

---

## 関連ドキュメント

| やりたいこと | 見る文書 |
|---|---|
| 日常の運用（リリース・障害対応・DB 移行） | [operations/production/RUNBOOK.md](../operations/production/RUNBOOK.md) |
| 環境変数の確認・追加 | [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) |
| ローカル開発環境の構築 | [setup/DEVELOPMENT_AND_ENV.md](../setup/DEVELOPMENT_AND_ENV.md) |

---

## クイックコマンドリファレンス

| コマンド | 用途 |
|---|---|
| `make ops-release-check` | リリース前提チェック |
| `make deploy` | 一括リリース（staging gate → production deploy） |
| `make deploy-staging` | staging のみデプロイ |
| `make deploy-production` | 本番のみデプロイ（staging gate あり） |
| `make doctor` | 本番診断 + P0/P1 トリアージ |
| `make doctor-check` | 本番診断のみ（修復なし） |
