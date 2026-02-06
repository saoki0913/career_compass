# Career Compass（ウカルン）

就活支援アプリ「ウカルン」- AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | Next.js 16, React 19, TypeScript |
| バックエンド（API） | Next.js App Router |
| バックエンド（AI） | FastAPI (Python) |
| 認証 | Better Auth (Google OAuth) |
| データベース | Turso (libSQL) |
| ORM | Drizzle |
| ベクトルDB | ChromaDB |
| UI | shadcn/ui + Tailwind CSS 4 |
| テスト | Playwright |
| 決済 | Stripe |
| デプロイ | Vercel |

## クイックスタート

```bash
# 依存関係のインストール
npm install

# 環境変数のコピー
cp .env.example .env.local

# データベーススキーマのプッシュ
npx drizzle-kit push

# 開発サーバーの起動
npm run dev
```

詳細なセットアップ手順は [docs/setup.md](docs/setup.md) を参照してください。

## 開発コマンド

```bash
# Next.js フロントエンド起動
make dev

# FastAPI バックエンド起動
make backend

# テスト実行
make test

# Drizzle Studio 起動
make db-studio
```

## プロジェクト構成

```
career_compass/
├── src/
│   ├── app/           # Next.js App Router
│   ├── components/    # React コンポーネント (shadcn/ui)
│   └── lib/           # ユーティリティ (auth, db, storage, stripe)
├── backend/           # FastAPI バックエンド
│   ├── app/
│   │   ├── routers/   # APIエンドポイント
│   │   ├── utils/     # ユーティリティ (RAG, LLM, 検索)
│   │   └── prompts/   # プロンプトテンプレート
│   └── data/          # ChromaDB, BM25インデックス
├── e2e/               # Playwright テスト
└── docs/              # ドキュメント
```

## 主な機能

- **企業検索・管理** - 志望企業の登録と情報収集
- **ES添削** - AIによるエントリーシートの添削・改善提案
- **志望動機作成** - 企業情報を基にした志望動機の自動生成
- **締切管理** - 選考スケジュールとタスクの一元管理
- **ガクチカ管理** - 学生時代に力を入れたことの整理・再利用

## 環境変数

必要な環境変数は [.env.example](.env.example) を参照してください。

主要なサービス設定:
- **Turso** - データベース ([turso.tech](https://turso.tech))
- **Stripe** - 決済 ([stripe.com](https://stripe.com))
- **OpenAI** - LLM・埋め込み ([openai.com](https://openai.com))

## ドキュメント

- [仕様書](docs/SPEC.md) - 詳細な機能仕様
- [開発ガイド](docs/DEVELOPMENT.md) - 開発ルールとパターン
- [進捗状況](docs/PROGRESS.md) - 実装状況の追跡

## ライセンス

MIT
