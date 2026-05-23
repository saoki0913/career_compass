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
| **Step 5d** | AI / LLM プロバイダ（OpenAI / Anthropic） | [OPENAI.md](./OPENAI.md) ・ [ANTHROPIC.md](./ANTHROPIC.md) |
| **Step 5e** | 補助サービス（OCR / メール / 企業ロゴ） | [MISTRAL.md](./MISTRAL.md) ・ [FIRECRAWL.md](./FIRECRAWL.md) ・ [RESEND.md](./RESEND.md) ・ [LOGO_DEV.md](./LOGO_DEV.md) ・ [BRANDFETCH.md](./BRANDFETCH.md) |
| **Ref** | 環境変数リファレンス（SSOT） | [ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) |
| **Ref** | 個人事業主コンプライアンス（特商法・Stripe 審査） | [INDIVIDUAL_BUSINESS_COMPLIANCE.md](./INDIVIDUAL_BUSINESS_COMPLIANCE.md) |

---

## 前提 CLI（CLI 優先で設定する）

各サービスの設定は「CLI コマンド（推奨）を先に、GUI（fallback）を後に」の順で記述しています。よく使う CLI と詳細手順の在りかは次のとおり。インストール・認証コマンドの正確な形は各 doc に記載しています（最新の公式ドキュメントで裏取り済み）。

| CLI | 主な用途 | 詳細手順 |
|---|---|---|
| `gcloud` | Google Cloud / OAuth / Document AI | [GOOGLE_CLOUD.md](./GOOGLE_CLOUD.md) |
| `stripe` | Stripe 商品・Price・Webhook・Portal | [STRIPE.md](./STRIPE.md) |
| `supabase` | Supabase project / 接続情報 / secrets | [SUPABASE.md](./SUPABASE.md) |
| `vercel` | Vercel project / env / deploy | [VERCEL.md](./VERCEL.md) |
| `railway` | Railway service / variables / deploy | [RAILWAY.md](./RAILWAY.md) |
| `upstash` | Upstash Redis DB 作成・認証情報取得 | [UPSTASH_REDIS.md](./UPSTASH_REDIS.md) |
| `sentry-cli` | Sentry release / sourcemap / cron | [SENTRY.md](./SENTRY.md) |
| `openai` | OpenAI プロジェクト・サービスキー発行 | [OPENAI.md](./OPENAI.md) |
| `resend` | Resend API キー・送信ドメイン認証 | [RESEND.md](./RESEND.md) |
| Cloudflare API（`curl`） | Cloudflare DNS レコード | [DOMAIN_OPERATIONS.md](./DOMAIN_OPERATIONS.md) |

> **CLI が無い/キー発行に使えないサービス**: Anthropic・Mistral・Firecrawl・Logo.dev・Brandfetch は API キーの発行を Dashboard で行う（CLI は発行に使えない、または存在しない）。手順は各 doc を参照。
> **env への反映の正本**は repo の secret 同期（`make ops-secrets-sync` / `scripts/release/sync-career-compass-secrets.sh`）。provider CLI（`vercel env` / `railway variables` 等）はその fallback。

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
