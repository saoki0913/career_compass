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

# 5. プロバイダとの key drift 確認（CLI 認証が必要）
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
└── shared-vars.json       ← クロスサービス変数マニフェスト
```

## ファイル別設定ガイド

### 1. shared.env（最初に設定）

BFF (Next.js) と FastAPI の両方で同じ値が必要な 3 変数を管理します。**nextjs.env / fastapi.env には重複定義しないでください**（sync スクリプトが shared.env → service env の順でマージします）。

```bash
# 値の生成（32文字以上のランダム文字列）
openssl rand -hex 32
```

staging と production で**異なる値**を設定してください。

### 2. nextjs.env

Vercel の環境変数として同期されます。

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
- `APP_ENV` / `NEXT_PUBLIC_APP_ENV` — 論理環境。`APP_ENV` が全スタック（Vercel / Railway 両方）の正本です。

**staging と production の違い:**
- URL: `stg.shupass.jp` vs `www.shupass.jp`
- Logical env: `staging` vs `production`
- Stripe: `sk_test_...` vs `sk_live_...`
- `BETTER_AUTH_TRUSTED_ORIGINS`: staging は 1 origin、production は 2 origin

### 3. fastapi.env

Railway の環境変数として同期されます。

**必ず設定が必要なもの:**
- `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_NAME` / `RAILWAY_ENVIRONMENT_NAME` — sync メタキー
- `APP_ENV` — `staging` or `production`。FastAPI も `APP_ENV` を設定します。`ENVIRONMENT` / `RAILWAY_ENVIRONMENT_NAME` は後方互換 fallback と sync メタキーとして当面併記し、リリースBで撤去予定です。
- `CORS_ORIGINS` — CORS 許可オリジン
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — LLM API キー

### 4. supabase.env

`production/supabase.env` には `SUPABASE_PRODUCTION_PROJECT_REF`、`staging/supabase.env` には `SUPABASE_STAGING_PROJECT_REF` が必須です。Supabase Dashboard → Settings → General から各 project の ref をコピーしてください。

現行 project:
- staging: `career-compass-staging` / `vbjykhkyhmxickxcgvdh`
- production: `career-compass-db`

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
UPSTASH_REDIS_REST_URL=https://xxxxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**fastapi.env** に追加:
```
REDIS_URL=rediss://default:xxxx@xxxx.upstash.io:6379
```

staging と production で別データベースを使ってください。

### Vercel Integration（代替手段）

Vercel Dashboard → Integrations → Upstash を追加すると、`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` が自動設定されます。この場合は nextjs.env への手動追加は不要です。

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

1. **shared.env の変数は service env に重複定義しない** — `merge_env_files()` が shared → service の順でマージ
2. **shared.env の変数が nextjs.env と fastapi.env の両方に存在する場合、値が一致していないと sync がエラーで中断**
3. **`APP_ENV` が全スタック（Vercel / Railway 両方）の環境判定の正本** — FastAPI も `APP_ENV` を設定する。`ENVIRONMENT` / `RAILWAY_ENVIRONMENT_NAME` は後方互換 fallback と sync メタキーとして当面併記し、リリースBで撤去予定。
4. **Placeholder 値（`changeme`, `dummy`, `test` 等）は拒否される** — 実際の値を設定すること

## 参考

- 変数の完全なリスト: `docs/ops/ENVIRONMENT_VARIABLES.md`
- sync スクリプト: `scripts/release/sync-career-compass-secrets.sh`
- Backend の型安全設定: `backend/app/config.py`
- Frontend の型安全設定: `src/env/server.ts`, `src/env/client.ts`
