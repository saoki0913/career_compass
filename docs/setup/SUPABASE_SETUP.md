# Supabase セットアップ（PostgreSQL）: すぐ動かす手順

> 📖 ローカル開発環境・本番環境の切り替え・トラブルシューティングは **[DB_OPERATIONS.md](./DB_OPERATIONS.md)** を参照してください。

このプロジェクトは **Supabase (PostgreSQL)** をメインDBとして使います。
DBスキーマは **Drizzle** で管理し、マイグレーションは `drizzle_pg/` に出力します。

## 0. 前提

- Node.js 20+ 推奨
- `npm` を使用（本リポジトリは `package-lock.json` 管理）

```bash
cd /Users/saoki/work/career_compass
node -v
npm -v
```

## 1. Supabase プロジェクト作成（Dashboard）

1. Supabase Dashboard で **New project**
2. Region は可能なら **Tokyo**（なければ Singapore）
3. Database Password を安全に保管
4. **Settings -> Database -> Connection string** を開く

この画面から、以下の2つのURLを用意します。

- **Pooler (Transaction mode / 6543)**: アプリ実行用（推奨）
postgresql://postgres.dqlaqqgldpmfqmfzzgvk:1192@Nihon@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
- **Direct connection (5432)**: マイグレーション用（推奨）
postgresql://postgres:1192@Nihon@db.dqlaqqgldpmfqmfzzgvk.supabase.co:5432/postgres
## 2. `.env.local` を作る/更新する

まずバックアップ（任意）:

```bash
cp .env.local .env.local.bak.$(date +%Y%m%d%H%M%S)
```

`.env.local` を編集:

```bash
code .env.local
# または
nano .env.local
```

### 2-1. DB（必須）

Supabase で取得した接続文字列をそのまま貼ります（`?sslmode=require` などのクエリが付いていれば削らない）。

> 注意: パスワードに `@` / `#` / `:` / `/` などが含まれる場合は、URLとして壊れないよう **URLエンコード**して入れてください。  
> 例: `@` は `%40`、`#` は `%23`。

```bash
# パスワードをURLエンコードした文字列を出力
node -e "console.log(encodeURIComponent(process.argv[1]))" "your-password-here"
```

```env
# アプリ実行用（推奨: Pooler / 6543 / Transaction mode）
DATABASE_URL=postgresql://...

# マイグレーション用（推奨: Direct / 5432）
DIRECT_URL=postgresql://...
```

補足:
- アプリ側は Supabase Pooler (Transaction mode) 対応のため `prepare: false` を設定しています。
- `DIRECT_URL` が無い場合でも migrate は動くことがありますが、基本は `DIRECT_URL` を推奨します。

### 2-2. Better Auth（ログインに必要）

```bash
openssl rand -base64 32
```

出力を `.env.local` に設定:

```env
BETTER_AUTH_SECRET=（上の出力）
BETTER_AUTH_URL=http://localhost:3000
```

### 2-3. Google OAuth（ログインに必要）

Google Cloud Console で OAuth Client を作成し、リダイレクトURIを設定:

- `http://localhost:3000/api/auth/callback/google`

発行された値を `.env.local` に設定:

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

### 2-4. 暗号化キー（企業マイページ等の機能に必要）

```bash
openssl rand -hex 32
```

出力（64桁 hex）を `.env.local` に設定:

```env
ENCRYPTION_KEY=（上の出力）
```

### 2-5. Stripe（課金導線を動かすなら必要）

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
```

## 3. 依存関係をインストール

```bash
npm install
```

インストール確認（任意）:

```bash
node -e "require('postgres'); console.log('postgres ok')"
```

## 4. テーブル作成（Drizzle migrate）

このリポジトリには PostgreSQL 用の初期マイグレーションが `drizzle_pg/` に含まれています。
基本は **migrate だけ**でOKです。

```bash
npm run db:migrate
```

スキーマを変更した場合は、以下の順で実行します:

```bash
npm run db:generate
npm run db:migrate
```

空のDBに一気に作りたい（開発/初期構築向け。履歴管理は弱い）場合:

```bash
npm run db:push
```

## 5. DB 確認（任意）

Drizzle Studio:

```bash
npm run db:studio
```

psql（入っていれば）:

```bash
psql "$DIRECT_URL"
```

## 6. 起動

```bash
npm run dev
```

ブラウザで:

- http://localhost:3000

## 7. よくあるエラー

### `DATABASE_URL is not set`

`.env.local` に `DATABASE_URL` が無い/空、または値が間違っています。

### `password authentication failed for user "postgres"` (28P01)

DB 接続はできているが、**パスワードが一致していない**状態です。

よくある原因:
- Supabase の Connection string の `YOUR_PASSWORD` 部分に、別の値を入れてしまった（DB パスワードは API Key ではありません）
- Supabase 側で DB パスワードをリセットしたが、`.env.local` を更新していない

対処:
1. Supabase Dashboard → **Settings** → **Database** → **Reset database password**（または作成時のパスワードを確認）
2. `.env.local` の `DIRECT_URL` / `DATABASE_URL` のパスワード部分を更新
3. 再実行:

```bash
npm run db:studio
```

### `connect ECONNREFUSED ...:5432`

`DIRECT_URL`（Direct connection / 5432）への接続がネットワーク的にブロックされている状態です。
よくある原因は以下です:

- 会社/学校/ホテルWi-Fiが `5432` をブロックしている
- IPv6 で解決された接続先がうまく到達できない

対処（上から順に試す）:

1) IPv4 を優先して起動

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npm run db:studio
```

2) Pooler (6543) を使う（`DIRECT_URL` を無効化して `DATABASE_URL` で接続）

`.env.local` を以下のようにする:

```env
DIRECT_URL=
DATABASE_URL=postgresql://...:6543/postgres
```

3) どうしても 5432 が必要な場合は、別ネットワーク（スマホテザリング等）や VPN を利用

### migrate が失敗する

- `DIRECT_URL` が direct(5432) ではない
- Supabase の connection string を途中で削っている（`?sslmode=require` など）
- パスワード/ホスト名が誤っている

### ログインできない

- Google OAuth の Redirect URI 不一致
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 未設定
