# データベース運用ガイド

Career Compass（ウカルン）のローカル開発環境と本番環境におけるデータベース運用方法をまとめます。

---

## 1. 環境構成の全体像

```
┌──────────────────────────────────────────────────────────────────────┐
│                          開発者の PC                                 │
│                                                                      │
│  Next.js (port 3000)  ──DATABASE_URL──▶  ┌──────────────────────┐   │
│  FastAPI (port 8000)                     │ Supabase Local       │   │
│                                          │  Postgres (54322)    │   │
│  Drizzle CLI ─────────DATABASE_URL──▶    │  Dashboard (54323)   │   │
│   (generate/migrate/push/studio)         │  Auth (54321)        │   │
│                                          └──────────────────────┘   │
│                                             Docker Desktop 上       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         本番 / ステージング                          │
│                                                                      │
│  Vercel (Next.js) ──DATABASE_URL──▶  ┌──────────────────────────┐   │
│                      (Pooler/6543)   │  Supabase Cloud          │   │
│                                      │  ┌────────────────────┐  │   │
│  開発者 PC ─────DIRECT_URL──▶        │  │ PostgreSQL         │  │   │
│   (Drizzle migrate)  (Direct/5432)   │  │                    │  │   │
│                                      │  └────────────────────┘  │   │
│                                      │  Dashboard: app.supabase │   │
│                                      └──────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### 環境変数の対応表

| 環境 | `DATABASE_URL` | `DIRECT_URL` |
|------|---------------|-------------|
| ローカル開発 | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | 不要（空でOK） |
| 本番（アプリ） | `postgresql://...:6543/postgres`（Transaction Pooler） | — |
| 本番（マイグレーション） | — | `postgresql://...:5432/postgres`（Direct） |

---

## 2. ローカル開発環境（Supabase Local）

### 2.1 前提条件

- **Docker Desktop** がインストール済みで起動していること
- **Supabase CLI** がインストール済みであること

```bash
# Supabase CLI インストール（未導入の場合）
brew install supabase/tap/supabase

# Docker Desktop が起動しているか確認
docker info
```

### 2.2 起動手順

```bash
cd /Users/saoki/work/career_compass

# Supabase ローカル環境を起動
supabase start
```

初回起動時は Docker イメージのダウンロードに数分かかります。起動完了後、以下の情報が表示されます:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
        ...
```

### 2.3 ポート競合時の対処（tabi_note との共存）

`tabi_note` プロジェクトも Supabase Local を使用しており、デフォルトでは同じポート（54322）を使います。

**方法 A: 先に tabi_note を停止する（推奨）**

```bash
# tabi_note の Supabase を停止
cd /Users/saoki/work/tabi_note
supabase stop

# career_compass を起動
cd /Users/saoki/work/career_compass
supabase start
```

**方法 B: ポートを変更して共存させる**

`supabase/config.toml` のポートを変更します:

```toml
# supabase/config.toml

[api]
port = 54331        # デフォルト: 54321

[db]
port = 54332        # デフォルト: 54322
shadow_port = 54330 # デフォルト: 54320

[studio]
port = 54333        # デフォルト: 54323

[inbucket]
port = 54334        # デフォルト: 54324
```

ポートを変更した場合、`.env.local` の `DATABASE_URL` も合わせて変更してください:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54332/postgres
```

### 2.4 停止・リセット

```bash
# 停止（データは保持される）
supabase stop

# 完全停止（データも削除）
supabase stop --no-backup

# DB リセット（マイグレーション再適用 + シード実行）
supabase db reset
```

### 2.5 ローカル Supabase Dashboard

起動中は以下のURLでアクセスできます:

- **Dashboard**: http://127.0.0.1:54323
  - Table Editor: テーブルの閲覧・編集
  - SQL Editor: SQLの直接実行
  - Authentication: ユーザー管理

### 2.6 `.env.local` の設定例（ローカル開発）

```env
# ローカル開発環境
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
# DIRECT_URL は空にする（ローカルでは不要）
DIRECT_URL=
```

---

## 3. 本番環境（Supabase Cloud）

### 3.1 接続種別

Supabase Cloud では以下の接続方法があります:

| 接続種別 | ホスト | ポート | 用途 | 制限 |
|---------|-------|--------|------|------|
| **Transaction Pooler** | `aws-*.pooler.supabase.com` | 6543 | アプリ実行 | `prepare: false` 必須、スキーマ操作不可 |
| **Session Pooler** | `aws-*.pooler.supabase.com` | 5432 | Drizzle Studio等 | 制限少ない |
| **Direct** | `db.*.supabase.co` | 5432 | マイグレーション | ネットワーク制限あり |

### 3.2 アプリケーション接続（Transaction Pooler）

本番のアプリ（Next.js）からの接続には **Transaction Pooler（ポート 6543）** を使います。

```env
# 本番用 DATABASE_URL
DATABASE_URL=postgresql://postgres.{PROJECT_REF}:{PASSWORD}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
```

`src/lib/db/index.ts` で `prepare: false` が設定されている必要があります（設定済み）:

```typescript
const client = postgres(databaseUrl, {
  prepare: false, // Transaction Pooler では必須
  ssl: "require",
});
```

### 3.3 マイグレーション接続（Direct）

スキーマ変更を本番に適用するには **Direct 接続（ポート 5432）** を使います。

```env
# マイグレーション用 DIRECT_URL
DIRECT_URL=postgresql://postgres:{PASSWORD}@db.{PROJECT_REF}.supabase.co:5432/postgres
```

> **注意**: Direct 接続（ポート 5432）は一部のネットワーク環境（企業WiFi、ホテルWiFi等）からブロックされることがあります。対処法はセクション 7 を参照してください。

### 3.4 Vercel 環境変数

Vercel にデプロイする場合は、以下を設定します:

| 変数名 | 値 |
|--------|-----|
| `DATABASE_URL` | Transaction Pooler の URL（ポート 6543） |

---

## 4. マイグレーション運用

### 4.1 コマンド一覧

| コマンド | 用途 | 使用タイミング |
|---------|------|--------------|
| `npm run db:generate` | スキーマ差分から SQL を生成 | `schema.ts` を変更した後 |
| `npm run db:migrate` | 生成済み SQL を DB に適用 | generate 後、または初期セットアップ時 |
| `npm run db:push` | スキーマを直接 DB に反映 | 開発初期の素早い反映（履歴管理なし） |
| `npm run db:studio` | Drizzle Studio（GUI）起動 | DB 内容の確認 |

### 4.2 ローカルでのマイグレーション

```bash
# 1. Supabase Local が起動していることを確認
supabase status

# 2. スキーマ変更後、マイグレーション生成
npm run db:generate

# 3. マイグレーション適用
npm run db:migrate

# 4. 確認（Supabase Dashboard で）
# http://127.0.0.1:54323
```

### 4.3 本番へのマイグレーション適用

```bash
# 1. .env.local に本番の DIRECT_URL を設定
# DIRECT_URL=postgresql://postgres:{PASSWORD}@db.{PROJECT_REF}.supabase.co:5432/postgres

# 2. マイグレーション適用
npm run db:migrate

# 3. 確認（Supabase Dashboard で）
# https://supabase.com/dashboard/project/{PROJECT_REF}
```

### 4.4 DIRECT_URL 接続エラー時の対処

ネットワーク環境により Direct 接続（ポート 5432）がブロックされる場合:

```bash
# DIRECT_URL を無効化して Pooler 経由でマイグレーション
DIRECT_URL="" npx dotenv -e .env.local -- drizzle-kit migrate
```

---

## 5. 環境切り替え手順

### 5.1 ローカル → 本番

`.env.local` を編集:

```env
# ローカル設定をコメントアウト
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 本番設定を有効化
DATABASE_URL=postgresql://postgres.{PROJECT_REF}:{PASSWORD}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres:{PASSWORD}@db.{PROJECT_REF}.supabase.co:5432/postgres
```

### 5.2 本番 → ローカル

`.env.local` を編集:

```env
# 本番設定をコメントアウト
# DATABASE_URL=postgresql://postgres.{PROJECT_REF}:{PASSWORD}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
# DIRECT_URL=postgresql://postgres:{PASSWORD}@db.{PROJECT_REF}.supabase.co:5432/postgres

# ローカル設定を有効化
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=
```

> **Tips**: 切り替え時は開発サーバー（`npm run dev`）の再起動が必要です。

---

## 6. DB 確認ツール

### 6.1 Supabase Dashboard（推奨）

| 環境 | URL |
|------|-----|
| ローカル | http://127.0.0.1:54323 |
| 本番 | https://supabase.com/dashboard/project/{PROJECT_REF} |

主な機能:
- **Table Editor**: テーブルの閲覧・編集（GUI）
- **SQL Editor**: SQL の直接実行
- **Authentication**: ユーザー管理
- **Storage**: ファイルストレージ管理

### 6.2 Drizzle Studio

```bash
npm run db:studio
```

- URL: https://local.drizzle.studio
- ローカル DB に接続して使用
- **注意**: Transaction Pooler（ポート 6543）ではスキーマ情報を取得できないため、ローカル DB またはDirect/Session Pooler接続が必要

### 6.3 psql 直接接続

```bash
# ローカル
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 本番（Direct）
psql "$DIRECT_URL"
```

---

## 7. よくあるエラーと対処

### Circuit breaker open

```
PostgresError: Circuit breaker open: Too many authentication errors
```

**原因**: Supabase Pooler（PgBouncer）が連続した認証失敗を検知し、一時的に接続を遮断。

**対処**:
1. `.env.local` の `DATABASE_URL` のパスワードが正しいか確認
2. 開発サーバーを停止して 30 秒〜数分待つ（自動回復）
3. 開発サーバーを再起動

### ECONNREFUSED :5432

```
ECONNREFUSED ::1:5432
```

**原因**: Direct 接続（ポート 5432）がネットワーク環境からブロックされている。

**対処**:
```bash
# 方法 1: IPv4 優先
NODE_OPTIONS=--dns-result-order=ipv4first npm run db:migrate

# 方法 2: DIRECT_URL を無効化して Pooler 経由
DIRECT_URL="" npx dotenv -e .env.local -- drizzle-kit migrate

# 方法 3: 別のネットワーク（テザリング等）を使用
```

### ポート競合（supabase start）

```
bind: address already in use (port 54322)
```

**原因**: 別のプロジェクト（tabi_note 等）が同じポートを使用中。

**対処**:
```bash
# 方法 1: 競合プロジェクトを停止
cd /Users/saoki/work/tabi_note && supabase stop

# 方法 2: supabase/config.toml でポートを変更（セクション 2.3 参照）
```

### DATABASE_URL is not set

**原因**: `.env.local` に `DATABASE_URL` が設定されていない、または値が空。

**対処**: `.env.local` を確認し、正しい接続 URL を設定。

### Drizzle Studio のスキーマが読み込まれない

**原因**: Transaction Pooler（ポート 6543）はスキーマ情報の取得に必要なクエリ（prepared statements）をサポートしていない。

**対処**: ローカル DB（`supabase start`）に接続して使用する。

---

## 関連ドキュメント

- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) — Supabase Cloud のセットアップ手順
- [DATABASE.md](../architecture/DATABASE.md) — スキーマ設計・テーブル定義
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 開発ガイド全般
- [ENV_SETUP.md](./ENV_SETUP.md) — 環境変数の設定
