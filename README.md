# 就活Pass（シューパス）

就活支援アプリ「就活Pass」- 就活AI・ES添削・締切管理をまとめて使える就活アプリ

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | Next.js 16, React 19, TypeScript |
| バックエンド（API） | Next.js App Router |
| バックエンド（AI） | FastAPI (Python) |
| 認証 | Better Auth (Google OAuth) |
| データベース | Supabase (PostgreSQL) |
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

# データベース（初回）
# 空のDBに一気に反映（開発/初期構築向け）
npm run db:push
#
# 推奨: マイグレーション生成 -> 適用
# npm run db:generate
# npm run db:migrate

# 開発サーバーの起動
npm run dev
```

詳細なセットアップ手順は [環境設定ガイド](docs/setup/ENV_SETUP.md) を参照してください。

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

## リリース運用

- ローカルで `npm run lint` と `npm run build` を通す
- `develop` にコミットして `git push origin develop`
- staging 環境で動作確認する
- GitHub で `develop -> main` の PR を作成してマージする
- `main` へのマージをトリガーに Vercel / Railway が本番へ自動デプロイする

正式な環境は次の 3 つです。

- local: `http://localhost:3000`
- staging: `https://stg.shupass.jp`
- production: `https://www.shupass.jp`

任意の preview URL や `*.vercel.app` は OAuth と書き込み系 API の正式運用環境として扱いません。

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
- **Supabase** - データベース ([supabase.com](https://supabase.com))
- **Stripe** - 決済 ([stripe.com](https://stripe.com))
- **OpenAI** - 埋め込み・企業情報抽出 ([openai.com](https://openai.com))
- **Anthropic** - ES添削・ガクチカ・志望動機 ([anthropic.com](https://anthropic.com))

## ドキュメント

- [仕様書](docs/SPEC.md) - 詳細な機能仕様
- [開発ガイド](docs/setup/DEVELOPMENT.md) - 開発ルールとパターン
- [進捗状況](docs/PROGRESS.md) - 実装状況の追跡

## ライセンス

MIT
