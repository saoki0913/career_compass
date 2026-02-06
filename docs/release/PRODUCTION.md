# 本番リリース手順書（Vercel + Render + Turso）

Career Compass (ウカルン) の本番デプロイ手順をステップバイステップで記載します。

**本番ドメイン**: `shupass.jp`（お名前.com で取得済み）

---

## 構成

```
                    shupass.jp
                        │
                    ┌────▼────┐
                    │ お名前   │  DNS (NS → Vercel)
                    │ .com    │
                    └────┬────┘
                         │
┌─────────────┐     ┌───▼──────────┐     ┌─────────┐
│   Vercel     │────▶│  Render      │────▶│  Turso   │
│  (Next.js)   │     │  (FastAPI)   │     │ (libSQL) │
│  shupass.jp  │     │  Port 8000   │     │          │
└──────┬───────┘     └──────┬───────┘     └──────────┘
       │                    │
       │                    ├── ChromaDB (永続ディスク)
       │                    └── BM25 Index (永続ディスク)
       │
       ├── Stripe (決済)
       ├── Google OAuth (認証)
       └── OpenAI / Anthropic (AI)
```

| コンポーネント | デプロイ先 | ドメイン / パス |
|---|---|---|
| フロントエンド | Vercel | `shupass.jp` / `/` (ルート) |
| バックエンド | Render | `career-compass-backend.onrender.com` / `/backend` |
| データベース | Turso (マネージド) | — |
| ベクトルDB / BM25 | Render 永続ディスク | `backend/data/` |

---

## Step 0: ドメイン設定（お名前.com → Vercel）

### 0-1. お名前.com でのドメイン取得確認

ドメイン `shupass.jp` はお名前.com で取得済み。

お名前.com Navi → **ドメイン一覧** → `shupass.jp` が「利用中」であることを確認。

### 0-2. Vercel にカスタムドメインを追加

1. Vercel Dashboard → 対象プロジェクト → Settings → **Domains**
2. `shupass.jp` を入力して **Add**
3. Vercel が推奨する DNS 設定が表示される

Vercel は以下の 2 パターンを提示します:

**パターン A: Apex ドメイン（shupass.jp）に A レコード**

| レコード種別 | ホスト名 | 値 |
|---|---|---|
| A | `@` (空欄) | `76.76.21.21` |

**パターン B: www サブドメインに CNAME**

| レコード種別 | ホスト名 | 値 |
|---|---|---|
| CNAME | `www` | `cname.vercel-dns.com` |

> **推奨**: 両方設定する。`shupass.jp` (A レコード) + `www.shupass.jp` (CNAME)。
> Vercel 側で `www.shupass.jp` → `shupass.jp` への自動リダイレクトを設定可能。

### 0-3. お名前.com で DNS レコードを設定

お名前.com Navi → **ドメイン設定** → **DNS設定/転送設定** → `shupass.jp` → **DNSレコード設定を利用する**

以下のレコードを追加:

| ホスト名 | TYPE | TTL | VALUE | 優先 |
|---|---|---|---|---|
| (空欄) | A | 3600 | `76.76.21.21` | — |
| www | CNAME | 3600 | `cname.vercel-dns.com` | — |

> **注意**: お名前.com のデフォルト DNS サーバー（お名前.com のネームサーバー）を使用している前提です。
> 既にネームサーバーを変更している場合はそちらの管理画面で設定してください。

### 0-4. DNS 反映確認

DNS レコードの反映には数分〜最大 48 時間かかります（通常は 10 分〜1 時間）。

```bash
# A レコード確認
dig shupass.jp A +short
# => 76.76.21.21

# CNAME 確認
dig www.shupass.jp CNAME +short
# => cname.vercel-dns.com.

# HTTPS でアクセス確認
curl -I https://shupass.jp
# => HTTP/2 200 (Vercel が応答)
```

### 0-5. SSL 証明書の確認

Vercel が DNS 設定を検証し、自動的に SSL 証明書（Let's Encrypt）を発行します。

Vercel Dashboard → Settings → **Domains** で以下を確認:
- `shupass.jp` → **Valid Configuration** (緑チェック)
- `www.shupass.jp` → **Redirects to shupass.jp** (緑チェック)

> SSL 証明書の発行には DNS 反映後、数分かかります。

---

## Step 1: Turso 本番データベースの作成

### 1-1. Turso CLI インストール

```bash
# macOS
brew install tursodatabase/tap/turso

# ログイン
turso auth login
```

### 1-2. 本番用データベース作成

```bash
# 東京リージョン にDBを作成
turso db create career-compass-production --location aws-ap-northeast-1

# 接続URLを取得（控えておく）
turso db show career-compass-production --url
# => libsql://career-compass-production-xxx.turso.io

# 認証トークンを取得（控えておく）
turso db tokens create career-compass-production
# => eyJ...
```

### 1-3. スキーマを本番DBに適用

```bash
# プロジェクトルートで実行
TURSO_DATABASE_URL=libsql://career-compass-production-xxx.turso.io \
TURSO_AUTH_TOKEN=eyJ... \
npm run db:push
```

> **確認**: `npm run db:studio` でテーブルが作成されたことを確認。

---

## Step 2: Render にバックエンドをデプロイ

### 2-1. Render で Web Service 作成

1. https://render.com にログイン
2. **New** → **Web Service** を選択
3. GitHub リポジトリ `saoki0913/career_compass` を連携

| 設定項目 | 値 |
|---|---|
| Name | `career-compass-backend` |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | **Docker** |
| Instance Type | **Starter** ($7/月) 以上 |

> **注意**: `sentence-transformers` / `torch` のメモリ要件があるため Free プランでは不足する可能性があります。最低 512MB RAM (Starter) を推奨、余裕を持たせるなら Standard (2GB) を推奨。

### 2-2. 永続ディスクを設定

ChromaDB と BM25 インデックスはファイルに保存されるため、永続ディスクが必要です。

Render Dashboard → 対象 Web Service → **Disks**

| 設定 | 値 |
|---|---|
| Name | `career-compass-data` |
| Mount Path | `/app/data` |
| Size | 1 GB |

> `backend/Dockerfile` の `WORKDIR` が `/app` なので、マウントパスは `/app/data` になります。

### 2-3. 環境変数を設定

Render Dashboard → 対象 Web Service → **Environment**

```bash
# === 必須 ===
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TURSO_DATABASE_URL=libsql://career-compass-production-xxx.turso.io
TURSO_AUTH_TOKEN=eyJ...

# === CORS ===
CORS_ORIGINS=["https://shupass.jp"]

# === LLMモデル設定 ===
CLAUDE_MODEL=claude-sonnet-4-5-20250929
CLAUDE_HAIKU_MODEL=claude-haiku-4-5-20251001
OPENAI_MODEL=gpt-5-mini

# === デバッグ無効化 ===
DEBUG=false
FASTAPI_DEBUG=false
COMPANY_SEARCH_DEBUG=false
WEB_SEARCH_DEBUG=false

# === オプション ===
# REDIS_URL=redis://...（キャッシュを使う場合）
# ES_REWRITE_COUNT=1（リライト案の出力数、デフォルト1）
```

### 2-4. Health Check 設定

Render Dashboard → 対象 Web Service → **Settings** → **Health Check**

| 設定 | 値 |
|---|---|
| Path | `/` |
| Expected Code | `200` |

### 2-5. デプロイ確認

デプロイ完了後、以下にアクセスして応答を確認:

```
https://career-compass-backend.onrender.com/
# => {"message": "Career Compass API", "version": "0.1.0"}
```

---

## Step 3: Vercel にフロントエンドをデプロイ

### 3-1. Vercel にプロジェクトをインポート

1. https://vercel.com/new にアクセス
2. **Import Git Repository** → `saoki0913/career_compass` を選択

| 設定項目 | 値 |
|---|---|
| Framework Preset | **Next.js** (自動検出) |
| Root Directory | `.` (ルート) |
| Build Command | `npm run build` |
| Node.js Version | **20.x** |

### 3-2. ブランチ設定

Vercel Dashboard → Settings → **Git**

| 設定 | 値 |
|---|---|
| Production Branch | `main` |
| Preview Branches | `develop` (自動プレビュー) |

### 3-3. 環境変数を設定

Vercel Dashboard → Settings → **Environment Variables**

```bash
# === アプリケーション ===
NEXT_PUBLIC_APP_URL=https://shupass.jp

# === データベース ===
TURSO_DATABASE_URL=libsql://career-compass-production-xxx.turso.io
TURSO_AUTH_TOKEN=eyJ...

# === 認証 (Better Auth) ===
# シークレット生成: openssl rand -base64 32
BETTER_AUTH_SECRET=<32文字以上のランダム文字列>
BETTER_AUTH_URL=https://shupass.jp
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# === セキュリティ ===
# 生成: openssl rand -hex 32
ENCRYPTION_KEY=<64桁の16進数文字列>

# === Stripe 決済 ===
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...

# === FastAPI バックエンド URL ===
FASTAPI_URL=https://career-compass-backend.onrender.com

# === AI API キー ===
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# === LLMモデル設定 ===
CLAUDE_MODEL=claude-sonnet-4-5-20250929
OPENAI_MODEL=gpt-5-mini

# === ES添削設定 ===
ES_REWRITE_COUNT=1
```

### 3-4. カスタムドメイン

**Step 0 で設定済み。** Vercel Dashboard → Settings → **Domains** で `shupass.jp` が **Valid Configuration** であることを再確認。

---

## Step 4: 外部サービスの本番設定

### 4-1. Google OAuth リダイレクトURI

Google Cloud Console → **APIとサービス** → **認証情報** → OAuth 2.0 クライアント

**承認済みの JavaScript 生成元** に追加:
```
https://shupass.jp
```

**承認済みのリダイレクト URI** に追加:
```
https://shupass.jp/api/auth/callback/google
```

> Vercel のデフォルトドメイン（`xxx.vercel.app`）も残しておくとプレビュー環境で便利。

### 4-2. Stripe 本番設定

#### 本番モードの有効化

1. Stripe Dashboard → **本番利用の申請** を完了
2. 本番用 API キーを取得:
   - `sk_live_...` → Vercel `STRIPE_SECRET_KEY`
   - `pk_live_...` → Vercel `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

#### 商品・価格の作成

Stripe Dashboard → **商品カタログ** → **商品を追加**

| 商品名 | 月額 | Price ID の設定先 |
|---|---|---|
| Standard | ¥980 | `STRIPE_PRICE_STANDARD_MONTHLY` |
| Pro | ¥2,980 | `STRIPE_PRICE_PRO_MONTHLY` |

#### Webhook の設定

Stripe Dashboard → **開発者** → **Webhook** → **エンドポイントを追加**

| 設定 | 値 |
|---|---|
| Endpoint URL | `https://shupass.jp/api/webhooks/stripe` |
| イベント | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed` |

取得した **Signing Secret** (`whsec_...`) を Vercel の `STRIPE_WEBHOOK_SECRET` に設定。

### 4-3. Render の CORS 更新

Render 側の `CORS_ORIGINS` にカスタムドメインを設定:

```
CORS_ORIGINS=["https://shupass.jp"]
```

> Vercel のデフォルトドメインも許可する場合:
> ```
> CORS_ORIGINS=["https://shupass.jp","https://career-compass-xxx.vercel.app"]
> ```

---

## Step 5: develop → main マージ & デプロイ

### 5-1. main ブランチにマージ

```bash
git checkout main
git merge develop
git push origin main
```

> `git push` により Vercel と Render の両方で自動デプロイが開始されます。

### 5-2. デプロイ状況の確認

- **Vercel**: https://vercel.com/dashboard → Deployments タブ
- **Render**: https://dashboard.render.com → Events タブ

---

## Step 6: デプロイ後の動作確認

### 必須チェックリスト

- [ ] **バックエンド Health Check**: `https://career-compass-backend.onrender.com/` で JSON 応答を確認
- [ ] **フロントエンド表示**: `https://shupass.jp` でページが表示される
- [ ] **ドメイン SSL**: `https://shupass.jp` で証明書が有効（ブラウザの鍵アイコン確認）
- [ ] **www リダイレクト**: `https://www.shupass.jp` → `https://shupass.jp` にリダイレクトされる
- [ ] **Google ログイン**: ログイン → オンボーディング → ダッシュボード
- [ ] **企業登録**: 企業を作成し、情報取得が正常に動作する
- [ ] **ES 添削**: ES を作成 → 添削実行 → スコア・リライト結果表示
- [ ] **Stripe 決済**: テストカード `4242 4242 4242 4242` で Standard プランを購入
  - ※ テスト後にサブスクリプションをキャンセル
- [ ] **プラン機能制限**: Free / Standard / Pro で機能制限が正しく適用される

### 追加チェック（運用後）

- [ ] Vercel Cron (`/api/cron/daily-notifications`) の実行ログ確認
- [ ] Sentry にイベントが届くことを確認（設定した場合）
- [ ] Render の永続ディスク使用量確認

---

## 注意事項

### Render コールドスタート

Starter プランではアイドル時にスリープします。初回アクセスに 30秒〜1分 かかる場合があります。
フロントエンドからバックエンドへのリクエストがタイムアウトする可能性があるため、タイムアウト設定に注意。

### メモリ要件

Cross-encoder モデル (`ms-marco-MiniLM-L-6-v2`) のロードに約 300MB のメモリが必要です。

| Render プラン | RAM | 推奨度 |
|---|---|---|
| Free | 512MB | 不可（メモリ不足） |
| Starter | 512MB | 可（ぎりぎり） |
| Standard | 2GB | 推奨 |

### ChromaDB / BM25 データ

開発環境の `backend/data/` は Git に含まれていません。本番では空の状態からスタートし、企業情報を取得するたびにデータが蓄積されます。

### Vercel Cron

`vercel.json` に設定済みの日次通知 cron:
- スケジュール: `0 0 * * *` (UTC 0:00 = JST 9:00)
- Vercel **Pro プラン以上** で利用可能（Hobby では Cron は利用不可）

### Stripe テストモード → 本番モード

本番申請が完了するまではテストモードの API キー (`sk_test_`, `pk_test_`) を使用します。
本番申請完了後、本番キー (`sk_live_`, `pk_live_`) に切り替えてください。

---

## 環境変数一覧（クイックリファレンス）

### Vercel (フロントエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | `https://shupass.jp` |
| `TURSO_DATABASE_URL` | Yes | Turso 接続URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso 認証トークン |
| `BETTER_AUTH_SECRET` | Yes | 認証シークレット (32文字以上) |
| `BETTER_AUTH_URL` | Yes | `https://shupass.jp` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth クライアントID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth シークレット |
| `ENCRYPTION_KEY` | Yes | 暗号化キー (64桁hex) |
| `STRIPE_SECRET_KEY` | Yes | Stripe シークレットキー |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe 公開キー |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Webhook シークレット |
| `STRIPE_PRICE_STANDARD_MONTHLY` | Yes | Standard 月額 Price ID |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes | Pro 月額 Price ID |
| `FASTAPI_URL` | Yes | Render バックエンドURL |
| `OPENAI_API_KEY` | Yes | OpenAI API キー |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー |
| `CLAUDE_MODEL` | No | Claude モデル名 |
| `OPENAI_MODEL` | No | OpenAI モデル名 |
| `ES_REWRITE_COUNT` | No | リライト案の出力数 (デフォルト: 1) |

### Render (バックエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API キー |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー |
| `TURSO_DATABASE_URL` | Yes | Turso 接続URL |
| `TURSO_AUTH_TOKEN` | Yes | Turso 認証トークン |
| `CORS_ORIGINS` | Yes | `["https://shupass.jp"]` |
| `CLAUDE_MODEL` | No | Claude モデル名 |
| `CLAUDE_HAIKU_MODEL` | No | Claude Haiku モデル名 |
| `OPENAI_MODEL` | No | OpenAI モデル名 |
| `DEBUG` | No | `false` |
| `FASTAPI_DEBUG` | No | `false` |
| `REDIS_URL` | No | Redis キャッシュURL |
| `ES_REWRITE_COUNT` | No | リライト案の出力数 (デフォルト: 1) |
