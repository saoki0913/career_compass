# Step 3: Railway にバックエンドをデプロイ

[← 目次に戻る](./PRODUCTION.md) | [環境変数リファレンス →](./ENV_REFERENCE.md)

---

## 3-0. Railway アカウント作成 & CLI インストール

### アカウント作成

1. https://railway.com/ にアクセス
2. **Start a New Project** → **GitHub で登録**（推奨）
3. GitHub アカウントと連携を許可

> GitHub 連携すると、リポジトリからの自動デプロイが可能になります。

### CLI インストール（任意）

```bash
# グローバルインストール（任意のディレクトリで実行可能）
npm install -g @railway/cli

# ログイン（ブラウザが開きます）
railway login

# 確認
railway whoami
```

> CLI はデプロイやログ確認に便利ですが、Dashboard のみでも運用できます。

## 3-1. プロジェクト & サービス作成

### Dashboard から作成（推奨）

1. https://railway.com/dashboard にログイン
2. 右上の **「New Project」** ボタンをクリック
3. **「Deploy from GitHub repo」** を選択
4. GitHub 連携がまだの場合は GitHub アカウントとの連携を許可
5. リポジトリ検索欄で `career_compass` と入力 → `saoki0913/career_compass` をクリック
6. 2 つの選択肢が表示される:
   - **「Add Variables」** → 先に環境変数を設定してからデプロイ（推奨）
   - **「Deploy Now」** → 即座にデプロイ開始（変数は後から設定可能）
7. 初回デプロイは設定が未完了のため失敗しても問題ない

> デプロイ後、**Project Canvas**（プロジェクトの全体管理画面）に遷移します。

### サービスの Source 設定

1. Project Canvas 上でサービスのカードをクリック
2. 右パネルが開く → **「Settings」** タブをクリック
3. **Source** セクションを見つける

| 設定項目 | 値 | 説明 |
|---|---|---|
| Repository | `saoki0913/career_compass` | GitHub リポジトリ（自動設定済み） |
| Branch | `main` | 本番デプロイ対象ブランチ |
| Root Directory | `/backend` | **重要**: 入力欄に `/backend` と入力 |

> **Root Directory**: プロジェクトのルートに Next.js と FastAPI が共存しているため、`/backend` を指定して FastAPI のみをビルド対象にします。

### Build 設定

1. 同じ **「Settings」** タブ内の **Build** セクションを見つける

| 設定項目 | 値 | 説明 |
|---|---|---|
| Builder | **Dockerfile** | `backend/railway.toml` で自動検出 |
| Dockerfile Path | `Dockerfile` | Root Directory (`/backend`) からの相対パス |
| Watch Paths | `/backend/**` | バックエンドの変更のみでデプロイトリガー |

> Watch Paths を設定すると、フロントエンドだけの変更時にバックエンドが無駄に再デプロイされるのを防げます。

> **メモリ要件**: Cross-encoder モデル (`japanese-reranker-small-v2`, ~70M params) + ChromaDB + FastAPI で約 800MB〜1.2GB 使用。Railway はデフォルトで 8GB RAM まで利用可能（従量課金）。

## 3-2. Networking 設定（公開ドメイン）

デフォルトではサービスは外部からアクセスできません。公開ドメインを生成する必要があります。

1. サービスの **「Settings」** タブ → **「Networking」** セクションを見つける

### Public Networking

1. **Public Networking** セクション内の **「Generate Domain」** ボタンをクリック
2. 自動生成されるドメイン（例: `career-compass-backend-production.up.railway.app`）を確認
3. このドメインをコピー → Vercel の `FASTAPI_URL` に設定する（[Step 4-4 参照](./VERCEL.md#4-4-環境変数を設定)）
4. SSL 証明書は自動で発行・更新される（設定不要）

> カスタムドメインを使う場合は **Custom Domain** から設定可能（DNS の CNAME レコード設定が必要）。

### Private Networking

同じ Railway プロジェクト内のサービス間通信に使用。今回は Vercel（外部）からのアクセスなので **Public Networking のみ必要**。

## 3-3. Volume を設定（永続ストレージ）

ChromaDB と BM25 インデックスはファイルに保存されるため、永続 Volume が必要です。
Volume がないとデプロイごとにデータが消失します。

### Volume の作成方法（2 通り）

**方法 1: Project Canvas で右クリック**
1. Project Canvas の空白部分を **右クリック**
2. コンテキストメニューから **Volume** の作成オプションを選択

**方法 2: Command Palette**
1. `⌘K`（Mac）/ `Ctrl+K`（Windows）で Command Palette を開く
2. 「volume」と入力して Volume 作成を選択

### Volume の設定

1. 接続先サービスを選択するプロンプトが表示 → バックエンドサービスを選択
2. 以下を設定:

| 設定 | 値 | 説明 |
|---|---|---|
| Name | `career-compass-data` | 任意の名前 |
| Mount Path | `/app/data` | Dockerfile の WORKDIR `/app` + `data/` |

> **重要**: Volume はランタイム時にマウントされます（ビルド時ではない）。ビルドフェーズ中に書き込んだデータは Volume には保存されません。
>
> `backend/docker-entrypoint.sh` が `/app/data/chroma` と `/app/data/bm25` サブディレクトリを自動作成し、パーミッションを設定します。
>
> **初回起動時**: Volume は空の状態。企業情報を取得するたびにデータが蓄積されます。
>
> Railway は `RAILWAY_VOLUME_NAME` と `RAILWAY_VOLUME_MOUNT_PATH` 環境変数を自動で注入します（手動設定不要）。

## 3-4. 環境変数を設定

1. Project Canvas 上でサービスのカードをクリック
2. 右パネルの **「Variables」** タブをクリック

### 変数の追加方法（3 通り）

**方法 1: 個別追加**
- **「New Variable」** ボタンをクリック → キーと値を入力

**方法 2: RAW Editor で一括ペースト（推奨）**
- **「RAW Editor」** ボタンをクリック（Variables タブ内右上付近）
- `.env` 形式（`KEY=VALUE`、1 行 1 変数）でまとめてペースト → **「Update Variables」** で保存

**方法 3: 自動サジェスト**
- Railway が GitHub リポジトリ内の `.env` / `.env.example` ファイルを検出した場合、サジェストが表示される → ワンクリックでインポート可能

### 必須変数

```bash
# AI API キー
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# CORS（Vercel フロントエンドのドメインを許可）
CORS_ORIGINS=["https://shupass.jp"]

# ポート
# Railway などの PaaS は PORT を自動注入することが多いため、通常は手動設定不要です。
# (ローカル/固定したい場合のみ) PORT=8000
# PORT=8000
```

### 任意変数（推奨）

```bash
# LLM ベースモデルID
CLAUDE_MODEL=claude-sonnet-4-5-20250929
CLAUDE_HAIKU_MODEL=claude-haiku-4-5-20251001
OPENAI_MODEL=gpt-5-mini

# 機能別モデルティア設定（claude-sonnet / claude-haiku / openai）
MODEL_ES_REVIEW=claude-sonnet
MODEL_GAKUCHIKA=claude-haiku
MODEL_MOTIVATION=claude-haiku
MODEL_SELECTION_SCHEDULE=claude-haiku
MODEL_COMPANY_INFO=openai
MODEL_RAG_QUERY_EXPANSION=claude-haiku
MODEL_RAG_HYDE=claude-sonnet
MODEL_RAG_RERANK=claude-sonnet
MODEL_RAG_CLASSIFY=claude-haiku

# RAG 埋め込み設定
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_MAX_INPUT_CHARS=8000

# ハイブリッド検索
USE_HYBRID_SEARCH=true

# ES 添削設定
ES_REWRITE_COUNT=1

# デバッグ無効化（本番）
DEBUG=false
COMPANY_SEARCH_DEBUG=false
WEB_SEARCH_DEBUG=false

# Redis キャッシュ（任意）
# REDIS_URL=redis://...
```

### 設定不要な変数

| 変数 | 理由 |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | DB アクセスはフロントエンド (Drizzle ORM) が担当 |
| `NEXT_PUBLIC_APP_URL` | フロントエンド専用の環境変数 |
| `BETTER_AUTH_*` | 認証はフロントエンド側のみ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth はフロントエンド側のみ |
| `ENCRYPTION_KEY` | 暗号化はフロントエンド側のみ |
| `STRIPE_*` | 決済はフロントエンド (Vercel) 側のみ |
| `CLOUDFLARE_*` / `R2_*` | オブジェクトストレージはフロントエンド側のみ |
| `UPSTASH_REDIS_*` | レート制限はフロントエンド側のみ |
| `CRON_SECRET` | Vercel Cron 用の認証トークン |

> **Tip**: Railway の Variables 画面では **Shared Variables**（プロジェクト全体で共有）と **Service Variables**（サービス固有）を分けて管理できます。API キーは Service Variables に設定してください。

## 3-5. Deploy 設定

サービスの **「Settings」** タブ → **Deploy** セクション

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Healthcheck Path | `/health` | `railway.toml` で設定済み |
| Healthcheck Timeout | `10` (秒) | `railway.toml` で設定済み |
| Restart Policy | `On Failure` | クラッシュ時のみ再起動 |
| Max Retries | `3` | 3回失敗で停止 |
| Railway Config File | `railway.toml` | Root Directory からの相対パス |

> `backend/railway.toml` にこれらの設定が含まれているため、Dashboard での手動設定は不要です。変更したい場合は `railway.toml` を編集するか、Dashboard から上書きできます。

## 3-6. リソース制限（任意）

サービスの **「Settings」** タブ → **Resource Limits** セクション

デフォルトでは制限なし（8 vCPU / 8GB RAM まで利用可能）。コスト管理のため上限を設定することを推奨。

| リソース | 推奨上限 | 説明 |
|---|---|---|
| vCPU | `2` | 通常利用なら十分 |
| Memory | `2 GB` | Cross-encoder + ChromaDB で ~1.2GB |

> 月額コストの上限は Railway Dashboard → **Settings** → **Usage** → **Spending Limit** で設定できます。

## 3-7. デプロイ実行 & 確認

### 自動デプロイ

GitHub 連携済みの場合、`main` ブランチへの push で自動デプロイが開始されます。

Project Canvas 上でサービスをクリック → 右パネルの **「Deployments」** タブでデプロイ状況を確認。

### CLI でデプロイ（手動）

```bash
cd backend
railway up
```

### デプロイログの確認

サービスの **「Deployments」** タブ → 対象デプロイをクリック → **Build Logs** / **Deploy Logs**

または CLI:
```bash
railway logs
```

### ヘルスチェック

デプロイ完了後、公開ドメインにアクセス:

```bash
curl https://career-compass-backend-production.up.railway.app/
# => {"message": "Career Compass API", "version": "0.1.0"}

curl https://career-compass-backend-production.up.railway.app/health
# => {"status": "healthy"}
```

> デプロイ直後は Cross-encoder モデルのダウンロード（初回のみ、~200MB）に数分かかる場合があります。ヘルスチェックが通るまで待ってください。

## 3-8. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| ビルド失敗 | Root Directory 未設定 | Settings → Source → Root Directory を `/backend` に |
| 起動後すぐクラッシュ | メモリ不足 | Resource Limits で Memory を 2GB 以上に |
| ヘルスチェック失敗 | ポート不一致 | アプリが `$PORT` で待受できているか確認。Variables で `PORT` を手動上書きしている場合は削除（Railway 自動注入を優先） |
| Volume データ消失 | Volume 未マウント | Settings → Volumes で `/app/data` にマウントされているか確認 |
| CORS エラー | `CORS_ORIGINS` 未設定 | Variables に `CORS_ORIGINS=["https://shupass.jp"]` を追加 |
| 外部からアクセス不可 | Public Domain 未生成 | Settings → Networking → Generate Domain |
