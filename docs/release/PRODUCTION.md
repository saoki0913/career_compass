# 本番リリース計画（Vercel + Render）

本番環境へリリースするための設定・確認事項をまとめたドキュメントです。
Cloudflare R2 は **今回使用しません**。

---

## 1. 前提

- フロント: **Vercel**
- バックエンド: **Render（FastAPI）**
- DB: **Turso（prod/staging）**
- 監視: **Sentry（推奨）**
- 環境: **staging / production の2環境**

---

## 2. 環境別設定一覧

### 2.1 共通（staging / production どちらも必要）

- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `FASTAPI_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `SENTRY_DSN`
- `RAG_*` 系（`.env.example` に記載のチューニング項目）

### 2.2 staging / production の差分

- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_URL`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `FASTAPI_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `SENTRY_DSN`

---

## 3. Vercel 設定

- デプロイ先: `staging` と `production` を分ける  
- `vercel.json` の cron 設定が有効であること  
  - `/api/cron/daily-notifications`

---

## 4. Render 設定（FastAPI）

- `backend/` を Web Service としてデプロイ
- ポート: `8000`
- 永続ディスクを `backend/data/` にマウント  
  - ChromaDB: `backend/data/chroma`
  - BM25: `backend/data/bm25`

---

## 5. 外部サービスの本番設定

### Google OAuth

- 本番ドメインのリダイレクトURIを登録  
  `https://<domain>/api/auth/callback/google`

### Stripe

- 本番モードで商品/価格を作成  
- Webhook を本番URLで登録

### Turso

- prod/staging それぞれ別DBを作成

### Sentry

- Next.js / FastAPI それぞれ別プロジェクトでDSNを取得

---

## 6. リリース前後チェックリスト

### リリース前

- OAuth redirect URI 本番設定済み  
- Stripe Webhook 本番設定済み  
- Turso prod DB 初期化済み  
- Render 永続ディスク設定済み  
- Vercel cron の有効化確認

### リリース後

- ログイン/オンボーディング動作確認  
- ES添削/企業情報取得の動作確認  
- Cron実行ログ確認  
- Sentryにイベントが届くことを確認

---

## 7. 非対応/除外事項

- Cloudflare R2 は使用しない
