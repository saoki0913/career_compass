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
| バックエンド | Render | `career-compass-backend.onrender.com` |
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

## Step 2: Stripe 本番設定

Stripe は Vercel (フロントエンド) 側のみで使用します。バックエンド (Render) には Stripe 関連の設定は不要です。

### 2-1. Stripe アカウントの本番利用申請

https://dashboard.stripe.com/account/onboarding にアクセスし、以下の情報を入力します。

#### ビジネス情報

| 項目 | 入力内容 |
|---|---|
| 事業形態 | 個人事業主 or 法人（該当するものを選択） |
| 業種 | 「ソフトウェア」 |
| 事業のウェブサイト | `https://shupass.jp` |
| 商品の説明 | 「就活支援 AI サービス。ES 添削・企業情報検索・スケジュール管理を提供」 |

#### 申請者（個人）の本人確認

| 項目 | 入力内容 |
|---|---|
| 氏名（漢字） | 登記名 or 本名 |
| 氏名（ローマ字） | パスポート表記に準拠 |
| 生年月日 | — |
| 自宅住所 | — |
| 電話番号 | — |
| 本人確認書類 | 運転免許証 / マイナンバーカード / パスポートのいずれか（写真アップロード） |

> **注意**: 法人の場合は登記簿謄本（履歴事項全部証明書）の提出が必要になる場合があります。

#### 明細書表記（Statement Descriptor）

顧客のクレジットカード明細に表示される名称です。

| 項目 | 設定値 | 備考 |
|---|---|---|
| 明細書表記（漢字） | `ウカルン` | カード明細に表示 |
| 明細書表記（ローマ字） | `SHUPASS` | 5〜22文字、英数字のみ |
| 短縮表記 | `SHUPASS` | 一部カード会社で使用 |
| サポート用メールアドレス | `support@shupass.jp` | 請求に関する問い合わせ先 |
| サポート用電話番号 | — | 任意 |
| サポート用 URL | `https://shupass.jp` | — |

#### 銀行口座（売上の入金先）

| 項目 | 入力内容 |
|---|---|
| 銀行名 | — |
| 支店名 | — |
| 口座種別 | 普通 or 当座 |
| 口座番号 | — |
| 口座名義 | 本人名義であること |

> 入金サイクル: Stripe Japan のデフォルトは**週次**（毎週金曜日に前週分を入金）。
> Dashboard → Settings → Payouts で変更可能。

#### セキュリティ設定

| 項目 | 推奨設定 |
|---|---|
| 2段階認証 | **必ず有効化**（SMS or 認証アプリ） |
| パスワード | Stripe 専用の強力なパスワード |

### 2-2. 本番 API キーの取得

申請が承認されたら（通常 1〜3 営業日）:

1. Stripe Dashboard → **開発者** → **API キー**
2. **テストモード** トグルを **OFF** にして本番モードに切り替え
3. 以下のキーを控える:

| キー | 形式 | 用途 |
|---|---|---|
| 公開可能キー | `pk_live_...` | フロントエンド（ブラウザ）から Stripe.js に渡す |
| シークレットキー | `sk_live_...` | サーバーサイドから Stripe API を呼ぶ |

> **重要**: シークレットキーは一度しか表示されません。安全に保管してください。
> テスト中は `pk_test_` / `sk_test_` を使い、本番申請完了後に `pk_live_` / `sk_live_` に切り替えます。

### 2-3. 本番用の商品・価格を作成

Stripe Dashboard → **商品カタログ** → **商品を追加**

> **重要**: テストモードで作成した商品は本番モードには引き継がれません。本番モードで新規に作成する必要があります。

#### Standard プラン

| 設定 | 値 |
|---|---|
| 商品名 | `Standard プラン` |
| 説明 | `月300クレジット・企業30社・ES添削10回/月` |
| 価格 | ¥980 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、価格の詳細画面で **Price ID** (`price_...`) を控える → `STRIPE_PRICE_STANDARD_MONTHLY`

#### Pro プラン

| 設定 | 値 |
|---|---|
| 商品名 | `Pro プラン` |
| 説明 | `月800クレジット・企業無制限・ES添削無制限` |
| 価格 | ¥2,980 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、Price ID を控える → `STRIPE_PRICE_PRO_MONTHLY`

### 2-4. Webhook エンドポイントの設定

Stripe Dashboard → **開発者** → **Webhook** → **エンドポイントを追加**

| 設定 | 値 |
|---|---|
| Endpoint URL | `https://shupass.jp/api/webhooks/stripe` |
| バージョン | 最新の API バージョン |

**受信するイベント** (5 つ選択):

| イベント | トリガー | アプリ内の処理 |
|---|---|---|
| `checkout.session.completed` | ユーザーが決済完了 | サブスクリプション作成・プラン更新・クレジット付与 |
| `customer.subscription.updated` | プラン変更・更新 | プラン変更・クレジット再計算 |
| `customer.subscription.deleted` | サブスクリプション解約 | Free プランにダウングレード |
| `invoice.payment_succeeded` | 支払い成功（月次更新含む） | ステータスを active に復帰 |
| `invoice.payment_failed` | 支払い失敗 | ステータスを past_due に変更 |

作成後、**Signing Secret** (`whsec_...`) を控える → `STRIPE_WEBHOOK_SECRET`

### 2-5. カスタマーポータルの設定

Stripe Dashboard → **設定** → **Billing** → **カスタマーポータル**

以下を有効化:

| 機能 | 有効/無効 |
|---|---|
| 支払い方法の更新 | 有効 |
| サブスクリプションのキャンセル | 有効 |
| 請求履歴の表示 | 有効 |
| インボイスのダウンロード | 有効 |

**ビジネス情報**:

| 項目 | 値 |
|---|---|
| ビジネス名 | `ウカルン` |
| プライバシーポリシー URL | `https://shupass.jp/privacy` |
| 利用規約 URL | `https://shupass.jp/terms` |

### 2-6. Webhook のテスト

本番キーを設定する前に、テストモードで動作確認:

```bash
# Stripe CLI をインストール
brew install stripe/stripe-cli/stripe

# ログイン
stripe login

# ローカルに Webhook を転送
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# 別ターミナルでテストイベント送信
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe trigger invoice.payment_succeeded
```

各イベントでアプリ内の処理が正常に動作することを確認:
- [ ] `checkout.session.completed` → サブスクリプション作成・プラン更新
- [ ] `customer.subscription.updated` → プラン変更反映
- [ ] `customer.subscription.deleted` → Free プランにダウングレード
- [ ] `invoice.payment_failed` → ステータスが `past_due` に変更
- [ ] `invoice.payment_succeeded` → ステータスが `active` に復帰

### 2-7. テストカードでの決済テスト

テストモードで以下のカード番号を使用:

| カード番号 | 結果 |
|---|---|
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0002` | カード拒否 |
| `4000 0000 0000 3220` | 3D セキュア認証必須 |

- 有効期限: 未来の任意の日付（例: 12/34）
- CVC: 任意の 3 桁（例: 123）

---

## Step 3: Render にバックエンドをデプロイ

### 3-1. Render で Web Service 作成

1. https://render.com にログイン
2. **New** → **Web Service** を選択
3. GitHub リポジトリ `saoki0913/career_compass` を連携

| 設定項目 | 値 |
|---|---|
| Name | `career-compass-backend` |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | **Docker** |
| Instance Type | **Standard** ($25/月, 2GB RAM) 推奨 |

> **メモリ要件**: Cross-encoder モデル (`japanese-reranker-small-v2`, ~70M params) + ChromaDB + FastAPI で約 800MB〜1.2GB 使用。Starter (512MB) では不足する可能性が高いため Standard (2GB) を推奨。

### 3-2. 永続ディスクを設定

ChromaDB と BM25 インデックスはファイルに保存されるため、永続ディスクが必要です。

Render Dashboard → 対象 Web Service → **Disks**

| 設定 | 値 |
|---|---|
| Name | `career-compass-data` |
| Mount Path | `/app/data` |
| Size | 1 GB |

> `backend/Dockerfile` の `WORKDIR` が `/app` なので、マウントパスは `/app/data` になります。

### 3-3. 環境変数を設定

Render Dashboard → 対象 Web Service → **Environment**

```bash
# === AI API キー（必須） ===
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# === CORS（必須） ===
CORS_ORIGINS=["https://shupass.jp"]

# === フロントエンド URL（必須） ===
NEXT_PUBLIC_APP_URL=https://shupass.jp

# === LLM モデル設定（任意） ===
CLAUDE_MODEL=claude-sonnet-4-5-20250929
CLAUDE_HAIKU_MODEL=claude-haiku-4-5-20251001
OPENAI_MODEL=gpt-4.1-mini

# === ES 添削設定（任意） ===
ES_REWRITE_COUNT=1

# === デバッグ無効化（任意） ===
DEBUG=false
FASTAPI_DEBUG=false
COMPANY_SEARCH_DEBUG=false
WEB_SEARCH_DEBUG=false

# === キャッシュ（任意） ===
# REDIS_URL=redis://...
```

> **注意**: `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` は**不要**です。データベースアクセスはフロントエンド (Next.js + Drizzle ORM) が担当し、バックエンド (FastAPI) は DB に直接アクセスしません。

### 3-4. Health Check 設定

Render Dashboard → 対象 Web Service → **Settings** → **Health Check**

| 設定 | 値 |
|---|---|
| Path | `/` |
| Expected Code | `200` |

### 3-5. デプロイ確認

デプロイ完了後、以下にアクセスして応答を確認:

```
https://career-compass-backend.onrender.com/
# => {"message": "Career Compass API", "version": "0.1.0"}
```

---

## Step 4: Vercel にフロントエンドをデプロイ

### 4-1. Vercel にプロジェクトをインポート

1. https://vercel.com/new にアクセス
2. **Import Git Repository** → `saoki0913/career_compass` を選択

| 設定項目 | 値 |
|---|---|
| Framework Preset | **Next.js** (自動検出) |
| Root Directory | `.` (ルート) |
| Build Command | `npm run build` |
| Node.js Version | **20.x** |

### 4-2. ブランチ設定

Vercel Dashboard → Settings → **Git**

| 設定 | 値 |
|---|---|
| Production Branch | `main` |
| Preview Branches | `develop` (自動プレビュー) |

### 4-3. 環境変数を設定

Vercel Dashboard → Settings → **Environment Variables**

```bash
# === アプリケーション（必須） ===
NEXT_PUBLIC_APP_URL=https://shupass.jp

# === データベース（必須） ===
TURSO_DATABASE_URL=libsql://career-compass-production-xxx.turso.io
TURSO_AUTH_TOKEN=eyJ...

# === 認証 - Better Auth（必須） ===
BETTER_AUTH_SECRET=<openssl rand -base64 32 で生成>
BETTER_AUTH_URL=https://shupass.jp

# === 認証 - Google OAuth（必須） ===
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# === セキュリティ（必須） ===
ENCRYPTION_KEY=<openssl rand -hex 32 で生成（64桁hex）>

# === Stripe 決済（必須） ===
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...

# === FastAPI バックエンド URL（必須） ===
FASTAPI_URL=https://career-compass-backend.onrender.com

# === Vercel Cron 認証（必須） ===
CRON_SECRET=<openssl rand -hex 32 で生成>
```

> **注意**: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` / `OPENAI_MODEL` は Vercel には**不要**です。AI API はすべてバックエンド (Render) 経由で呼び出されます。

### 4-4. カスタムドメイン

**Step 0 で設定済み。** Vercel Dashboard → Settings → **Domains** で `shupass.jp` が **Valid Configuration** であることを再確認。

---

## Step 5: 外部サービスの本番設定

### 5-1. Google OAuth リダイレクトURI

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

### 5-2. Render の CORS 更新

Render 側の `CORS_ORIGINS` にカスタムドメインを設定:

```
CORS_ORIGINS=["https://shupass.jp"]
```

> Vercel のデフォルトドメインも許可する場合:
> ```
> CORS_ORIGINS=["https://shupass.jp","https://career-compass-xxx.vercel.app"]
> ```

---

## Step 6: develop → main マージ & デプロイ

### 6-1. main ブランチにマージ

```bash
# Makefile コマンドで実行（安全ガード付き）
make deploy
```

または手動で:

```bash
git checkout main
git merge develop
git push origin main
```

> `git push` により Vercel と Render の両方で自動デプロイが開始されます。

### 6-2. デプロイ状況の確認

- **Vercel**: https://vercel.com/dashboard → Deployments タブ
- **Render**: https://dashboard.render.com → Events タブ

---

## Step 7: デプロイ後の動作確認

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
- [ ] **Stripe カスタマーポータル**: 設定画面 →「プラン管理」→ Stripe ポータルが開く

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

Cross-encoder モデル (`hotchpotch/japanese-reranker-small-v2`, ~70M params) のロードに約 400MB のメモリが必要です。

| Render プラン | RAM | 推奨度 |
|---|---|---|
| Free | 512MB | 不可（メモリ不足） |
| Starter | 512MB | 不可（ぎりぎりで不安定） |
| Standard | 2GB | 推奨 |

### ChromaDB / BM25 データ

開発環境の `backend/data/` は Git に含まれていません。本番では空の状態からスタートし、企業情報を取得するたびにデータが蓄積されます。

### Vercel Cron

`vercel.json` に設定済みの日次通知 cron:
- スケジュール: `0 0 * * *` (UTC 0:00 = JST 9:00)
- Vercel **Pro プラン以上** で利用可能（Hobby では Cron は利用不可）
- `CRON_SECRET` 環境変数で認証（未設定だと不正実行のリスク）

### Stripe テストモード → 本番モード

本番申請が完了するまではテストモードの API キー (`sk_test_`, `pk_test_`) を使用します。
本番申請完了後、本番キー (`sk_live_`, `pk_live_`) に切り替えてください。

> **注意**: テストモードの商品・価格は本番モードに引き継がれません。Step 2-3 で本番用の商品を新規作成してください。

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
| `STRIPE_SECRET_KEY` | Yes | Stripe シークレットキー (`sk_live_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe 公開キー (`pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Webhook シークレット (`whsec_...`) |
| `STRIPE_PRICE_STANDARD_MONTHLY` | Yes | Standard 月額 Price ID (`price_...`) |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes | Pro 月額 Price ID (`price_...`) |
| `FASTAPI_URL` | Yes | `https://career-compass-backend.onrender.com` |
| `CRON_SECRET` | Yes | Cron 認証トークン (hex 32) |

### Render (バックエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API キー (`sk-...`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー (`sk-ant-...`) |
| `CORS_ORIGINS` | Yes | `["https://shupass.jp"]` |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://shupass.jp` (フロントエンドURL参照用) |
| `CLAUDE_MODEL` | No | Claude モデル名 |
| `CLAUDE_HAIKU_MODEL` | No | Claude Haiku モデル名 |
| `OPENAI_MODEL` | No | OpenAI モデル名 |
| `ES_REWRITE_COUNT` | No | リライト案の出力数 (デフォルト: 1) |
| `DEBUG` | No | `false` |
| `FASTAPI_DEBUG` | No | `false` |
| `COMPANY_SEARCH_DEBUG` | No | `false` |
| `WEB_SEARCH_DEBUG` | No | `false` |
| `REDIS_URL` | No | Redis キャッシュURL |
