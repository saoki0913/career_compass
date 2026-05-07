# 開発ガイドと環境変数

**最終更新**: 2026-03-21

**この文書の目的**: ローカル開発の始め方、よく使うコマンド、環境変数・外部サービス（Supabase / OAuth / Stripe 等）の設定をまとめます。

**誰が読むか**: 開発者。

**移行メモ**: 旧 `DEVELOPMENT.md` と `ENV_SETUP.md` を統合しました。

---

## 開発を始める／再開する

```
/dev-continue
```

**これだけでOK！** このコマンドが自動で:
1. プロジェクトの現在状態を確認
2. 進行中のタスクがあれば再開
3. なければ次に取り組むべき機能を提案
4. 必要なコンテキストをロード

---

## Quick Start

### 1. 環境セットアップ

環境変数の詳細はこのファイル後半の「環境変数・外部サービス（詳細）」を参照してください。

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env.local
# .env.local を編集して必要な値を設定

# データベースセットアップ（→ [DB_SUPABASE.md](./DB_SUPABASE.md)）
npm run db:push

# 開発サーバー起動
npm run dev
```

### 2. バックエンド (FastAPI) セットアップ

```bash
cd backend

# 仮想環境作成
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係インストール
pip install -r requirements.txt

# 開発サーバー起動
uvicorn app.main:app --reload --port 8000
```

---

## Claude Code カスタムコマンド

このプロジェクトでは開発効率化のためのカスタムコマンド（Skills）を用意しています。

### 最重要コマンド
```
/dev-continue             # 開発を開始/再開（自動判定）
/dev-continue {feature}   # 特定機能の開発を再開
```

### 仕様確認
```
/ukarun:spec {section}    # SPEC.mdの特定セクションを表示
/ukarun:spec list         # 全セクション一覧
/ukarun:spec search {kw}  # キーワード検索
```

### 開発状況確認
```
/ukarun:status            # 全体の開発状況
/ukarun:status {feature}  # 特定機能の詳細
```

### 機能実装
```
/ukarun:impl {feature}    # 機能実装を開始
```

### クイックコマンド
```
/ukarun:dev               # npm run dev
/ukarun:build             # npm run build
/ukarun:test:e2e          # npm run test:e2e
/ukarun:db:push           # npm run db:push
/ukarun:db:studio         # npm run db:studio
```

---

## Kiro Spec-Driven Development

新機能の実装は Kiro ワークフローに従います。

### Phase 1: Specification

```bash
# 1. 仕様初期化
/kiro:spec-init "企業登録機能の実装"

# 2. 要件定義
/kiro:spec-requirements companies

# 3. 設計
/kiro:spec-design companies

# 4. タスク分解
/kiro:spec-tasks companies
```

### Phase 2: Implementation

```bash
# 実装開始
/kiro:spec-impl companies

# 進捗確認
/kiro:spec-status companies
```

### Phase 3: Validation

```bash
# 実装検証
/kiro:validate-impl companies
```

---

## 機能一覧と依存関係

```
auth (認証)
  └── plans (プラン)
        └── credits (クレジット)

onboarding (オンボーディング)
  └── dashboard (ダッシュボード)
        ├── notifications (通知)
        └── tasks (タスク)

companies (企業登録)
  └── company-info (企業情報取得)
        └── applications (応募枠)
              └── deadlines (締切)
                    └── calendar (カレンダー)

es-editor (ESエディタ)
  └── ai-review (AI添削)
        └── templates (テンプレ)

gakuchika (ガクチカ)
```

### 推奨実装順序

1. **auth** - Better Auth 設定（完了）
2. **plans** - プラン管理
3. **credits** - クレジットシステム
4. **onboarding** - オンボーディング
5. **companies** - 企業登録
6. **dashboard** - ダッシュボード
7. **notifications** - 通知
8. **company-info** - 企業情報取得
9. **applications** - 応募枠
10. **deadlines** - 締切承認
11. **tasks** - タスク管理
12. **es-editor** - ESエディタ
13. **ai-review** - AI添削
14. **gakuchika** - ガクチカ深掘り
15. **calendar** - カレンダー連携
16. **templates** - テンプレ共有

---

## コーディング規約

### TypeScript/React

```typescript
// コンポーネント: Named export + 関数コンポーネント
export function CompanyCard({ company }: Props) {
  return <div>...</div>;
}

// 型定義: PascalCase
type CompanyData = {
  id: string;
  name: string;
};

// Server Action
'use server';
export async function createCompany(data: FormData) {
  // ...
}
```

### データベース（Drizzle + PostgreSQL）

```typescript
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// テーブル名は DB 上 snake_case（Drizzle の pgTable 第1引数）
export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at"),
});
```

### API レスポンス

```typescript
// 成功
{ data: {...}, meta?: {...} }

// エラー
{ error: 'ERROR_CODE', message: '...' }

// ページネーション
{ data: [...], pagination: { total, page, perPage, hasMore } }
```

---

## テスト

### E2E テスト実行

```bash
npm run test:e2e          # ヘッドレス実行
npm run test:e2e:major    # 主要機能の横断テスト
npm run test:e2e:major:guest
npm run test:e2e:major:user
npm run test:e2e:major:live
npm run test:e2e:auth
npm run test:e2e:regression
npm run test:ui           # UI付きで実行
npm run test:headed       # ブラウザ表示
npm run ui:preflight -- /pricing --surface=marketing
npm run ui:preflight -- /companies --surface=product --auth=guest
npm run lint:ui:guardrails
npm run test:ui:review -- /pricing
npm run test:ui:review -- /companies --auth=guest

# 特定テスト
npx playwright test companies
```

### UI 変更後の標準確認

- UI 実装前は `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]` を実行する。
- preflight の Markdown を会話、PR 本文、作業ログのいずれかに残してから UI 実装を始める。
- UI 変更前後で `npm run lint:ui:guardrails` を実行する。
- UI 変更後は `npm run test:ui:review -- <route>` を実行し、対象ページを Playwright で確認する。
- PR では `.github/PULL_REQUEST_TEMPLATE.md` の `UI Review Routes` を埋め、shared UI 変更時の確認 route を明示する。
- public ページはその route を直接指定し、product UI は最も近い route を指定する。
- guest 導線は `--auth=guest` を使う。
- 詳細は `docs/testing/UI_PLAYWRIGHT_VERIFICATION.md` を参照する。

### 主要機能の横断確認

- `npm run test:e2e:major` は stable major で、AI live 呼び出しを含まない主要導線を確認する。
- `npm run test:e2e:major:guest` は guest の stable major を横断確認する。
- `npm run test:e2e:major:user` は Google auth state があるときに logged-in 導線を確認する。
- GitHub Actions の `Main Release Gate` は Google auth state を使わず、staging の non-production test auth route と `CI_E2E_AUTH_SECRET` で authenticated major を実行する。
- staging の test auth route は `CI_E2E_AUTH_SECRET` が設定されている間は有効で、明示的に止めたいときだけ `CI_E2E_AUTH_ENABLED=0` を使う。
- `npm run test:e2e:major:live` は FastAPI を自動起動し、`motivation` / `gakuchika` / `ES review` の AI live 導線を確認する。
- `npm run test:e2e:auth` は guest の session persistence と guest/user access boundary を確認する。
- `npm run test:e2e:regression` は feature-specific regression を確認する。

### ローカル 6機能 AI Live

- localhost 向け一括実行は `make ai-live-local` を使う。
- 既定 suite は `extended`。短く回したいときだけ `make ai-live-local SUITE=smoke` を使う。
- 対象は `ES添削` `企業RAG取り込み` `選考スケジュール取得` `ガクチカ作成` `志望動機作成` `面接対策` の 6機能で、`企業情報検索` は含めない。
- wrapper は `npm run dev` と `bash tools/start-fastapi-playwright.sh` を起動し、既定の `http://localhost:3000` と `http://localhost:8000/health` を待ってから実行する。`3000` が埋まっている場合は `next dev` が選んだ localhost port に追従する。
- `CI_E2E_AUTH_SECRET` が未設定なら wrapper が一時 secret を生成して local test auth route を有効化する。
- `DATABASE_URL` が `localhost` / `127.0.0.1` 向けで DB 未起動なら、wrapper は `make db-up` を 1 回だけ試みる。
- stateful な `es-review` `gakuchika` `motivation` `interview` の直前には `scripts/ci/reset-ai-live-state.mjs` を実行し、ローカル DB 上の CI E2E test user state を毎回 reset する。
- 出力先既定は `backend/tests/output/local_ai_live/<suite>_<timestamp>/`。
- 集約出力は `ai-live-summary.md` `ai-live-summary.json` `ai-live-issue-body.md`、feature 別 bundle は `live_*.json` `live_*.md`。

実行前に最低限そろえるもの:

- env: `BETTER_AUTH_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DATABASE_URL`
- service: local DB, Next.js dev server が起動できる Node/npm, FastAPI が起動できる Python 環境

よくある失敗:

- `BETTER_AUTH_SECRET` 未設定で `POST /api/internal/test-auth/login` が無効化される
- ローカル DB 未起動で auth preflight / state reset が失敗する
- FastAPI 起動失敗で `http://localhost:8000/health` が ready にならない
- LLM key 不足で live report が skip または fail になる

### テストファイル構造

```
e2e/
├── fixtures/
│   └── auth.ts           # 認証フィクスチャ
├── pages/
│   └── DashboardPage.ts  # Page Object
├── companies/
│   └── registration.spec.ts
└── credits/
    └── consumption.spec.ts
```

---

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `DATABASE_URL` | Supabase Postgres 接続URL（推奨: Pooler/6543） | ✅ |
| `DIRECT_URL` | Supabase Postgres 直通URL（5432, マイグレーション推奨） | 🔶 |
| `BETTER_AUTH_SECRET` | 認証シークレット | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth ID | ✅ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret | ✅ |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook シークレット | ✅ |

---

## トラブルシューティング

### よくある問題

**Q: データベース接続エラー**
```bash
# 接続確認（psql が入っている場合）
psql \"$DIRECT_URL\"
```

**Q: Stripe Webhookが受信できない**
```bash
# Stripe CLIでローカル転送
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Q: 型エラーが出る**
```bash
# 型生成
npm run db:generate

# TypeScript再起動
# VSCode: Cmd+Shift+P > TypeScript: Restart TS Server
```

---

## 参考リンク

- [SPEC.md](../SPEC.md) — 機能仕様書
- [DB_SUPABASE.md](./DB_SUPABASE.md) — Supabase / DB 運用（ローカル・本番・マイグレーション）
- [MCP_SETUP.md](./MCP_SETUP.md) — MCP サーバー設定
- [環境変数クイックリファレンス](../release/ENV_REFERENCE.md) — 本番向け一覧
- [Next.js Docs](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Better Auth Docs](https://www.better-auth.com/)
- [Stripe Docs](https://stripe.com/docs)


---

# 環境変数・外部サービス（詳細）


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

**法令・問い合わせ表示（本番）**: 特商法ページ等に出す連絡先・販売 URL は `LEGAL_*` 環境変数で上書きすることを推奨します（`LEGAL_SALES_URL` 省略時は `https://www.shupass.jp`）。一覧は [`.env.example`](../../.env.example) と [`docs/ops/SECURITY.md`](../ops/SECURITY.md) を参照。

---

## 🗄️ データベース設定の詳細（Supabase）

Supabase のプロジェクト作成、`DATABASE_URL` / `DIRECT_URL` の設定、Drizzle でのテーブル作成手順は以下を参照:

- [DB_SUPABASE.md](./DB_SUPABASE.md)

---

## 🗄️ Supabase (PostgreSQL) - 必須

Supabase はマネージド PostgreSQL です。

### 1. プロジェクト作成

1. Supabase Dashboard で **New project** を作成
2. Region は可能なら **Tokyo**、なければ **Singapore** を選択
3. Database Password を安全に保管

### 2. 接続文字列の取得

Supabase Dashboard → **Settings** → **Database** → **Connection string**

推奨:
- `DATABASE_URL`: Pooler (Transaction mode / 6543)
- `DIRECT_URL`: Direct connection (5432)（マイグレーション用に推奨）

### 3. `.env.local` に設定

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres
DIRECT_URL=postgresql://postgres.<project-ref>:<password>@<direct-host>:5432/postgres
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
   - アプリ名: `就活Pass（開発）`
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
| Standard | ¥1,490 | 月次 |
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
MODEL_ES_REVIEW=claude-sonnet        # ES添削（例: gpt-5.4 / gemini-3.1-pro-preview / low-cost）
MODEL_GAKUCHIKA=gpt-mini             # ガクチカ深掘り（GPT-5.4 mini）
MODEL_MOTIVATION=gpt-mini            # 志望動機（GPT-5.4 mini）
MODEL_COMPANY_INFO=openai            # 企業情報抽出
MODEL_RAG_QUERY_EXPANSION=gpt-mini   # クエリ拡張（mini）
MODEL_RAG_HYDE=gpt-mini              # HyDE（mini）
MODEL_RAG_CLASSIFY=gpt-nano          # コンテンツ分類（RAG 補助 LLM で唯一 nano 既定）

# Optional commercial API providers
# GOOGLE_API_KEY=...
# GOOGLE_MODEL=gemini-3.1-pro-preview
MODEL_SELECTION_SCHEDULE=gpt-mini # 選考スケジュール（既定: GPT-5.4 mini）
```

### 選考スケジュール取得の LLM コストログ（開発者向け）

ユーザー UI や JSON には出さず、**FastAPI のログのみ**に集計を出す。

```env
# true のとき、fetch-schedule 1 リクエストあたりの LLM トークンを logger.info に出力
LLM_USAGE_COST_LOG=false

# 任意: GPT-5.4 mini 想定の概算 USD（1M トークンあたりの単価）。未設定なら est_usd はログに含めない。
# OPENAI_PRICE_GPT_5_4_MINI_INPUT_PER_MTOK_USD=
# OPENAI_PRICE_GPT_5_4_MINI_CACHED_INPUT_PER_MTOK_USD=
# OPENAI_PRICE_GPT_5_4_MINI_OUTPUT_PER_MTOK_USD=
# 任意: est_usd から概算円をログに出す（USD→JPY の単純換算、開発者用）
# LLM_COST_USD_TO_JPY_RATE=155
```

詳細は `docs/features/COMPANY_INFO_FETCH.md` の「開発者向け: LLM トークン・概算コストログ」を参照。

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
DATABASE_URL=postgresql://...
# DIRECT_URL=postgresql://...   # マイグレーション用（推奨）
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
# 接続確認（psql が入っている場合）
psql "$DIRECT_URL"
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
| `DATABASE_URL` | Supabase Postgres 接続URL（推奨: Pooler/6543） | ✅ | Supabase Dashboard |
| `DIRECT_URL` | Supabase Postgres 直通URL（5432, マイグレーション推奨） | 🔶 | Supabase Dashboard |
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
| `NEXT_PUBLIC_LOGO_DEV_TOKEN` | ダッシュボード企業アイコンの実ロゴ取得（Logo.dev publishable key） | 🔶 | Logo.dev Dashboard |
| `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` | ダッシュボード企業アイコンの実ロゴ fallback（Brandfetch Logo API client ID） | 🔶 | Brandfetch Developer Portal |

✅ = 必須、🔶 = 機能使用時に必要

---

## 次のステップ

環境設定が完了したら、Claude Code で以下を実行:

```
/dev-continue を実行して
```

これで開発を開始できます。
