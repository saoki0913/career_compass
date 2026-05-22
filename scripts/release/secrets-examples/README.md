# `.secrets/` セットアップガイド

就活Pass のプロバイダ（Vercel / Railway / GitHub Actions / Supabase）へ環境変数を同期するための正本ファイルを設定する手順です。

## 前提

- `.secrets/` ディレクトリ（gitignored）がプロジェクトルートに存在すること
- Vercel CLI / Railway CLI / gh CLI がインストール済みであること

## クイックスタート

```bash
# 1. テンプレートをコピー
cp scripts/release/secrets-examples/staging/*.example .secrets/staging/
cp scripts/release/secrets-examples/production/*.example .secrets/production/
cp scripts/release/secrets-examples/ci/*.example .secrets/ci/
cp scripts/release/secrets-examples/infra/*.example .secrets/infra/

# 2. .example 拡張子を除去
for f in .secrets/**/*.example; do mv "$f" "${f%.example}"; done

# 3. 各ファイルを編集して実際の値を設定
# (下記「ファイル別設定ガイド」を参照)

# 4. 整合性確認（プロバイダ接続なし）
zsh scripts/release/sync-career-compass-secrets.sh --check --target all --skip-provider-drift

# 5. プロバイダとのキー差分確認（CLI 認証が必要）
zsh scripts/release/sync-career-compass-secrets.sh --check --target all

# 6. プロバイダに同期
SYNC_MODE=--apply TARGET=all make ops-secrets-sync
```

## ディレクトリ構造

```
.secrets/
├── production/
│   ├── shared.env        ← 3 cross-service 変数（BFF↔FastAPI 共有）
│   ├── nextjs.env        ← Vercel production
│   ├── fastapi.env       ← Railway production
│   └── supabase.env      ← production Supabase bootstrap
├── staging/
│   ├── shared.env
│   ├── nextjs.env
│   ├── fastapi.env
│   └── supabase.env
├── ci/
│   └── github-actions.env ← GitHub Actions secrets
├── infra/
│   └── cloudflare.env     ← DNS bootstrap
```

## ファイル別設定ガイド

### デプロイ先対応

| 対象 | Git branch | Vercel Project | Vercel env scope | Railway project | Railway environment | Supabase Project | アプリ論理環境 |
|---|---|---|---|---|---|---|---|
| staging | `develop` | `career-compass-staging` | `production` | staging 専用 project | `production` | `career-compass-staging` | `APP_ENV=staging` |
| production | `main` | `career-compass` | `production` | production 専用 project | `production` | `career-compass-db` | `APP_ENV=production` |

Vercel/Railway/Supabase は staging / production で project を分けます。プロバイダの環境名ではなく、`APP_ENV` と `NEXT_PUBLIC_APP_ENV` がアプリ論理環境の正本です。

### 1. shared.env（最初に設定）

BFF (Next.js) と FastAPI の両方で同じ値が必要な 3 変数を管理します。**nextjs.env / fastapi.env には重複定義しないでください**（sync スクリプトが shared.env → service env の順でマージします）。

```bash
# 値の生成（32文字以上のランダム文字列）
openssl rand -hex 32
```

staging と production で**異なる値**を設定してください。

### 1.1 環境別値と重複ルール

`staging/` と `production/` は別 project 用の正本です。変数名が同じでも、値まで同じにしてよいとは限りません。

| 分類 | 代表例 | staging / production の同値 |
|---|---|---|
| 必ず別値 | `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, URL 類, `DATABASE_URL`, `DIRECT_URL`, Redis namespace, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `VERCEL_PROJECT_ID`, `RAILWAY_PROJECT_ID`, `SUPABASE_*_PROJECT_REF` | 不可 |
| 同一環境内では同値、環境間は別値 | `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`, `TENANT_KEY_SECRET` | 不可 |
| 原則別値 | `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, OAuth / LLM / mail / Sentry の secret key | 原則不可。dev/staging 共有は例外扱い、production は分ける |
| 同値でもよい | `VERCEL_TEAM_ID`, `SUPABASE_ORG_ID`, `SENTRY_ORG`, `LEGAL_*`, 連絡先メール、モデル ID / チューニング値 | 可 |
| 用途限定 | `CI_E2E_*`, `PLAYWRIGHT_BASE_URL`, `RAILWAY_ENVIRONMENT_NAME` | `CI_E2E_*` は staging 専用。`RAILWAY_ENVIRONMENT_NAME` は別 Railway project 構成なら両方 `production` |

sync スクリプトは、重複定義、provider project ID の重複、`APP_ENV` / Redis namespace / Stripe key prefix の不一致を同期前に検査します。

### 2. nextjs.env

Vercel の環境変数として同期されます。
staging / production ともそれぞれ別の Vercel project の `production` 環境に同期し、論理環境は `APP_ENV` で分けます。
staging には `ci/github-actions.env` から `CI_E2E_AUTH_SECRET` / `CI_E2E_AUTH_ENABLED` / `PLAYWRIGHT_BASE_URL` も追加で同期されます。

**必ず設定が必要なもの:**
- `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` — sync スクリプトのメタキー
- `DATABASE_URL` — Supabase PostgreSQL 接続URL
- `BETTER_AUTH_*` — 認証設定
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Stripe 決済
- `ENCRYPTION_KEY` — AES-256-GCM 暗号化キー（`openssl rand -hex 32` で 64桁hex を生成）
- `CRON_SECRET` — Cron 認証トークン
- `FASTAPI_URL` — FastAPI バックエンドURL
- `NEXT_PUBLIC_APP_URL` — アプリ公開URL
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Redis REST 接続情報
- `UPSTASH_REDIS_NAMESPACE` — `staging` / `production`。同じ Redis を共有する場合も必ず環境ごとに分ける。
- `APP_ENV` / `NEXT_PUBLIC_APP_ENV` — 論理環境。`APP_ENV` が全スタック（Vercel / Railway 両方）の正本です。

**staging と production の違い:**
- URL: `stg.shupass.jp` vs `www.shupass.jp`
- 論理環境: `staging` vs `production`
- Stripe: `sk_test_...` vs `sk_live_...`
- `BETTER_AUTH_TRUSTED_ORIGINS`: staging は 1 origin、production は 2 origin

### 3. fastapi.env

Railway の環境変数として同期されます。
staging / production は別 Railway project を使い、各 project の既定 `production` 環境へ同期します。したがって staging でも `RAILWAY_ENVIRONMENT_NAME=production` が正です。

**必ず設定が必要なもの:**
- `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_NAME` / `RAILWAY_ENVIRONMENT_NAME` — sync メタキー
- `APP_ENV` — `staging` or `production`。FastAPI も `APP_ENV` を設定します。`RAILWAY_ENVIRONMENT_NAME` は Railway CLI 用の同期メタキーで、アプリの環境判定には使いません。
- `CORS_ORIGINS` — CORS 許可オリジン
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — LLM API キー
- `REDIS_URL` — FastAPI 側 Redis 接続情報
- `REDIS_NAMESPACE` — `staging` / `production`。`APP_ENV` と同じ値にします。
- `BACKEND_TRUSTED_HOSTS` — FastAPI が受け付ける Host 名

### 4. supabase.env

`production/supabase.env` には `career-compass-db` の `SUPABASE_PRODUCTION_PROJECT_REF`、`staging/supabase.env` には `career-compass-staging` の `SUPABASE_STAGING_PROJECT_REF` が必須です。Supabase Dashboard → Settings → General から各 project の ref をコピーしてください。
`shared.env` の BFF/FastAPI 共有シークレットは Supabase に同期しません。

### 5. github-actions.env

CI の E2E テストで使うシークレットです。`CI_E2E_AUTH_SECRET` は staging Vercel にも overlay されます。

## Redis (Upstash) セットアップ

レートリミット、日次トークン制限、SSE 同時接続制御に Upstash Redis を使用します。

### Upstash アカウント作成

1. https://upstash.com にアクセスしてアカウント作成（GitHub / Google ログイン可）
2. ダッシュボードで **Create Database** をクリック
3. 設定:
   - **Name**: `career-compass-production`（本番用）/ `career-compass-staging`（staging 用）
   - **Region**: `ap-northeast-1`（東京）— Vercel / Supabase と同リージョンが理想
   - **Type**: Regional（Global は不要）
   - **Eviction**: 無効のまま
4. 作成後、**REST API** セクションから URL と Token をコピー

### 環境変数の設定

**nextjs.env** に追加:
```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_REDIS_NAMESPACE=staging  # production では production
```

**fastapi.env** に追加:
```
REDIS_URL=
REDIS_NAMESPACE=staging  # production では production
```

staging と production で別データベースを使うことを推奨します。同じ Redis を共有する場合でも、`UPSTASH_REDIS_NAMESPACE` と `REDIS_NAMESPACE` は必ず `APP_ENV` と同じ値にしてください。

### Vercel Integration（代替手段）

Vercel Dashboard → Integrations → Upstash を使う場合も、正本は `.secrets/` に寄せます。自動作成された値を確認し、`nextjs.env` に同じキーを登録してから同期してください。

### 動作確認

```bash
npm run dev
# ブラウザでアクセスし以下を確認:
# - レートリミットが機能する（連続リクエストで 429 が返る）
# - ES レビューの SSE ストリーミングが正常に動作する
# Upstash ダッシュボードの Data Browser でキーが作成されていれば正常
```

### 料金の目安

- **Free**: 10,000 コマンド/日、256MB — 開発・テスト用
- **Pay-as-you-go**: $0.2 / 100K コマンド — 小〜中規模の本番に十分
- 就活 Pass の現時点の想定使用量: 月額 $5-20 程度

## 整合性ルール

1. **shared.env の変数は service env に重複定義しない** — 同じ値でも重複していたら同期前にエラーで止める
2. **`APP_ENV` が全スタック（Vercel / Railway 両方）の環境判定の正本** — FastAPI も `APP_ENV` を設定する。`RAILWAY_ENVIRONMENT_NAME` は同期メタキーとしてだけ使う。
3. **Redis namespace は `APP_ENV` と一致させる** — staging / production で同じ Redis を共有する場合もキー空間を分ける。
4. **Vercel/Railway/Supabase の project ID は staging と production で分ける** — 同じ project ID を使うと同期前にエラーで止める
5. **Stripe key prefix を環境と一致させる** — staging は `sk_test_`、production は `sk_live_`
6. **Placeholder 値（`changeme`, `dummy`, `test` 等）は拒否される** — 実際の値を設定すること

## キー差分確認の注意

`--check --json` は provider 差分としてキー名だけを出力します。値は表示しません。ローカル bundle については、同期前事故を防ぐため `APP_ENV`、Stripe key prefix、namespace、project ID 分離などの形式検査を行います。Cloudflare は bootstrap 専用で、`sync-career-compass-secrets.sh --target all` の対象ではありません。

## 参考

- 変数の完全なリスト: `docs/operations/platform/ENVIRONMENT_VARIABLES.md`
- sync スクリプト: `scripts/release/sync-career-compass-secrets.sh`
- Backend の型安全設定: `backend/app/config.py`
- Frontend の型安全設定: `src/env/server.ts`, `src/env/client.ts`
