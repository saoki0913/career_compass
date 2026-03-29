# システムアーキテクチャ

就活Pass（シューパス）のシステム全体構成を説明します。

---

## 1. システム概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                           クライアント                               │
│                    (ブラウザ / モバイルブラウザ)                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Next.js フロントエンド                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Pages     │  │ Components  │  │    Hooks    │                 │
│  │  (App Router)│  │  (React)    │  │  (SWR等)    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────┐               │
│  │              Next.js API Routes                  │               │
│  │     認証 / クレジット管理 / DB操作 / 中継        │               │
│  └─────────────────────────────────────────────────┘               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
┌───────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Supabase (PostgreSQL) │ │  Python FastAPI │ │ External APIs   │
│     データベース       │ │  AI バックエンド │ │                 │
│                   │ │                 │ │ - Stripe        │
│ - ユーザー        │ │ - ES添削        │ │ - Google OAuth  │
│ - 企業情報        │ │ - ガクチカ深掘り │ │ - Google Calendar│
│ - ES文書          │ │ - 企業情報取得  │ │ - OpenAI API    │
│ - 締切/タスク     │ │ - RAG検索       │ │ - Anthropic API │
└───────────────────┘ └────────┬────────┘ └─────────────────┘
                               │
                               │
                    ┌──────────┘
                    ▼
          ┌─────────────────┐
          │    ChromaDB     │
          │  ベクトルDB     │
          │  (RAG用)        │
          └─────────────────┘
```

---

## 2. レイヤー構成

### フロントエンド層

| コンポーネント | 役割 |
|--------------|------|
| Pages (App Router) | ルーティング、ページレンダリング |
| Components | UI部品（shadcn/ui ベース） |
| Hooks | データフェッチ、状態管理 |
| API Routes | サーバーサイドロジック（認証、DB操作） |

### 主要導線の描画方針

- `dashboard`、`tasks`、`notifications`、`search`、`companies`、`es`、`companies/[id]`、`es/[id]` は server-first を基本とする。
- ドキュメント**一覧**（`/es`、企業詳細の ES 一覧、`GET /api/documents` のリスト）は `getDocumentsPageData` の `includeContent: false` で DB の `content` を読まず、RSC/JSON を軽くする。本文は `GET /api/documents/[id]` と `getDocumentDetailPageData` で取得する。`getDocumentDetailPageData` は同一リクエスト内で React `cache` を使い、`generateMetadata` と page の二重クエリを避ける。
- 認証済み `dashboard` はデータ取得部分を `Suspense` で囲み、`DashboardSkeleton` を先に表示する。`getViewerPlan` は React `cache` で `getCompaniesPageData` 内の同関数呼び出しと共有し、プロフィール plan の二重 DB を避ける。
- `notifications` は page で 50 件を server preload し、`DashboardHeader` には 5 件に絞った通知プレビューを渡して、ページ本体とヘッダーの重複 fetch を避ける。
- `profile` は page 側で `profile` / `companies` / `documents` を先読みし、`DashboardHeader` へ通知・クレジットの初期データを渡せるようにして初回表示の waterfall を減らす。
- ES 編集（`es/[id]`）では `ReviewPanel` / `VersionHistory` / `MobileReviewPanel` を `next/dynamic`（`ssr: false`）で遅延読み込みし、初回バンドルを抑える。
- App Router の page は `headers()` + `getHeadersIdentity()` で viewer を解決し、shared loader (`src/lib/server/app-loaders.ts`) から初回表示に必要な最小データを直接取得する。
- product page は薄い server wrapper と `*PageClient` の分離を基本形にする。`tasks`、`notifications`、`search` は page で preload し、client 側は操作と optimistic update に寄せる。
- client component は操作・入力・モーダル・ストリーミング担当の island に限定し、初回表示のためだけの mount fetch は増やさない。
- ログイン後プロダクト領域 `src/app/(product)/` の `layout` は **`children` のみ**（共通ラッパーは置かない）。`DashboardHeader` は **各ページ／`loading.tsx` が個別に描画**する。通知 `useNotifications` とクレジット `useCredits` は **SWR** で `/api/notifications` / `/api/credits` を共有キャッシュし、同一キーならインスタンスが増えてもリクエストをデデュープする。クライアント fetch は same-origin cookie 送信を前提にし、guest 識別は browser header ではなく `guest_device_token` cookie で扱う。
- guest は JavaScript から参照できない HttpOnly cookie を使う。proxy が cookie から内部 `x-device-token` を再構成し、既存の route handler / loader に渡す。
- Next から FastAPI への呼び出しは `src/lib/fastapi/client.ts` に集約し、`INTERNAL_API_JWT_SECRET` を使う短寿命 service JWT を付与する。
- read 系 API route は `getRequestIdentity()` + `createServerTimingRecorder()` を使い、`Server-Timing` で `identity` / `db` / `serialize` を観測できる形に揃える。

### バックエンド層

| コンポーネント | 役割 |
|--------------|------|
| Next.js API | 認証、クレジット管理、DB操作、FastAPI中継 |
| FastAPI | AI処理（ES添削、ガクチカ、企業情報） |
| ChromaDB | ベクトル検索（RAG） |

### データ層

| コンポーネント | 役割 |
|--------------|------|
| Supabase (PostgreSQL) | メインデータベース |
| ChromaDB | 企業情報のベクトルデータ |

---

## 3. ディレクトリ構造

```
career_compass/
├── src/                                 # Next.js アプリ本体
│   ├── app/                             # App Router
│   │   ├── (marketing)/                 # 公開導線
│   │   │   ├── pricing/                 # 料金
│   │   │   ├── templates/               # テンプレ集
│   │   │   ├── tools/                   # 無料ツール
│   │   │   ├── legal/, privacy/, terms/ # 法務ページ
│   │   │   └── SEO 向け LP 群           # entry-sheet-ai など
│   │   ├── (auth)/                      # login, onboarding
│   │   ├── (product)/                   # プロダクト導線
│   │   │   ├── dashboard/
│   │   │   ├── companies/[id]/motivation/
│   │   │   ├── es/[id]/
│   │   │   ├── gakuchika/[id]/
│   │   │   ├── calendar/, tasks/, notifications/
│   │   │   └── settings/, profile/, search/
│   │   ├── api/                         # Next API Routes
│   │   │   ├── _shared/                 # request identity など共通処理
│   │   │   ├── auth/, companies/, documents/
│   │   │   ├── motivation/, gakuchika/, calendar/
│   │   │   ├── tasks/, notifications/, deadlines/
│   │   │   ├── stripe/, checkout/, webhooks/, cron/
│   │   │   └── search/, guest/, settings/, pins/
│   │   ├── checklists/                  # 補助 UI
│   │   ├── __debug/, debug-loading-gallery/
│   │   ├── __loading-preview/, loading-preview/
│   │   └── layout.tsx, loading.tsx, sitemap.ts など
│   ├── components/                      # UI コンポーネント
│   │   ├── ui/                          # shadcn/ui ベース
│   │   ├── es/, companies/, gakuchika/  # 主要機能 UI
│   │   ├── dashboard/, landing/, search/
│   │   ├── tasks/, notifications/       # server wrapper 配下の client UI
│   │   ├── skeletons/, shared/, chat/
│   │   └── auth/, calendar/, tools/, seo/ など
│   ├── hooks/                           # client hook
│   ├── lib/                             # サーバー/共通ロジック
│   │   ├── auth/, db/, server/, security/
│   │   ├── company-info/, es-review/, gakuchika/
│   │   ├── calendar/, credits/, stripe/
│   │   ├── task-loaders.ts, search-loader.ts, notification-loaders.ts
│   │   └── ai/, analytics/, marketing/, seo/
│   └── proxy.ts                         # Auth / CSRF / CSP / guest header 再構成
├── backend/                             # FastAPI と検索基盤
│   ├── app/
│   │   ├── main.py, config.py, limiter.py
│   │   ├── security/                    # internal service auth
│   │   ├── routers/                     # company_info, es_review など
│   │   ├── utils/                       # LLM, RAG,検索, fetch, telemetry
│   │   ├── prompts/                     # ES / 志望動機 / ガクチカ
│   │   └── testing/                     # live gate など検証補助
│   ├── data/                            # chroma/, bm25/ 永続化
│   ├── evals/                           # RAG / ES review 評価
│   ├── scripts/                         # company_info 補助 scripts
│   └── tests/                           # pytest
├── drizzle_pg/                          # 現行 Drizzle migration
├── supabase/                            # SQL migration と local state
├── scripts/                             # release / bootstrap / dev 補助
├── e2e/                                 # Playwright E2E
├── tests/                               # 補助テスト・AI eval
├── docs/                                # ドキュメント
├── public/                              # 画像・marketing アセット
└── tools/                               # CLI 安全運用ツール
```

### 構造を見るときの前提

- `src/app` は route group 前提で分かれており、URL 上は `(marketing)` / `(product)` / `(auth)` を含みません。
- 正しい実装の責務分担は `src/app/api` と `backend/app` の両方を見る必要があります。Next 側が認証・永続化・中継、FastAPI 側が AI / RAG / 取得処理を担います。
- `drizzle_pg/` が現行 migration で、`supabase/migrations/` は provider 側の SQL 運用です。
- `.next/`、`node_modules/`、`.venv/`、cache 系はローカル生成物なので、この構造図では追いません。

### 肥大ポイント

- `src/app/api` は 109 files あり、認証・課金・AI 中継・cron が一箇所に集まっています。
- `src/components/es` は 18 files、`src/components/companies` は 10 files あり、主要 UI の複雑さが高いです。
- 単一ファイルでは `backend/app/routers/company_info.py` が 5424 行、`backend/app/routers/es_review.py` が 4802 行、`backend/app/utils/llm.py` が 3392 行で、FastAPI 側に大きな集中があります。
- フロント側では `src/components/companies/CorporateInfoSection.tsx` が 3271 行、`src/components/es/ReviewPanel.tsx` が 1502 行、`src/hooks/useESReview.ts` が 980 行、`src/lib/server/app-loaders.ts` が 928 行で、画面・hook・loader の責務分離が次の整理候補です。

---

## 4. データフロー

### ES添削フロー

```
1. ユーザーがESを編集・保存
   └─> Next.js API (/api/documents/[id])
       └─> Supabase (PostgreSQL) に保存

2. ユーザーが「AI添削」をリクエスト
   └─> Next.js API (/api/documents/[id]/review/stream)
       ├─> 認証・クレジット確認
       ├─> 企業情報をDBから取得（テンプレ添削時）
       └─> FastAPI (/api/es/review/stream) に中継
           ├─> 入力防御と sanitize
           ├─> RAGコンテキスト取得（ChromaDB + BM25）
           ├─> company evidence cards / reference quality profile / selected user facts を構築
           ├─> rewrite-only 生成（strict → focused retry 1 → focused retry 2 → length-fix → degraded / 422）
           ├─> 決定論的検証（文字数・文体・参考ES類似、短字数では final soft 可）
           └─> SSEで `rewrite → sources → complete` を返却

3. 結果を受け取り
   └─> Next.js API
       ├─> 成功時のみクレジット消費
       ├─> AIスレッドに履歴保存
       └─> フロントエンドにストリーミング返却
```

### 企業情報取得フロー

```
1. ユーザーが企業情報取得をリクエスト
   └─> Next.js API (/api/companies/[id]/fetch-info)
       └─> FastAPI (/company-info/fetch-schedule)
           ├─> DuckDuckGo検索で採用ページ候補取得
           ├─> Webページをスクレイピング
           ├─> LLM（GPT-5-mini）で構造化抽出
           └─> 結果を返却

2. 構造化データ保存
   └─> Next.js API
       ├─> 締切を `deadlines` に保存
       ├─> 応募方法 / 提出物 / 選考フローを返却
       └─> 企業RAGは更新しない
```

---

## 5. 認証フロー

```
1. ユーザーがログインページにアクセス
   └─> Google OAuth 認証
       └─> Better Auth がセッション管理
           └─> DBに accounts, sessions レコード作成

2. ゲストユーザー
   └─> HttpOnly cookie (`guest_device_token`) で識別
       └─> proxy が内部 `x-device-token` へ写像
           └─> guest_users テーブルで管理
               └─> 機能制限あり（無料回数制限）
```

---

## 6. 主要コンポーネントの役割

### Next.js API Routes

| エンドポイント | 役割 |
|--------------|------|
| `/api/auth/*` | Better Auth認証 |
| `/api/companies/*` | 企業CRUD、情報取得 |
| `/api/documents/*` | ES文書CRUD、添削 |
| `/api/gakuchika/*` | ガクチカCRUD、深掘り |
| `/api/deadlines/*` | 締切管理 |
| `/api/tasks/*` | タスク管理 |
| `/api/credits/*` | クレジット確認・消費 |
| `/api/notifications/*` | 通知管理 |
| `/api/stripe/*` | 決済Webhook |

### FastAPI ルーター

| エンドポイント | 役割 |
|--------------|------|
| `/api/es/review/stream` | ES添削SSE（rewrite → sources → complete） |
| `/api/gakuchika/*` | ガクチカ深掘り質問生成 |
| `/api/motivation/*` | 志望動機の質問生成・評価・下書き |
| `/company-info/*` | 企業情報スクレイピング・RAG構築 |
| `/health` | ヘルスチェック |

---

## 7. 環境別構成

| 環境 | フロントエンド | バックエンド | データベース |
|-----|--------------|-------------|-------------|
| 開発 | `npm run dev` | `uvicorn` | Supabase (dev) |
| 本番 | Vercel | Railway | Supabase (prod) |

---

## 関連ドキュメント

- [TECH_STACK.md](./TECH_STACK.md) - 使用技術一覧
- [DATABASE.md](./DATABASE.md) - データベース設計
- [DEVELOPMENT_AND_ENV.md](../setup/DEVELOPMENT_AND_ENV.md) — 開発ガイドと環境変数
