# Step 1: Supabase (PostgreSQL) 本番データベースの作成

[← 目次に戻る](./PRODUCTION.md)

---

## 1-0. Supabase プロジェクト作成

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

## 1-1. 接続文字列の取得

1. Supabase Dashboard 上部の **「Connect」** ボタンをクリック
2. Connection String セクションが表示される
3. 以下の 2 つの接続文字列をコピー:

### DATABASE_URL（Transaction Pooler / Port 6543）

Vercel 等の serverless 環境向け。接続プーリングにより多数の短命接続を効率的に処理。

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

- 「Connect」ダイアログで **Transaction Pooler** タブを選択してコピー
- `[PASSWORD]` 部分をプロジェクト作成時のパスワードに置換

### DIRECT_URL（Direct Connection / Port 5432）

マイグレーション実行用（Drizzle Kit が使用）。

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

- 「Connect」ダイアログで **Session Pooler** または **Direct Connection** タブを選択してコピー
- `[PASSWORD]` 部分をプロジェクト作成時のパスワードに置換

> **Tip**: Transaction Pooler は Prepared Statements をサポートしません。Drizzle ORM のランタイム接続には Transaction Pooler（6543）、マイグレーション実行には Direct Connection または Session Pooler（5432）を使い分けてください。

## 1-2. .env.local に接続文字列を設定

ローカルでマイグレーションを実行するため、`.env.local` に接続文字列を設定:

```bash
# .env.local に追記
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

## 1-3. 依存関係インストール & スキーマを本番 DB に適用

```bash
# 1) 依存関係インストール
npm install

# 2) マイグレーション生成（既に drizzle_pg/ にある場合はスキップ可）
npm run db:generate

# 3) マイグレーション適用
npm run db:migrate
```

> `npm run db:migrate` は `.env.local` の `DIRECT_URL` を使用してマイグレーションを実行します（`drizzle.config.ts` で `DIRECT_URL` 優先に設定済み）。

## 1-4. DB 状態の確認

1. Supabase Dashboard 左サイドバー → **「Table Editor」** をクリック
2. 全テーブル（`user`, `session`, `account`, `company`, `es` 等）が作成されていることを確認

Drizzle Studio で確認する場合:

```bash
npm run db:studio
```
