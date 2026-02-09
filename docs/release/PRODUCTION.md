# 本番リリース手順書（Vercel + Railway + Supabase）

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
│   Vercel     │────▶│  Railway     │────▶│ Supabase │
│  (Next.js)   │     │  (FastAPI)   │     │(Postgres)│
│  shupass.jp  │     │  Port 8000   │     │          │
└──────┬───────┘     └──────┬───────┘     └──────────┘
       │                    │
       │                    ├── ChromaDB (Railway Volume)
       │                    └── BM25 Index (Railway Volume)
       │
       ├── Stripe (決済)
       ├── Google OAuth (認証)
       └── OpenAI / Anthropic (AI)
```

| コンポーネント | デプロイ先 | ドメイン / パス |
|---|---|---|
| フロントエンド | Vercel | `shupass.jp` / `/` (ルート) |
| バックエンド | Railway | `career-compass-backend.up.railway.app` |
| データベース | Supabase (PostgreSQL) | — |
| ベクトルDB / BM25 | Railway Volume | `/app/data` |

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

## Step 1: Supabase (PostgreSQL) 本番データベースの作成

### 1-0. Supabase プロジェクト作成

1. https://supabase.com/dashboard にログイン（GitHub 連携でサインアップ可能）
2. 左上の **「New Project」** ボタンをクリック
3. Organization を選択（初回は自動作成される）
4. 以下を入力:

| 項目 | 値 | 備考 |
|---|---|---|
| Project name | `career-compass` | 任意の識別名 |
| Database Password | 安全なパスワード | **必ず控えること**（接続文字列で使用） |
| Region | **Northeast Asia (Tokyo)** | なければ **Southeast Asia (Singapore)** |
| Pricing Plan | Free で開始可能 | 後から Pro にアップグレード可 |

5. **「Create new project」** ボタンをクリック
6. プロジェクト作成に 1〜2 分かかる → Dashboard に遷移するまで待つ

### 1-1. 接続文字列の取得

1. Supabase Dashboard 上部の **「Connect」** ボタンをクリック
2. Connection String セクションが表示される
3. 以下の 2 つの接続文字列をコピー:

#### DATABASE_URL（Transaction Pooler / Port 6543）

Vercel 等の serverless 環境向け。接続プーリングにより多数の短命接続を効率的に処理。

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

- 「Connect」ダイアログで **Transaction Pooler** タブを選択してコピー
- `[PASSWORD]` 部分をプロジェクト作成時のパスワードに置換

#### DIRECT_URL（Direct Connection / Port 5432）

マイグレーション実行用（Drizzle Kit が使用）。

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

- 「Connect」ダイアログで **Session Pooler** または **Direct Connection** タブを選択してコピー
- `[PASSWORD]` 部分をプロジェクト作成時のパスワードに置換

> **Tip**: Transaction Pooler は Prepared Statements をサポートしません。Drizzle ORM のランタイム接続には Transaction Pooler（6543）、マイグレーション実行には Direct Connection または Session Pooler（5432）を使い分けてください。

### 1-2. .env.local に接続文字列を設定

ローカルでマイグレーションを実行するため、`.env.local` に接続文字列を設定:

```bash
# .env.local に追記
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

### 1-3. 依存関係インストール & スキーマを本番 DB に適用

```bash
# 1) 依存関係インストール
npm install

# 2) マイグレーション生成（既に drizzle_pg/ にある場合はスキップ可）
npm run db:generate

# 3) マイグレーション適用
npm run db:migrate
```

> `npm run db:migrate` は `.env.local` の `DIRECT_URL` を使用してマイグレーションを実行します（`drizzle.config.ts` で `DIRECT_URL` 優先に設定済み）。

### 1-4. DB 状態の確認

1. Supabase Dashboard 左サイドバー → **「Table Editor」** をクリック
2. 全テーブル（`user`, `session`, `account`, `company`, `es` 等）が作成されていることを確認

Drizzle Studio で確認する場合:

```bash
npm run db:studio
```

---

## Step 2: Stripe 本番設定

Stripe は Vercel (フロントエンド) 側のみで使用します。バックエンド (Railway) には Stripe 関連の設定は不要です。

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
| ビジネス名 | `就活Pass` |
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

## Step 3: Railway にバックエンドをデプロイ

### 3-0. Railway アカウント作成 & CLI インストール

#### アカウント作成

1. https://railway.com/ にアクセス
2. **Start a New Project** → **GitHub で登録**（推奨）
3. GitHub アカウントと連携を許可

> GitHub 連携すると、リポジトリからの自動デプロイが可能になります。

#### CLI インストール（任意）

```bash
# グローバルインストール（任意のディレクトリで実行可能）
npm install -g @railway/cli

# ログイン（ブラウザが開きます）
railway login

# 確認
railway whoami
```

> CLI はデプロイやログ確認に便利ですが、Dashboard のみでも運用できます。

### 3-1. プロジェクト & サービス作成

#### Dashboard から作成（推奨）

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

#### サービスの Source 設定

1. Project Canvas 上でサービスのカードをクリック
2. 右パネルが開く → **「Settings」** タブをクリック
3. **Source** セクションを見つける

| 設定項目 | 値 | 説明 |
|---|---|---|
| Repository | `saoki0913/career_compass` | GitHub リポジトリ（自動設定済み） |
| Branch | `main` | 本番デプロイ対象ブランチ |
| Root Directory | `/backend` | **重要**: 入力欄に `/backend` と入力 |

> **Root Directory**: プロジェクトのルートに Next.js と FastAPI が共存しているため、`/backend` を指定して FastAPI のみをビルド対象にします。

#### Build 設定

1. 同じ **「Settings」** タブ内の **Build** セクションを見つける

| 設定項目 | 値 | 説明 |
|---|---|---|
| Builder | **Dockerfile** | `backend/railway.toml` で自動検出 |
| Dockerfile Path | `Dockerfile` | Root Directory (`/backend`) からの相対パス |
| Watch Paths | `/backend/**` | バックエンドの変更のみでデプロイトリガー |

> Watch Paths を設定すると、フロントエンドだけの変更時にバックエンドが無駄に再デプロイされるのを防げます。

> **メモリ要件**: Cross-encoder モデル (`japanese-reranker-small-v2`, ~70M params) + ChromaDB + FastAPI で約 800MB〜1.2GB 使用。Railway はデフォルトで 8GB RAM まで利用可能（従量課金）。

### 3-2. Networking 設定（公開ドメイン）

デフォルトではサービスは外部からアクセスできません。公開ドメインを生成する必要があります。

1. サービスの **「Settings」** タブ → **「Networking」** セクションを見つける

#### Public Networking

1. **Public Networking** セクション内の **「Generate Domain」** ボタンをクリック
2. 自動生成されるドメイン（例: `career-compass-backend-production.up.railway.app`）を確認
3. このドメインをコピー → Vercel の `FASTAPI_URL` に設定する（Step 4-4 参照）
4. SSL 証明書は自動で発行・更新される（設定不要）

> カスタムドメインを使う場合は **Custom Domain** から設定可能（DNS の CNAME レコード設定が必要）。

#### Private Networking

同じ Railway プロジェクト内のサービス間通信に使用。今回は Vercel（外部）からのアクセスなので **Public Networking のみ必要**。

### 3-3. Volume を設定（永続ストレージ）

ChromaDB と BM25 インデックスはファイルに保存されるため、永続 Volume が必要です。
Volume がないとデプロイごとにデータが消失します。

#### Volume の作成方法（2 通り）

**方法 1: Project Canvas で右クリック**
1. Project Canvas の空白部分を **右クリック**
2. コンテキストメニューから **Volume** の作成オプションを選択

**方法 2: Command Palette**
1. `⌘K`（Mac）/ `Ctrl+K`（Windows）で Command Palette を開く
2. 「volume」と入力して Volume 作成を選択

#### Volume の設定

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

### 3-4. 環境変数を設定

1. Project Canvas 上でサービスのカードをクリック
2. 右パネルの **「Variables」** タブをクリック

#### 変数の追加方法（3 通り）

**方法 1: 個別追加**
- **「New Variable」** ボタンをクリック → キーと値を入力

**方法 2: RAW Editor で一括ペースト（推奨）**
- **「RAW Editor」** ボタンをクリック（Variables タブ内右上付近）
- `.env` 形式（`KEY=VALUE`、1 行 1 変数）でまとめてペースト → **「Update Variables」** で保存

**方法 3: 自動サジェスト**
- Railway が GitHub リポジトリ内の `.env` / `.env.example` ファイルを検出した場合、サジェストが表示される → ワンクリックでインポート可能

#### 必須変数

```bash
# AI API キー
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# CORS（Vercel フロントエンドのドメインを許可）
CORS_ORIGINS=["https://shupass.jp"]

# フロントエンド URL
NEXT_PUBLIC_APP_URL=https://shupass.jp

# ポート（Dockerfile の EXPOSE と一致させる）
PORT=8000
```

#### 任意変数（推奨）

```bash
# LLM モデル設定
CLAUDE_MODEL=claude-sonnet-4-5-20250929
CLAUDE_HAIKU_MODEL=claude-haiku-4-5-20251001
OPENAI_MODEL=gpt-5-mini

# ES 添削設定
ES_REWRITE_COUNT=1

# デバッグ無効化（本番）
DEBUG=false
FASTAPI_DEBUG=false
COMPANY_SEARCH_DEBUG=false
WEB_SEARCH_DEBUG=false
```

#### 設定不要な変数

| 変数 | 理由 |
|---|---|
| `DATABASE_URL` | DB アクセスはフロントエンド (Drizzle ORM) が担当 |
| `DIRECT_URL` | 同上（マイグレーション用。バックエンドは不要） |
| `STRIPE_*` | 決済はフロントエンド (Vercel) 側のみ |
| `BETTER_AUTH_*` | 認証はフロントエンド側のみ |

> **Tip**: Railway の Variables 画面では **Shared Variables**（プロジェクト全体で共有）と **Service Variables**（サービス固有）を分けて管理できます。API キーは Service Variables に設定してください。

### 3-5. Deploy 設定

サービスの **「Settings」** タブ → **Deploy** セクション

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Healthcheck Path | `/health` | `railway.toml` で設定済み |
| Healthcheck Timeout | `10` (秒) | `railway.toml` で設定済み |
| Restart Policy | `On Failure` | クラッシュ時のみ再起動 |
| Max Retries | `3` | 3回失敗で停止 |
| Railway Config File | `railway.toml` | Root Directory からの相対パス |

> `backend/railway.toml` にこれらの設定が含まれているため、Dashboard での手動設定は不要です。変更したい場合は `railway.toml` を編集するか、Dashboard から上書きできます。

### 3-6. リソース制限（任意）

サービスの **「Settings」** タブ → **Resource Limits** セクション

デフォルトでは制限なし（8 vCPU / 8GB RAM まで利用可能）。コスト管理のため上限を設定することを推奨。

| リソース | 推奨上限 | 説明 |
|---|---|---|
| vCPU | `2` | 通常利用なら十分 |
| Memory | `2 GB` | Cross-encoder + ChromaDB で ~1.2GB |

> 月額コストの上限は Railway Dashboard → **Settings** → **Usage** → **Spending Limit** で設定できます。

### 3-7. デプロイ実行 & 確認

#### 自動デプロイ

GitHub 連携済みの場合、`main` ブランチへの push で自動デプロイが開始されます。

Project Canvas 上でサービスをクリック → 右パネルの **「Deployments」** タブでデプロイ状況を確認。

#### CLI でデプロイ（手動）

```bash
cd backend
railway up
```

#### デプロイログの確認

サービスの **「Deployments」** タブ → 対象デプロイをクリック → **Build Logs** / **Deploy Logs**

または CLI:
```bash
railway logs
```

#### ヘルスチェック

デプロイ完了後、公開ドメインにアクセス:

```bash
curl https://career-compass-backend-production.up.railway.app/
# => {"message": "Career Compass API", "version": "0.1.0"}

curl https://career-compass-backend-production.up.railway.app/health
# => {"status": "healthy"}
```

> デプロイ直後は Cross-encoder モデルのダウンロード（初回のみ、~200MB）に数分かかる場合があります。ヘルスチェックが通るまで待ってください。

### 3-8. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| ビルド失敗 | Root Directory 未設定 | Settings → Source → Root Directory を `/backend` に |
| 起動後すぐクラッシュ | メモリ不足 | Resource Limits で Memory を 2GB 以上に |
| ヘルスチェック失敗 | ポート不一致 | `PORT=8000` が Variables に設定されているか確認 |
| Volume データ消失 | Volume 未マウント | Settings → Volumes で `/app/data` にマウントされているか確認 |
| CORS エラー | `CORS_ORIGINS` 未設定 | Variables に `CORS_ORIGINS=["https://shupass.jp"]` を追加 |
| 外部からアクセス不可 | Public Domain 未生成 | Settings → Networking → Generate Domain |

---

## Step 4: Vercel にフロントエンドをデプロイ

### 4-1. Vercel にプロジェクトをインポート

1. https://vercel.com/new にアクセス（ログイン済みであること）
2. **「Import Git Repository」** セクションに GitHub リポジトリ一覧が表示される
3. `career_compass` を検索 → **「Import」** ボタンをクリック
4. **Configure Project** 画面が表示される:

| 設定項目 | 値 | 説明 |
|---|---|---|
| Framework Preset | **Next.js** (自動検出) | Vercel がフレームワークを自動判別 |
| Root Directory | `.` (ルート) | バックエンドは Railway のため変更不要 |
| Build Command | `npm run build` | デフォルトのまま |
| Node.js Version | **20.x** | LTS 版 |

5. **Environment Variables** セクション（Configure Project 画面下部）で環境変数を事前設定可能:
   - Variable Name / Value を入力 → **「Add」** ボタンで追加
   - ここで全変数を設定してからデプロイすると初回ビルドから成功する
6. **「Deploy」** ボタンをクリック

> 環境変数を後から設定する場合、初回ビルドは失敗する可能性があります。4-4 で設定後に再デプロイしてください。

### 4-2. General 設定

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「General」**

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Project Name | `career-compass` | ダッシュボードでの識別名、デフォルトドメインの一部 |
| Framework Preset | Next.js | 自動検出済み |
| Root Directory | `.` | リポジトリルート |
| Node.js Version | `20.x` | LTS 版を推奨 |
| Build Command | `npm run build` | デフォルトのまま |
| Output Directory | — | Next.js は自動検出（`.next`） |
| Install Command | `npm install` | デフォルトのまま |

### 4-3. Git 設定

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Git」**

| 設定項目 | 値 | 説明 |
|---|---|---|
| Connected Git Repository | `saoki0913/career_compass` | GitHub 連携済み |
| Production Branch | `main` | 本番デプロイ対象ブランチ |
| Ignored Build Step | — | 未設定（全 push でビルド） |
| Auto-cancel Deployments | `On`（推奨） | 同ブランチへの連続 push で前のビルドをキャンセル |

> `develop` ブランチへの push は自動的にプレビューデプロイが作成されます。

### 4-4. 環境変数を設定

1. Vercel Dashboard → 対象プロジェクトをクリック
2. 上部の **「Settings」** タブをクリック
3. 左サイドメニューから **「Environment Variables」** をクリック

#### 変数の追加手順

1. **Key** 欄に変数名を入力（例: `DATABASE_URL`）
2. **Value** 欄に値を入力
3. **Environment** チェックボックスで適用先を選択:

| Environment | 適用タイミング | 用途 |
|---|---|---|
| **Production** | `main` ブランチのデプロイ | 本番 API キー・本番 URL |
| **Preview** | `develop` 等のプレビューデプロイ | テスト用 API キー・テスト URL |
| **Development** | `vercel dev` ローカル実行時 | ローカル開発用 |

4. シークレットキー（`STRIPE_SECRET_KEY` 等）は **「Sensitive」** トグルを ON にする
   - ON にすると保存後に値を再表示できなくなる（セキュリティ強化）
5. **「Save」** ボタンをクリック

> **重要**: 環境変数の変更は **次回デプロイから** 反映されます。既存のデプロイには影響しません。変数設定後に再デプロイが必要な場合は、Deployments タブから最新デプロイの **「...」** → **「Redeploy」** をクリック。

shupass-backend-production.up.railway.app


#### 必須変数

```bash
# === アプリケーション ===
NEXT_PUBLIC_APP_URL=https://shupass.jp

# === データベース ===
DATABASE_URL=postgresql://...   # 推奨: Pooler (Transaction mode / 6543)
DIRECT_URL=postgresql://...     # 推奨: Direct connection (5432)

# === 認証 - Better Auth ===
BETTER_AUTH_SECRET=<openssl rand -base64 32 で生成>
BETTER_AUTH_URL=https://shupass.jp

# === 認証 - Google OAuth ===
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# === セキュリティ ===
ENCRYPTION_KEY=<openssl rand -hex 32 で生成（64桁hex）>

# === Stripe 決済 ===
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...

# === FastAPI バックエンド URL ===
FASTAPI_URL=https://career-compass-backend.up.railway.app

# === Vercel Cron 認証 ===
CRON_SECRET=<openssl rand -hex 32 で生成>
```

#### 任意変数（推奨）

```bash
# === レート制限 (Upstash Redis) ===
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

#### 設定不要な変数

| 変数 | 理由 |
|---|---|
| `OPENAI_API_KEY` | AI API はバックエンド (Railway) 経由 |
| `ANTHROPIC_API_KEY` | 同上 |
| `CLAUDE_MODEL` / `OPENAI_MODEL` | バックエンド側で設定 |
| `CORS_ORIGINS` | バックエンド側の設定 |

### 4-5. Domains 設定

1. Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Domains」**
2. ドメイン入力欄に `shupass.jp` と入力 → **「Add」** ボタンをクリック
3. DNS 設定の指示が表示される（Step 0 で設定済み）

**Step 0 で設定済み。** 以下が Valid Configuration であることを確認:

| ドメイン | 状態 | 説明 |
|---|---|---|
| `shupass.jp` | Valid Configuration | A レコード → `76.76.21.21` |
| `www.shupass.jp` | Redirects to shupass.jp | CNAME → `cname.vercel-dns.com` |

| 設定項目 | 値 | 説明 |
|---|---|---|
| SSL Certificate | 自動発行 (Let's Encrypt) | DNS 設定後に自動 |
| Git Branch | `main` (Production) | ドメインに紐づくブランチ |

> デフォルトドメイン (`career-compass-xxx.vercel.app`) はプレビュー環境として残しておくと便利。

### 4-6. Functions 設定

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Functions」**

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Default Function Region | `hnd1` (Tokyo, Japan) | ユーザーに最も近いリージョン |
| Max Duration | `60s` (Pro) / `10s` (Hobby) | Serverless Function のタイムアウト |

> **重要**: ES 添削や企業情報取得は FastAPI (Railway) に中継します。Railway からの応答を待つ時間も含まれるため、Pro プラン（60s）を推奨。Hobby プラン（10s）では長時間処理がタイムアウトする可能性があります。

### 4-7. Cron Jobs 設定

`vercel.json` で定義済み（Dashboard での追加設定は不要）:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-notifications",
      "schedule": "0 0 * * *"
    }
  ]
}
```

| 設定項目 | 値 | 説明 |
|---|---|---|
| スケジュール | `0 0 * * *` | UTC 0:00 = **JST 9:00** に実行 |
| エンドポイント | `/api/cron/daily-notifications` | 日次の締切通知チェック |
| 認証 | `CRON_SECRET` 環境変数 | Bearer トークンで不正実行を防止 |
| プラン要件 | **Pro 以上** | Hobby プランでは Cron 利用不可 |

> Vercel Dashboard → 対象プロジェクト → **Cron Jobs** タブで実行履歴を確認可能。

### 4-8. Security Headers

`next.config.ts` で設定済み（Vercel Dashboard での追加設定は不要）:

| ヘッダー | 値 | 目的 |
|---|---|---|
| `X-Frame-Options` | `DENY` | クリックジャッキング防止 |
| `X-Content-Type-Options` | `nosniff` | MIME タイプスニッフィング防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラー情報の制限 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ブラウザ機能の制限 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HTTPS 強制 |
| `Content-Security-Policy` | 詳細は `next.config.ts` 参照 | XSS 防止（Stripe・Google 許可済み） |

### 4-9. デプロイ実行 & 確認

#### 自動デプロイ

GitHub 連携済みの場合、`main` ブランチへの push で自動デプロイが開始されます。

#### デプロイ状況の確認

1. Vercel Dashboard → 対象プロジェクト → 上部の **「Deployments」** タブをクリック
2. 各デプロイのステータスを確認:
   - **Building**: ビルド中（デプロイをクリック → Build Logs で進捗確認）
   - **Ready**: デプロイ完了
   - **Error**: ビルド失敗（デプロイをクリック → Build Logs でエラー確認）
3. デプロイの **「...」**（三点メニュー）→ **「Redeploy」** で再デプロイ可能

> プレビューデプロイ: `develop` ブランチへの push で自動作成。一意の URL（`career-compass-xxx-yyy.vercel.app`）が発行されます。

---

## Step 5: 外部サービスの本番設定

### 5-1. Google Cloud Console プロジェクト設定

Google Cloud Console (https://console.cloud.google.com/)

#### プロジェクト作成

1. 上部メニューの **プロジェクト選択** → **新しいプロジェクト**
2. プロジェクト名: `career-compass`（任意）
3. 作成後、プロジェクトを選択

#### API の有効化

**API とサービス** → **ライブラリ** → 以下の API を検索して **有効にする**:

| API | 用途 | 必須 |
|---|---|---|
| **Google People API** | ユーザープロフィール取得（OAuth ログイン） | Yes |
| **Google Calendar API** | カレンダー同期（将来機能） | No |

> Google+ API は非推奨。**People API** を使用してください。

### 5-2. Google OAuth 同意画面の設定

Google Cloud Console → **API とサービス** → **OAuth 同意画面**

#### 基本情報

| 設定項目 | 値 | 説明 |
|---|---|---|
| User Type | **外部** | Google Workspace 外のユーザーも対象 |
| アプリ名 | `ウカルン` | ログイン時の同意画面に表示 |
| ユーザー サポートメール | `support@shupass.jp` | ユーザーからの問い合わせ先 |
| アプリのロゴ | ロゴ画像をアップロード | 同意画面に表示（120x120px 推奨） |

#### アプリのドメイン

| 設定項目 | 値 |
|---|---|
| アプリのホームページ | `https://shupass.jp` |
| アプリのプライバシー ポリシー リンク | `https://shupass.jp/privacy` |
| アプリの利用規約リンク | `https://shupass.jp/terms` |
| 承認済みドメイン | `shupass.jp` |

#### デベロッパーの連絡先情報

| 設定項目 | 値 |
|---|---|
| メールアドレス | 開発者のメールアドレス（Google からの連絡用） |

#### スコープ

**スコープを追加または削除** → 以下を選択:

| スコープ | 説明 | 種別 |
|---|---|---|
| `.../auth/userinfo.email` | メールアドレス | 非機密 |
| `.../auth/userinfo.profile` | 名前、プロフィール画像 | 非機密 |
| `openid` | OpenID Connect 認証 | 非機密 |

> 全て「非機密」スコープのため、Google の審査は不要です。

#### 公開ステータス

| ステータス | 説明 |
|---|---|
| **テスト** | テストユーザーのみログイン可能（最大 100 名） |
| **本番** | 全 Google ユーザーがログイン可能 |

> **重要**: 本番リリース前に **アプリを公開** をクリックしてステータスを「本番」に変更してください。テストのままだと登録したテストユーザー以外はログインできません。

### 5-3. Google OAuth 認証情報の作成

Google Cloud Console → **API とサービス** → **認証情報** → **認証情報を作成** → **OAuth クライアント ID**

| 設定項目 | 値 | 説明 |
|---|---|---|
| アプリケーションの種類 | **ウェブ アプリケーション** | — |
| 名前 | `ウカルン 本番` | 識別用（任意） |

#### 承認済みの JavaScript 生成元

```
https://shupass.jp
```

#### 承認済みのリダイレクト URI

```
https://shupass.jp/api/auth/callback/google
```

> プレビュー環境も使う場合は以下も追加:
> ```
> https://career-compass-xxx.vercel.app
> https://career-compass-xxx.vercel.app/api/auth/callback/google
> ```

#### 作成後に控えるキー

| キー | 環境変数名 | 設定先 |
|---|---|---|
| クライアント ID | `GOOGLE_CLIENT_ID` | Vercel |
| クライアント シークレット | `GOOGLE_CLIENT_SECRET` | Vercel |

> **注意**: クライアント シークレットは作成後に一度だけ表示されます。安全に保管してください。

### 5-4. Railway の CORS 更新

Railway 側の `CORS_ORIGINS` にカスタムドメインを設定:

Railway Dashboard → 対象 Service → **Variables**

```
CORS_ORIGINS=["https://shupass.jp"]
```

> Vercel のデフォルトドメインも許可する場合:
> ```
> CORS_ORIGINS=["https://shupass.jp","https://career-compass-xxx.vercel.app"]
> ```

### 5-5. Upstash Redis 設定（レート制限用）

Vercel のサーバーレス環境ではインメモリのレート制限が使えないため、Upstash Redis を使用します。
未設定の場合はインメモリフォールバックで動作しますが、分散環境では正確なレート制限になりません。

#### アカウント作成 & データベース作成

1. https://console.upstash.com/ にアクセス（GitHub 連携でサインアップ可能）
2. **Create Database** をクリック

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Name | `career-compass-ratelimit` | 識別名（任意） |
| Type | **Regional** | 単一リージョン（グローバル不要） |
| Region | `ap-northeast-1` (Tokyo) | レイテンシ最小化 |
| TLS | Enabled | デフォルトのまま |
| Eviction | **Enabled** | メモリ上限時に古いキーを自動削除 |

#### REST API 認証情報の取得

データベース作成後、**REST API** セクションに表示される:

| キー | 環境変数名 | 設定先 |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_URL` | Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` | Vercel |

#### 料金

| プラン | 制限 | 備考 |
|---|---|---|
| **Free** | 10,000 コマンド/日, 256MB | 就活アプリの規模では十分 |
| **Pay As You Go** | $0.2/100K コマンド | 超過時の自動課金 |

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

> `git push` により Vercel と Railway の両方で自動デプロイが開始されます。

### 6-2. デプロイ状況の確認

- **Vercel**: https://vercel.com/dashboard → Deployments タブ
- **Railway**: https://railway.app/dashboard → 対象 Service → Deployments タブ

---

## Step 7: デプロイ後の動作確認

### 必須チェックリスト

- [ ] **バックエンド Health Check**: `https://career-compass-backend.up.railway.app/` で JSON 応答を確認
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
- [ ] Railway の Volume 使用量確認

---

## 注意事項

### Railway の料金体系

Railway は従量課金制です。月 $5 の無料クレジットが付与されます。

| リソース | 単価 | 備考 |
|---|---|---|
| CPU | $0.000463/分/vCPU | 使用した分だけ |
| メモリ | $0.000231/分/GB | デフォルト上限 8GB |
| Volume | $0.25/GB/月 | 永続ディスク |
| ネットワーク（送信） | $0.10/GB | 受信は無料 |

> 低トラフィック（就活生向けアプリ）の場合、月 $5-15 程度の見込み。

### メモリ要件

Cross-encoder モデル (`hotchpotch/japanese-reranker-small-v2`, ~70M params) のロードに約 400MB のメモリが必要です。
Railway はデフォルトで 8GB まで利用可能なため、メモリ不足の心配はありません。

### ChromaDB / BM25 データ

開発環境の `backend/data/` は Git に含まれていません。本番では空の状態からスタートし、企業情報を取得するたびにデータが蓄積されます。Railway Volume にデータが永続化されます。

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
| `DATABASE_URL` | Yes | Supabase Postgres 接続URL（推奨: Pooler/6543） |
| `DIRECT_URL` | No | Supabase Postgres 直通URL（5432, マイグレーション推奨） |
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
| `FASTAPI_URL` | Yes | `https://career-compass-backend.up.railway.app` |
| `CRON_SECRET` | Yes | Cron 認証トークン (hex 32) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL (`https://xxx.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST トークン |

### Railway (バックエンド)

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
