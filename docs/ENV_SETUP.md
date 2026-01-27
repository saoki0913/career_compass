# 環境設定ガイド - ウカルン (Career Compass)

このドキュメントでは、開発環境のセットアップ手順を説明します。

---

## 前提条件

- Node.js 20.x 以上
- npm 10.x 以上
- Python 3.11 以上（FastAPIバックエンド用）

---

## Step 1: 依存関係のインストール

```bash
npm install
```

---

## Step 2: 環境変数の設定

### `.env.local` ファイルを作成

```bash
cp .env.example .env.local
```

以下のサービスごとに設定を行います。

---

## 🗄️ Turso (データベース) - 必須

Turso は SQLite 互換の分散データベースです。

### 1. アカウント作成

https://turso.tech/ でアカウントを作成

### 2. Turso CLI のインストール

```bash
# macOS
brew install tursodatabase/tap/turso

# その他
curl -sSfL https://get.tur.so/install.sh | bash
```

### 3. ログイン

```bash
turso auth login
```

### 4. データベース作成

```bash
turso db create career-compass
```

### 5. 接続情報の取得

```bash
# データベースURL
turso db show career-compass --url

# 認証トークン
turso db tokens create career-compass
```

### 6. `.env.local` に設定

```env
TURSO_DATABASE_URL=libsql://career-compass-your-account.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

---

## 🔐 Better Auth (認証) - 必須

### 1. シークレットキーの生成

```bash
openssl rand -base64 32
```

### 2. `.env.local` に設定

```env
BETTER_AUTH_SECRET=（上記で生成した32文字以上のランダム文字列）
BETTER_AUTH_URL=http://localhost:3000
```

---

## 🔑 Google OAuth - 必須

Google OAuth はカレンダー連携に必要です。

### 1. Google Cloud Console でプロジェクト作成

1. https://console.cloud.google.com/ にアクセス
2. 新しいプロジェクトを作成（例: `career-compass-dev`）

### 2. OAuth 同意画面の設定

1. 「APIとサービス」→「OAuth 同意画面」
2. User Type: 「外部」を選択
3. アプリ情報を入力:
   - アプリ名: `ウカルン（開発）`
   - ユーザーサポートメール: あなたのメールアドレス
   - デベロッパーの連絡先: あなたのメールアドレス
4. スコープ:
   - `email`
   - `profile`
   - `openid`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.freebusy`

### 3. OAuth クライアント ID の作成

1. 「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「OAuth クライアント ID」
3. アプリケーションの種類: 「ウェブアプリケーション」
4. 承認済みの JavaScript 生成元:
   ```
   http://localhost:3000
   ```
5. 承認済みのリダイレクト URI:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
6. クライアント ID とシークレットをコピー

### 4. `.env.local` に設定

```env
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
```

---

## 💳 Stripe (決済) - オプション（後で設定可）

### 1. Stripe アカウント作成

https://dashboard.stripe.com/ でアカウントを作成

### 2. API キーの取得

1. ダッシュボード右上で「テストモード」をON
2. 「開発者」→「APIキー」
3. 公開可能キーとシークレットキーをコピー

### 3. Webhook シークレットの取得（ローカル開発用）

```bash
# Stripe CLI のインストール
brew install stripe/stripe-cli/stripe

# ログイン
stripe login

# Webhook 転送の開始
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

上記コマンドで表示される `whsec_...` をコピー

### 4. `.env.local` に設定

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### 5. 商品・価格の作成

Stripe ダッシュボードで以下の商品を作成:

| 商品名 | 価格 | 請求間隔 |
|-------|------|---------|
| Standard | ¥980 | 月次 |
| Pro | ¥2,980 | 月次 |

---

## 🐙 GitHub Token - オプション

GitHub API へのアクセス（Issue作成、PR管理など）に使用します。

### 1. Personal Access Token の作成

1. https://github.com/settings/tokens にアクセス
2. 「Generate new token」→「Generate new token (classic)」をクリック
3. 設定項目:
   - **Note**: 任意の名前（例: `career-compass-dev`）
   - **Expiration**: 有効期限を選択
   - **Select scopes**: 必要なスコープを選択
     - `repo` - リポジトリへのフルアクセス
     - `read:org` - 組織の読み取り（必要な場合）
4. 「Generate token」をクリック
5. 表示されたトークン（`ghp_...`）をコピー

⚠️ **重要**: トークンは**この画面でしか表示されません**。必ずコピーして保存してください。

### 2. `.env.local` に設定

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 📦 Cloudflare R2 (ストレージ) - オプション（後で設定可）

Cloudflare R2 は S3 互換のオブジェクトストレージです。エグレス（データ転送）料金が無料なのが特徴です。

> 📖 公式ドキュメント: https://developers.cloudflare.com/r2/

### 1. Cloudflare アカウント作成・R2 有効化

1. https://dash.cloudflare.com/ でアカウントを作成
2. ダッシュボード左メニューから「Storage & Databases」→「R2 Object Storage」を選択
3. 初回の場合、R2 の有効化フローを完了（クレジットカード登録が必要、無料枠あり）

### 2. アカウント ID の確認

1. ダッシュボードの URL を確認: `https://dash.cloudflare.com/{ACCOUNT_ID}/r2`
2. または「R2 Object Storage」→「Overview」ページの右側に表示

### 3. R2 バケットの作成

1. 「R2 Object Storage」→「Overview」→「Create bucket」をクリック
2. バケット名を入力: `career-compass`（小文字、ハイフン使用可）
3. ロケーションを選択（通常は「Automatic」でOK）
4. 「Create bucket」をクリック

### 4. API トークンの作成（S3 互換 API 用）

1. 「R2 Object Storage」→「Overview」→「Manage R2 API Tokens」をクリック
2. 「Create API token」をクリック
3. 設定項目:
   - **Token name**: 任意の名前（例: `career-compass-dev`）
   - **Permissions**: 「Object Read & Write」を選択
   - **Specify bucket(s)**: 「Apply to specific buckets only」で作成したバケットを選択
   - **TTL**: 必要に応じて有効期限を設定（無期限も可）
4. 「Create API Token」をクリック

### 5. 認証情報の保存（重要）

トークン作成後、以下の2つの値が表示されます:

| 項目 | 説明 |
|------|------|
| **Access Key ID** | S3 互換 API のアクセスキー |
| **Secret Access Key** | S3 互換 API のシークレットキー |

⚠️ **重要**: Secret Access Key は**この画面でしか表示されません**。必ずこの時点でコピーして安全な場所に保存してください。

### 6. `.env.local` に設定

```env
# Cloudflare アカウント ID（ダッシュボード URL から取得）
CLOUDFLARE_ACCOUNT_ID=your-account-id

# R2 API トークンから取得した認証情報
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key

# バケット名
R2_BUCKET_NAME=career-compass

# パブリックアクセス URL（公開URLを使う場合のみ。Signed URLのみなら不要）
# R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

> **Note**: S3互換エンドポイント (`https://{ACCOUNT_ID}.r2.cloudflarestorage.com`) はコード内で `CLOUDFLARE_ACCOUNT_ID` から自動構築されるため、環境変数として設定不要です。

### 7. パブリックアクセスの設定（任意）

ファイルを公開URLでアクセス可能にする場合:

1. バケットの「Settings」タブを開く
2. 「Public access」セクションで「Allow Access」を有効化
3. 表示された `r2.dev` サブドメインを `R2_PUBLIC_URL` に設定

### 補足: S3 互換 SDK での接続例

```typescript
import { S3Client } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
```

---

## Step 3: データベースの初期化

```bash
npm run db:push
```

スキーマの確認:

```bash
npm run db:studio
```

---

## Step 4: 開発サーバーの起動

### Next.js (フロントエンド + API)

```bash
npm run dev
```

http://localhost:3000 でアクセス可能

### FastAPI (AI バックエンド) - 必要な場合

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

http://localhost:8000/docs でAPIドキュメント確認可能

---

## 最小構成（とりあえず動かしたい場合）

以下だけ設定すれば、基本的な動作確認ができます:

```env
# 必須
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=eyJ...
BETTER_AUTH_SECRET=（32文字以上のランダム文字列）
BETTER_AUTH_URL=http://localhost:3000

# アプリURL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Google OAuth、Stripe、R2 は機能を使う段階で設定すればOKです。

---

## トラブルシューティング

### データベース接続エラー

```bash
# Turso CLI で直接接続して確認
turso db shell career-compass
```

### Better Auth のエラー

- `BETTER_AUTH_SECRET` が32文字未満の場合エラーになります
- シークレットを再生成してください

### Google OAuth エラー

- リダイレクト URI が正確に一致しているか確認
- `http://localhost:3000/api/auth/callback/google`（末尾スラッシュなし）

### Stripe Webhook が受信できない

```bash
# Stripe CLI でローカル転送を開始
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## 環境変数一覧

| 変数名 | 説明 | 必須 | 取得先 |
|--------|------|:----:|--------|
| `TURSO_DATABASE_URL` | Turso DB URL | ✅ | Turso CLI |
| `TURSO_AUTH_TOKEN` | Turso 認証トークン | ✅ | Turso CLI |
| `BETTER_AUTH_SECRET` | 認証シークレット | ✅ | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | 認証ベースURL | ✅ | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth ID | 🔶 | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | 🔶 | Google Cloud Console |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー | 🔶 | Stripe Dashboard |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 公開キー | 🔶 | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook シークレット | 🔶 | Stripe CLI |
| `GITHUB_TOKEN` | GitHub Personal Access Token | 🔶 | GitHub Settings > Tokens（⚠️一度のみ表示） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID | 🔶 | Cloudflare Dashboard URL |
| `R2_ACCESS_KEY_ID` | R2 アクセスキー | 🔶 | R2 API トークン作成時 |
| `R2_SECRET_ACCESS_KEY` | R2 シークレットキー | 🔶 | R2 API トークン作成時（⚠️一度のみ表示） |
| `R2_BUCKET_NAME` | R2 バケット名 | 🔶 | Cloudflare Dashboard |
| `R2_PUBLIC_URL` | R2 パブリックURL | 🔶 | Cloudflare Dashboard（公開URL使用時のみ） |

✅ = 必須、🔶 = 機能使用時に必要

---

## 次のステップ

環境設定が完了したら、Claude Code で以下を実行:

```
/dev-continue を実行して
```

これで開発を開始できます。
