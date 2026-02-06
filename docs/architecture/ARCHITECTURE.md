# システムアーキテクチャ

Career Compass（ウカルン）のシステム全体構成を説明します。

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
│   Turso (libSQL)  │ │  Python FastAPI │ │ External APIs   │
│   データベース     │ │  AI バックエンド │ │                 │
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

### バックエンド層

| コンポーネント | 役割 |
|--------------|------|
| Next.js API | 認証、クレジット管理、DB操作、FastAPI中継 |
| FastAPI | AI処理（ES添削、ガクチカ、企業情報） |
| ChromaDB | ベクトル検索（RAG） |

### データ層

| コンポーネント | 役割 |
|--------------|------|
| Turso (libSQL) | メインデータベース |
| ChromaDB | 企業情報のベクトルデータ |

---

## 3. ディレクトリ構造

```
career_compass/
├── src/                          # フロントエンド (Next.js)
│   ├── app/                      # App Router ページ
│   │   ├── (auth)/               # 認証関連ページ
│   │   ├── api/                  # API Routes
│   │   ├── dashboard/            # ダッシュボード
│   │   ├── companies/            # 企業管理
│   │   ├── es/                   # ES管理
│   │   ├── gakuchika/            # ガクチカ
│   │   ├── calendar/             # カレンダー
│   │   ├── tasks/                # タスク管理
│   │   ├── templates/            # テンプレート
│   │   ├── notifications/        # 通知
│   │   └── settings/             # 設定
│   ├── components/               # Reactコンポーネント
│   │   ├── ui/                   # shadcn/ui 基本コンポーネント
│   │   ├── dashboard/            # ダッシュボード用
│   │   ├── companies/            # 企業管理用
│   │   ├── es/                   # ES編集用
│   │   └── ...
│   ├── hooks/                    # カスタムフック
│   ├── lib/                      # ユーティリティ
│   │   ├── auth/                 # 認証関連
│   │   ├── db/                   # DB接続、スキーマ
│   │   ├── credits/              # クレジット計算
│   │   └── stripe/               # Stripe連携
│   └── proxy.ts                 # 認証プロキシ (Next.js 16)
│
├── backend/                      # バックエンド (Python FastAPI)
│   ├── app/
│   │   ├── main.py               # FastAPI エントリーポイント
│   │   ├── config.py             # 設定
│   │   ├── routers/              # APIルーター
│   │   │   ├── es_review.py      # ES添削
│   │   │   ├── gakuchika.py      # ガクチカ深掘り
│   │   │   ├── company_info.py   # 企業情報取得
│   │   │   └── health.py         # ヘルスチェック
│   │   ├── utils/                # ユーティリティ
│   │   │   ├── llm.py            # LLM呼び出し
│   │   │   ├── embeddings.py     # 埋め込み生成
│   │   │   ├── vector_store.py   # ChromaDB操作
│   │   │   ├── hybrid_search.py  # ハイブリッド検索
│   │   │   ├── bm25_store.py     # BM25インデックス
│   │   │   └── text_chunker.py   # テキスト分割
│   │   └── prompts/              # プロンプトテンプレート
│   └── data/                     # ランタイムデータ
│       ├── chroma/               # ChromaDB永続化
│       └── bm25/                 # BM25インデックス
│
├── drizzle/                      # DBマイグレーション
│   ├── 0000_*.sql                # 初期スキーマ
│   ├── 0001_*.sql                # マイグレーション
│   └── meta/                     # メタデータ
│
├── docs/                         # ドキュメント
├── e2e/                          # E2Eテスト (Playwright)
└── public/                       # 静的ファイル
```

---

## 4. データフロー

### ES添削フロー

```
1. ユーザーがESを編集・保存
   └─> Next.js API (/api/documents/[id])
       └─> Turso DB に保存

2. ユーザーが「AI添削」をリクエスト
   └─> Next.js API (/api/documents/[id]/review)
       ├─> 認証・クレジット確認
       ├─> 企業情報をDBから取得（テンプレ添削時）
       └─> FastAPI (/api/es/review) に中継
           ├─> RAGコンテキスト取得（ChromaDB + BM25）
           ├─> LLM呼び出し（Claude Sonnet）
           └─> 結果をJSON形式で返却

3. 結果を受け取り
   └─> Next.js API
       ├─> 成功時のみクレジット消費
       ├─> AIスレッドに履歴保存
       └─> フロントエンドに返却
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

2. RAGビルド
   └─> FastAPI (/company-info/rag/build)
       ├─> テキストをチャンク分割
       ├─> 埋め込みベクトル生成
       ├─> ChromaDBに保存
       └─> BM25インデックス構築
```

---

## 5. 認証フロー

```
1. ユーザーがログインページにアクセス
   └─> Google OAuth 認証
       └─> Better Auth がセッション管理
           └─> DBに accounts, sessions レコード作成

2. ゲストユーザー
   └─> デバイストークンで識別
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
| `/api/es/review` | ES添削（LLM使用） |
| `/api/gakuchika/*` | ガクチカ深掘り質問生成 |
| `/company-info/*` | 企業情報スクレイピング・RAG構築 |
| `/health` | ヘルスチェック |

---

## 7. 環境別構成

| 環境 | フロントエンド | バックエンド | データベース |
|-----|--------------|-------------|-------------|
| 開発 | `npm run dev` | `uvicorn` | Turso (dev) |
| 本番 | Vercel | Railway/Render | Turso (prod) |

---

## 関連ドキュメント

- [TECH_STACK.md](./TECH_STACK.md) - 使用技術一覧
- [DATABASE.md](./DATABASE.md) - データベース設計
- [ENV_SETUP.md](../setup/ENV_SETUP.md) - 環境変数設定
- [DEVELOPMENT.md](../setup/DEVELOPMENT.md) - 開発ガイド
