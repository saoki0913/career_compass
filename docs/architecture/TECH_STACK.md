# 使用技術一覧

Career Compass（ウカルン）で使用している技術スタックの詳細です。

---

## 1. フロントエンド

### コアフレームワーク

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **Next.js** | 16.x | React フレームワーク（App Router） |
| **React** | 19.x | UI ライブラリ |
| **TypeScript** | 5.x | 型安全な JavaScript |

### スタイリング

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **Tailwind CSS** | 4.x | ユーティリティファースト CSS |
| **shadcn/ui** | - | Radix UI ベースのコンポーネント |
| **Radix UI** | - | アクセシブルなプリミティブ |
| **Lucide React** | 0.563.x | アイコンライブラリ |

### ユーティリティ

| 技術 | 用途 |
|-----|------|
| **clsx** | クラス名の条件付き結合 |
| **tailwind-merge** | Tailwind クラスのマージ |
| **class-variance-authority** | コンポーネントバリアント管理 |

---

## 2. バックエンド（Next.js API Routes）

### 認証

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **Better Auth** | 1.4.x | 認証フレームワーク |
| **Google OAuth** | - | ソーシャルログイン |

### データベース

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **Turso** | - | libSQL ベースの分散 DB |
| **Drizzle ORM** | 0.45.x | TypeScript ORM |
| **@libsql/client** | 0.17.x | Turso クライアント |

### 決済

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **Stripe** | 20.x | サブスクリプション決済 |
| **@stripe/stripe-js** | 8.x | フロントエンド SDK |

### ストレージ

| 技術 | 用途 |
|-----|------|
| **AWS SDK (S3)** | Cloudflare R2 互換 API |
| **Cloudflare R2** | オブジェクトストレージ |

---

## 3. バックエンド（Python FastAPI）

### コアフレームワーク

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **FastAPI** | 0.109.x | 高速 Web API フレームワーク |
| **Uvicorn** | 0.27.x | ASGI サーバー |
| **Pydantic** | 2.5.x | データバリデーション |

### AI / LLM

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **OpenAI** | 1.x | GPT-4o-mini, GPT-5 API |
| **Anthropic** | 0.40.x | Claude Sonnet API |

**モデル用途:**
- ES添削: Claude Sonnet
- 企業情報抽出: GPT-4o-mini
- ガクチカ深掘り: Claude Sonnet

### ベクトル検索 / RAG

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **ChromaDB** | 0.4.x | ベクトルデータベース |
| **sentence-transformers** | 2.2.x | ローカル埋め込みモデル |
| **OpenAI Embeddings** | - | text-embedding-3-small |

### 検索 / NLP

| 技術 | バージョン | 用途 |
|-----|----------|------|
| **rank_bm25** | 0.2.x | BM25 キーワード検索 |
| **fugashi** | 1.3.x | MeCab 形態素解析 |
| **unidic-lite** | 1.0.x | MeCab 辞書 |

### Webスクレイピング

| 技術 | 用途 |
|-----|------|
| **httpx** | 非同期 HTTP クライアント |
| **BeautifulSoup4** | HTML パース |
| **ddgs** | DuckDuckGo 検索 API |

---

## 4. ハイブリッド検索システム

RAG（Retrieval-Augmented Generation）のための検索システム。

```
┌─────────────────────────────────────────────┐
│              ハイブリッド検索                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐    ┌─────────────┐        │
│  │  Semantic   │    │   BM25      │        │
│  │  Search     │    │   Search    │        │
│  │  (ChromaDB) │    │  (rank_bm25)│        │
│  └──────┬──────┘    └──────┬──────┘        │
│         │                  │                │
│         └────────┬─────────┘                │
│                  ▼                          │
│         ┌───────────────┐                   │
│         │  RRF / Score  │                   │
│         │    Fusion     │                   │
│         └───────────────┘                   │
│                  │                          │
│                  ▼                          │
│         ┌───────────────┐                   │
│         │  LLM Rerank   │                   │
│         │  (Optional)   │                   │
│         └───────────────┘                   │
│                                             │
└─────────────────────────────────────────────┘
```

**特徴:**
- セマンティック検索（意味的類似度）
- BM25キーワード検索（日本語トークナイズ対応）
- Reciprocal Rank Fusion (RRF) でスコア統合
- クエリ拡張 / LLMリランク（オプション）

---

## 5. 開発ツール

### ビルド / リント

| ツール | 用途 |
|-------|------|
| **ESLint** | JavaScript/TypeScript リンター |
| **TypeScript** | 型チェック |
| **Drizzle Kit** | DBマイグレーション生成 |

### テスト

| ツール | バージョン | 用途 |
|-------|----------|------|
| **Playwright** | 1.58.x | E2E テスト |

### 環境管理

| ツール | 用途 |
|-------|------|
| **dotenv-cli** | 環境変数読み込み |
| **python-dotenv** | Python環境変数 |

---

## 6. インフラ / デプロイ

| サービス | 用途 |
|---------|------|
| **Vercel** | Next.js ホスティング |
| **Railway / Render** | FastAPI ホスティング |
| **Turso** | データベース |
| **Cloudflare R2** | ファイルストレージ |

---

## 7. 外部サービス連携

### 認証

| サービス | 用途 |
|---------|------|
| **Google OAuth** | ソーシャルログイン |
| **Google Calendar API** | カレンダー同期 |

### 決済

| サービス | 用途 |
|---------|------|
| **Stripe** | サブスクリプション管理 |

**プラン:**
- Standard: ¥980/月
- Pro: ¥2,980/月

### AI

| サービス | 用途 |
|---------|------|
| **OpenAI API** | GPT-4o-mini, Embeddings |
| **Anthropic API** | Claude Sonnet |

---

## 8. package.json 依存関係

### dependencies

```json
{
  "@aws-sdk/client-s3": "^3.975.0",
  "@aws-sdk/s3-request-presigner": "^3.975.0",
  "@libsql/client": "^0.17.0",
  "@radix-ui/react-label": "^2.1.8",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-slot": "^1.2.4",
  "@radix-ui/react-switch": "^1.2.6",
  "@stripe/stripe-js": "^8.6.4",
  "better-auth": "^1.4.17",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "drizzle-orm": "^0.45.1",
  "lucide-react": "^0.563.0",
  "next": "16.1.5",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "stripe": "^20.2.0",
  "tailwind-merge": "^3.4.0"
}
```

### devDependencies

```json
{
  "@playwright/test": "^1.58.0",
  "@tailwindcss/postcss": "^4",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "dotenv-cli": "^11.0.0",
  "drizzle-kit": "^0.31.8",
  "eslint": "^9",
  "eslint-config-next": "16.1.5",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

---

## 9. Python requirements.txt

```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
python-dotenv>=1.0.0
httpx>=0.26.0
python-multipart>=0.0.6
beautifulsoup4>=4.12.0
openai>=1.0.0
anthropic>=0.40.0
ddgs>=9.0.0
chromadb>=0.4.22
sentence-transformers>=2.2.2
rank_bm25>=0.2.2
fugashi>=1.3.0
unidic-lite>=1.0.8
```

---

## 関連ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) - システムアーキテクチャ
- [DATABASE.md](./DATABASE.md) - データベース設計
- [ENV_SETUP.md](../setup/ENV_SETUP.md) - 環境変数設定
