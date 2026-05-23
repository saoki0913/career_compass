# Step 1: Supabase (PostgreSQL) 本番データベースの作成

[← インデックス](./README.md)

---

## 概要

就活Pass の DB は Supabase (PostgreSQL) を使う。標準運用では **staging / production を別 Supabase project に分離**する（staging = `career-compass-staging`、production = `career-compass-db` / `career-compass`）。

| 項目 | 内容 |
|---|---|
| 重要度 | **[必須]**（DB が無いとアプリは起動しない） |
| 環境区分 | **[環境別]**（接続文字列・project ref は環境ごとに取得が必要。流用不可） |
| 主な変数 | `DATABASE_URL`（Pooler 6543）／`DIRECT_URL`（Direct/Session 5432）／`SUPABASE_STAGING_PROJECT_REF`／`SUPABASE_PRODUCTION_PROJECT_REF` |
| 未設定時の挙動 | `DATABASE_URL` 未設定でアプリ起動・migration 実行が失敗する（fallback なし） |

> 本ドキュメントは **CLI 優先・GUI は fallback** で書く。project ref は `.secrets/` の `supabase.env` に置き、公開サンプルには書かない。release 前確認は `scripts/release/run-migrations.mjs --env <staging|production>` と `scripts/release/sync-career-compass-secrets.sh` を正本にする。
>
> **重要（このプロジェクト固有）**: DB スキーマの migration は Drizzle ORM（`src/lib/db/schema.ts`）で発行し、`npm run db:*` / release runner で適用する。`supabase db push` は**意図的に使わない**（後述 1-3）。Supabase CLI は project 作成・project ref 取得・runtime secrets の反映に使う。

## 1-0. 前提 CLI（Supabase CLI のインストールとログイン）

CLI 主体で進めるため、まず `supabase` CLI を用意する。

```bash
# インストール（いずれか）
brew install supabase/tap/supabase     # macOS / Homebrew（推奨）
npm install supabase --save-dev        # プロジェクト dev 依存として
npx supabase --help                    # インストールせず単発実行

# バージョン確認
supabase --version
```

> 公式: CLI のインストール方法。参考: https://supabase.com/docs/guides/local-development/cli/getting-started

ログインは 2 通り。CI / 非対話では personal access token を環境変数で渡す。

```bash
# 対話ログイン（ブラウザで token を発行）
supabase login

# token を直接渡す（ブラウザを開かない）
supabase login --token "<SUPABASE_ACCESS_TOKEN>"

# CI / 非対話（login を省略し、各コマンドに env で渡す）
export SUPABASE_ACCESS_TOKEN="<personal-access-token>"
```

- personal access token は https://supabase.com/dashboard/account/tokens で発行する。
- `SUPABASE_ACCESS_TOKEN` を export しておけば `supabase login` を省略でき、`projects list` / `secrets set` 等がそのまま動く。実際 `scripts/release/sync-career-compass-secrets.sh` と `scripts/bootstrap/career-compass/bootstrap-career-compass-supabase.sh` はこの env を前提にしている。

> 公式: `supabase login`（`--token` / `SUPABASE_ACCESS_TOKEN`）。参考: https://supabase.com/docs/reference/cli/supabase-login

## 1-1. Supabase プロジェクト作成

### CLI（推奨）

`SUPABASE_ACCESS_TOKEN` を設定済みなら、組織 ID と DB パスワードを指定して project を作成できる。staging / production で別 project にする。

```bash
# 所属組織の ID を確認（SUPABASE_ORG_ID に使う）
supabase orgs list

# staging project
supabase projects create career-compass-staging \
  --org-id "<SUPABASE_ORG_ID>" \
  --db-password "<安全な DB パスワード>" \
  --region ap-south-1

# production project
supabase projects create career-compass-db \
  --org-id "<SUPABASE_ORG_ID>" \
  --db-password "<安全な DB パスワード>" \
  --region ap-south-1

# 作成済み project と ref（id）の一覧
supabase projects list
supabase projects list -o json   # ref を機械的に取り出す場合
```

| flag | 用途 |
|---|---|
| `--org-id` | project を作成する組織 ID（`supabase orgs list` で確認） |
| `--db-password` | DB パスワード。**必ず控える**（接続文字列で使用） |
| `--region` | リージョン。staging / production は同じリージョンに揃える |
| `--size` | インスタンスサイズ（任意） |

- `--region` の有効値は CLI doc に列挙されないため、Dashboard で利用可能なリージョン名を確認してから渡す。production と staging は同一リージョンにする。
- `supabase projects list` の `id`（= project ref）を `SUPABASE_STAGING_PROJECT_REF` / `SUPABASE_PRODUCTION_PROJECT_REF` に使う（後述 1-5）。

> 公式: `supabase orgs list`。参考: https://supabase.com/docs/reference/cli/supabase-orgs-list
> 公式: `supabase projects create`。参考: https://supabase.com/docs/reference/cli/supabase-projects-create
> 公式: `supabase projects list`。参考: https://supabase.com/docs/reference/cli/supabase-projects-list

### GUI（fallback）

CLI が使えない場合は Dashboard から作成する。

1. https://supabase.com/dashboard にログイン（GitHub 連携でサインアップ可能）
2. 左上の **「New Project」** ボタンをクリック
3. Organization を選択（初回は自動作成される）
4. 以下を入力:

| 項目 | 値 | 備考 |
|---|---|---|
| Project name | `career-compass-staging` / `career-compass-db` | staging / production で別 project |
| Database Password | 安全なパスワード | **必ず控えること**（接続文字列で使用） |
| Region | **ap-south-1** 等 | production と staging は同じ region に揃える |
| Pricing Plan | Free で開始可能 | 後から Pro にアップグレード可 |

5. **「Create new project」** ボタンをクリック
6. プロジェクト作成に 1〜2 分かかる → Dashboard に遷移するまで待つ

## 1-2. project ref と接続文字列の取得

`DATABASE_URL` / `DIRECT_URL` は **project ref + DB パスワード + pooler/direct ホスト**から構成する。project ref は CLI で取得できるが、pooler ホストを含む完全な接続文字列は Dashboard の「Connect」から取得するのが確実。

### project ref の取得（CLI・推奨）

```bash
supabase projects list            # NAME と ID(=ref) の表
supabase projects list -o json    # ref をスクリプトで抽出する場合
```

取得した ref を使って接続文字列の雛形を組み立てる（`<PASSWORD>` は作成時の DB パスワード、`<POOLER-HOST>` / `<DIRECT-HOST>` は下の Connect で確認）:

```
# DATABASE_URL（Transaction Pooler / 6543）
postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<POOLER-HOST>:6543/postgres

# DIRECT_URL（Direct / Session / 5432）
postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<DIRECT-OR-SESSION-HOST>:5432/postgres
```

> 公式: Supavisor の pooler 文字列は `postgres://postgres.<ref>:<password>@<host>:6543/postgres` 形式。Transaction mode は 6543、Direct/Session は 5432。参考: https://supabase.com/docs/guides/database/connecting-to-postgres

### 接続文字列の取得（GUI・fallback / 確実）

pooler ホスト名を含む完全な接続文字列は、CLI から安定して取得する手段がないため Dashboard から取得する。

1. Supabase Dashboard 上部の **「Connect」** ボタンをクリック
2. Connection String セクションが表示される
3. 以下の 2 つの接続文字列をコピー:

#### DATABASE_URL（Transaction Pooler / Port 6543）

Vercel 等の serverless 環境向け。接続プーリングにより多数の短命接続を効率的に処理。

```
postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<SUPABASE-POOLER-HOST>:6543/postgres
```

- 「Connect」ダイアログで **Transaction Pooler** タブを選択してコピー
- `[PASSWORD]` 部分をプロジェクト作成時のパスワードに置換

#### DIRECT_URL（Direct Connection / Port 5432）

マイグレーション実行用（Drizzle Kit / release runner が使用）。

```
postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<SUPABASE-DIRECT-OR-SESSION-HOST>:5432/postgres
```

- 「Connect」ダイアログで **Session Pooler** または **Direct Connection** タブを選択してコピー
- `[PASSWORD]` 部分をプロジェクト作成時のパスワードに置換

> **Tip**: Transaction Pooler は Prepared Statements をサポートしません。Drizzle ORM のランタイム接続には Transaction Pooler（6543）、マイグレーション実行には Direct Connection または Session Pooler（5432）を使い分けてください。

## 1-3. .env.local に接続文字列を設定

ローカルでマイグレーションを実行するため、`.env.local` に接続文字列を設定:

```bash
# .env.local に追記
DATABASE_URL=postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<SUPABASE-POOLER-HOST>:6543/postgres
DIRECT_URL=postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<SUPABASE-DIRECT-OR-SESSION-HOST>:5432/postgres
```

## 1-4. 依存関係インストール & スキーマを本番 DB に適用

DB スキーマの migration は **Drizzle で発行し、release runner で適用する**。`supabase db push` は使わない（理由は末尾の注記）。

```bash
# 1) 依存関係インストール
npm install

# 2) マイグレーション生成（既に drizzle_pg/ にある場合はスキップ可）
npm run db:generate

# 3) staging マイグレーションの確認 / 適用
make db-migrate-check-staging
node scripts/release/run-migrations.mjs --env staging --json

# 4) 本番マイグレーションの確認 / 適用
make db-migrate-check
make deploy-migrate
```

> 本番では `.env.local` に本番 `DIRECT_URL` を置いて raw `npm run db:migrate` / `db:push` しないでください。release runner が advisory lock と migration safety check を行います。

> **`supabase db push` を使わない理由**: 本プロジェクトは Drizzle ORM を migration の SSOT としており、`supabase db push` / `supabase db reset` などの CLI 変更系は運用ガードレールで禁止している（`.claude/skills/supabase-ops/SKILL.md`）。`supabase db push --linked` 自体は公式に存在するが（参考: https://supabase.com/docs/reference/cli/supabase-db-push ）、本プロジェクトでは `npm run db:*` / `make deploy-migrate` に統一する。

## 1-5. project ref を secret bundle に設定

bootstrap / secret sync は `SUPABASE_*_PROJECT_REF` を `.secrets/` の `supabase.env` から読む。`supabase projects list` で取得した ref を設定する。

```bash
# project ref の確認（CLI）
supabase projects list

# .secrets/.../supabase.env に設定（実値は .secrets 内のみ。公開サンプルには書かない）
#   SUPABASE_STAGING_PROJECT_REF=<staging project ref>
#   SUPABASE_PRODUCTION_PROJECT_REF=<production project ref>
#   SUPABASE_ACCESS_TOKEN=<personal access token>
#   SUPABASE_ORG_ID=<org id>

# bootstrap の入力チェック（差分があれば報告のみ・修正はしない）
scripts/bootstrap/career-compass/bootstrap-career-compass-supabase.sh --check
```

- `bootstrap-career-compass-supabase.sh --apply` は `supabase projects list -o json` で ref の実在を検証してから進む。
- placeholder の正本は `scripts/release/secrets-examples/{staging,production}/supabase.env.example`。

## 1-6. runtime secrets を Supabase project に反映

Edge Functions などの runtime secret は `supabase secrets set` で linked project に反映する。env ファイルから一括投入できる。

### CLI（推奨）

```bash
# linked project にまとめて反映（env ファイル経由）
supabase secrets set --project-ref "<PROJECT-REF>" --env-file ./supabase.env

# 個別に反映
supabase secrets set MY_KEY=value --project-ref "<PROJECT-REF>"

# 反映済み secret の一覧
supabase secrets list --project-ref "<PROJECT-REF>"
```

- `scripts/release/sync-career-compass-secrets.sh` は内部で `supabase secrets set --project-ref <ref> --env-file <一時ファイル>` を呼ぶ（値を argv に出さず env ファイル経由で渡す）。エージェント運用では通常 `--check` のみ:

```bash
scripts/release/sync-career-compass-secrets.sh --target supabase-staging --check
scripts/release/sync-career-compass-secrets.sh --target supabase-production --check
# 反映（apply）は --target supabase-staging / supabase-production を明示
```

> 公式: `supabase secrets set`（`--env-file` / `--project-ref`）。参考: https://supabase.com/docs/reference/cli/supabase-secrets-set
> 公式: `supabase secrets list`。参考: https://supabase.com/docs/reference/cli/supabase-secrets-list

### GUI（fallback）

Dashboard → 対象 project → **Project Settings** → **Edge Functions / Secrets** から個別に追加・編集する。

## 1-7. DB 状態の確認

### CLI / SQL（推奨）

linked project に対してスキーマや RLS の状態を確認する。

```bash
# project を link（以降 db dump 等が linked project に向く）
supabase link --project-ref "<PROJECT-REF>"

# 適用済みスキーマをダンプして確認（変更は加えない）
supabase db dump --linked --schema public --file /tmp/schema.sql
```

> 公式: `supabase link`。参考: https://supabase.com/docs/reference/cli/supabase-link
> 公式: `supabase db dump`。参考: https://supabase.com/docs/reference/cli/supabase-db-dump

RLS の有効状態は SQL で確認できる（SQL Editor または psql）:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Drizzle Studio で確認する場合:

```bash
npm run db:studio
```

### GUI（fallback）

1. Supabase Dashboard 左サイドバー → **「Table Editor」** をクリック
2. 全テーブル（`user`, `session`, `account`, `company`, `es` 等）が作成されていることを確認

## 1-8. API hardening

本番では DB 作成直後に以下を実施する。

1. `supabase/migrations/` を適用して `public` table の deny-all RLS と grant revoke を反映する
2. Supabase Dashboard の API Settings で Data API を無効化する
3. `public` を exposed schema に使わない
4. GraphQL を使っていないなら `pg_graphql` も無効化する

確認 SQL（再掲）:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

## 環境変数マッピング

| 変数名 | 設定先 | 重要度 | 環境区分 |
|---|---|---|---|
| `DATABASE_URL` | `.env.local` / `nextjs.env`（Vercel） | **[必須]** | **[環境別]** |
| `DIRECT_URL` | `.env.local` / `nextjs.env`（Vercel） | **[推奨]**（migration 5432 用） | **[環境別]** |
| `SUPABASE_STAGING_PROJECT_REF` | `supabase.env`（bootstrap 専用） | **[必須]** | **[環境別]** |
| `SUPABASE_PRODUCTION_PROJECT_REF` | `supabase.env`（bootstrap 専用） | **[必須]** | **[環境別]** |
| `SUPABASE_ACCESS_TOKEN` | `supabase.env` / shell env | **[必須]**（CLI 操作時） | **[環境別]** |
| `SUPABASE_ORG_ID` | `supabase.env` | **[推奨]**（project 作成・bootstrap 時） | **[共通可]**（同一組織なら同値でよい） |

> 変数の意味の SSOT は [`docs/operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)。本書は取得手順の正本。

## ローカル値の流用可否

- **[環境別]・流用不可**: `DATABASE_URL` / `DIRECT_URL` / `SUPABASE_STAGING_PROJECT_REF` / `SUPABASE_PRODUCTION_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN`。staging と production は別 project のため、接続先・project ref・パスワードを使い回せない。`.env.local` の値をそのまま staging / production に貼ってはいけない。各 project の Connect / `supabase projects list` から環境ごとに取得する。
- **[共通可]**: `SUPABASE_ORG_ID` は同一組織で project を作るなら staging / production で同値でよい（環境分離の境界ではない）。

> `sync-career-compass-secrets.sh --check` は `APP_ENV`、Redis namespace、Stripe key prefix、provider project ID（`SUPABASE_*_PROJECT_REF` 含む）の重複を同期前に検査する。staging と production で project ref が一致しているとエラーになる。
