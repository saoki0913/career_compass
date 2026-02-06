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

## 🤖 AI (OpenAI / Anthropic) - 必要な場合

ES添削や企業RAGを使う場合はAPIキーを設定します。

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# RAG 埋め込み設定
EMBEDDINGS_PROVIDER=auto  # auto | openai | local
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
LOCAL_EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
```

### LLMモデル選択（オプション）

各機能で使用するLLMモデルを個別に上書き可能:

```env
MODEL_ES_REVIEW=claude-sonnet        # ES添削
MODEL_GAKUCHIKA=claude-haiku         # ガクチカ深掘り
MODEL_MOTIVATION=claude-haiku        # 志望動機
MODEL_COMPANY_INFO=openai            # 企業情報抽出
MODEL_RAG_QUERY_EXPANSION=claude-haiku # クエリ拡張
MODEL_RAG_HYDE=claude-sonnet         # HyDE生成
MODEL_RAG_RERANK=claude-sonnet       # リランキング
MODEL_RAG_CLASSIFY=claude-haiku      # コンテンツ分類
MODEL_SELECTION_SCHEDULE=claude-haiku # 選考スケジュール
```

### RAGチューニング（オプション）

```env
RAG_SEMANTIC_WEIGHT=0.6              # セマンティック検索の重み
RAG_KEYWORD_WEIGHT=0.4               # キーワード検索の重み
RAG_RERANK_THRESHOLD=0.7             # リランク閾値
RAG_USE_QUERY_EXPANSION=true         # クエリ拡張の有効化
RAG_USE_HYDE=true                    # HyDEの有効化
RAG_USE_MMR=true                     # MMR多様性フィルタの有効化
RAG_USE_RERANK=true                  # リランキングの有効化
RAG_MMR_LAMBDA=0.5                   # MMRの関連性/多様性バランス
RAG_FETCH_K=30                       # フェッチ候補数
RAG_MAX_QUERIES=3                    # クエリ拡張の最大数
RAG_MAX_TOTAL_QUERIES=4              # 元クエリ含む総クエリ数
```

ローカル埋め込みを使う場合は FastAPI の仮想環境で:

```bash
pip install sentence-transformers
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

> BM25キーワード検索は `bm25s` ライブラリで実装済み。日本語トークナイズには `fugashi` + `unidic-lite` を使用。
> `requirements.txt` に含まれているため、`pip install -r requirements.txt` で自動インストールされます。

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

Google OAuth、Stripe は機能を使う段階で設定すればOKです。

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
| `OPENAI_API_KEY` | OpenAI APIキー（Embeddings + GPT） | 🔶 | OpenAI Dashboard |
| `ANTHROPIC_API_KEY` | Anthropic APIキー（Claude） | 🔶 | Anthropic Console |
| `NEXT_PUBLIC_FASTAPI_URL` | FastAPI バックエンドURL | 🔶 | `http://localhost:8000`（開発時） |

✅ = 必須、🔶 = 機能使用時に必要

---

## 次のステップ

環境設定が完了したら、Claude Code で以下を実行:

```
/dev-continue を実行して
```

これで開発を開始できます。
