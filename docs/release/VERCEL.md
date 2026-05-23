# Step 4: Vercel にフロントエンドをデプロイ

[← インデックス](./README.md)

---

このドキュメントは **`vercel` CLI を第一**に書いています。GUI（Vercel Dashboard）の手順は fallback として各セクションの後半に残しています。CLI が無い操作のみ Dashboard を使ってください。

> いまの標準運用では、Vercel の env は `scripts/release/sync-career-compass-secrets.sh` で同期し、値の正本は repo local の `.secrets/` です。人間向けの一覧は [`docs/operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) を参照してください。個別の `vercel env` 操作と sync script の関係は [4-4](#4-4-環境変数を設定) を参照。

## 環境構成の前提

論理環境は `APP_ENV`（`local` / `staging` / `production`）が正本です。staging も production も **それぞれ別 Vercel project の Production env scope** に乗せ、アプリの分岐は `APP_ENV` だけで行います（`Preview` scope は使いません）。

| 論理環境 | Git branch | Vercel project | Vercel env scope | URL |
|---|---|---|---|---|
| local | ローカル `develop` | なし | `.env.local` | `http://localhost:3000` |
| staging | remote `develop` | `career-compass-staging` | Production | `https://stg.shupass.jp` |
| production | remote `main` | `career-compass` | Production | `https://www.shupass.jp` |

> 詳細は [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md)。`NODE_ENV` / `VERCEL_ENV` はプラットフォームが自動設定する信号で、アプリの環境分岐には使いません。

## 4-0. 前提 CLI（Vercel CLI のインストールとログイン）

```bash
# Vercel CLI をインストール（npm / pnpm / yarn / bun いずれか）
npm i vercel

# バージョン確認
vercel --version

# ブラウザ経由でログイン（対話）
vercel login

# ログイン中ユーザーの確認
vercel whoami

# 所属チーム（scope）の一覧
vercel teams list
```

> 公式: Vercel CLI のインストールとログイン。参考: https://vercel.com/docs/cli

CI/CD や非対話環境では `vercel login` の代わりに **token** で認証します。token は https://vercel.com/account/tokens で発行します。

```bash
# 環境変数で渡す（推奨。プロセス一覧やログに残りにくい）
export VERCEL_TOKEN=<token>
vercel whoami

# あるいは個別コマンドに --token を渡す（--token が環境変数より優先）
vercel whoami --token <token>
```

> 公式: CI/CD では `VERCEL_TOKEN` 環境変数を推奨。参考: https://vercel.com/docs/cli#using-in-a-ci-cd-environment

### project / team の指定（非対話・複数 project の取り違え防止）

このリポジトリは staging と production で **別 project** を使うため、CLI コマンドがどの project / team を対象にするかを必ず明示します。指定方法は 3 通りで、優先順位は `--project` フラグ > `VERCEL_PROJECT_ID` 環境変数 > `vercel link` が作る `.vercel/project.json` です。

```bash
# 方法 A: 環境変数で project と team を固定（CI/CD・sync script が使う方法）
VERCEL_PROJECT_ID="<career-compass-staging の project id>" \
VERCEL_ORG_ID="<VERCEL_TEAM_ID の値>" \
  vercel env ls production --scope "<team slug or id>"

# 方法 B: ローカルディレクトリを既存 project にリンク（.vercel/ を作成）
vercel link --yes --project career-compass-staging --scope "<team slug or id>"

# 方法 C: 個別コマンドに --project と --scope を渡す
vercel list --project career-compass --scope "<team slug or id>" --prod
```

> 公式: project は `--project` / `VERCEL_PROJECT_ID` / `vercel link` で指定。CI/CD では `VERCEL_ORG_ID` と `VERCEL_PROJECT_ID` を設定するとリンクを省略できる。参考: https://vercel.com/docs/cli/global-options#project / https://vercel.com/docs/cli/link

`VERCEL_PROJECT_ID`（project id）と `VERCEL_TEAM_ID`（team id。CLI には `VERCEL_ORG_ID` として渡す）の値は `.secrets/` bundle の `nextjs.env` に入っています。`VERCEL_PROJECT_ID` は `[環境別]`（staging と production で別 project）、`VERCEL_TEAM_ID` は `[共通可]` です。

## 4-1. Vercel にプロジェクトをインポート

### CLI（推奨）

ローカルリポジトリを Vercel project にリンクし、初回デプロイで project を作成します。

```bash
# 既存リポジトリのルートで実行。対話で team / project 名 / 設定を確認
vercel link

# 既に project がある場合は名前を指定して非対話リンク
vercel link --yes --project career-compass --scope "<team slug or id>"

# project 一覧で作成済みか確認
vercel project ls --scope "<team slug or id>"
```

> 公式: ローカルディレクトリを Vercel project にリンクする。参考: https://vercel.com/docs/cli/link / https://vercel.com/docs/cli/project

Framework Preset（Next.js）と Root Directory（`.`）はリポジトリから自動検出されます。Build / Install / Output は Next.js のデフォルトのままで問題ありません。

> このリポジトリは GitHub 連携による Git-based deploy（`develop` → staging project、`main` → production project）が正本です。`vercel link` は env 同期や手動デプロイのために local とリモート project を結びつける用途で使います。Git 連携自体は [4-3](#4-3-git-設定) を参照。

### GUI（fallback）

1. https://vercel.com/new にアクセス（ログイン済みであること）
2. **「Import Git Repository」** セクションに GitHub リポジトリ一覧が表示される
3. `career_compass` を検索 → **「Import」** ボタンをクリック
4. **Configure Project** 画面が表示される:

| 設定項目 | 値 | 説明 |
|---|---|---|
| Framework Preset | **Next.js** (自動検出) | Vercel がフレームワークを自動判別 |
| Root Directory | `.` (ルート) | バックエンドは Railway のため変更不要 |
| Build Command | `npm run build` | デフォルトのまま |
| Node.js Version | **20.x** | LTS 版 |

5. **Environment Variables** セクション（Configure Project 画面下部）で環境変数を事前設定可能:
   - Variable Name / Value を入力 → **「Add」** ボタンで追加
   - ここで全変数を設定してからデプロイすると初回ビルドから成功する
6. **「Deploy」** ボタンをクリック

> 環境変数を後から設定する場合、初回ビルドは失敗する可能性があります。4-4 で設定後に再デプロイしてください。

1. https://vercel.com/new にアクセス（ログイン済みであること）
2. **「Import Git Repository」** セクションに GitHub リポジトリ一覧が表示される
3. `career_compass` を検索 → **「Import」** ボタンをクリック
4. **Configure Project** 画面が表示される:

| 設定項目 | 値 | 説明 |
|---|---|---|
| Framework Preset | **Next.js** (自動検出) | Vercel がフレームワークを自動判別 |
| Root Directory | `.` (ルート) | バックエンドは Railway のため変更不要 |
| Build Command | `npm run build` | デフォルトのまま |
| Node.js Version | **20.x** | LTS 版 |

5. **Environment Variables** セクション（Configure Project 画面下部）で環境変数を事前設定可能:
   - Variable Name / Value を入力 → **「Add」** ボタンで追加
   - ここで全変数を設定してからデプロイすると初回ビルドから成功する
6. **「Deploy」** ボタンをクリック

> 環境変数を後から設定する場合、初回ビルドは失敗する可能性があります。4-4 で設定後に再デプロイしてください。

## 4-2. General 設定

### CLI（推奨・確認）

リンク済み project の設定（Framework / Root Directory / Node.js / build 設定など）は `inspect` で確認できます。

```bash
# リンク済み project の設定を表示
vercel project inspect --scope "<team slug or id>"

# 名前を指定して別 project を確認
vercel project inspect career-compass-staging --scope "<team slug or id>"
```

> 公式: project 設定の確認は `vercel project inspect`。参考: https://vercel.com/docs/cli/project

> Framework Preset / Root Directory / Build / Install / Output などの **書き込み変更は CLI に専用サブコマンドがありません**。値の変更が必要な場合は下記 GUI、または `vercel.json` での設定を使ってください。Next.js のデフォルト（Build `npm run build` / Output 自動検出 / Install `npm install`）のままで運用しているため、通常は変更不要です。

### GUI（fallback）

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「General」**

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Project Name | `career-compass` | ダッシュボードでの識別名、デフォルトドメインの一部 |
| Framework Preset | Next.js | 自動検出済み |
| Root Directory | `.` | リポジトリルート |
| Node.js Version | `20.x` | LTS 版を推奨 |
| Build Command | `npm run build` | デフォルトのまま |
| Output Directory | — | Next.js は自動検出（`.next`） |
| Install Command | `npm install` | デフォルトのまま |

## 4-3. Git 設定

### CLI（推奨）

ローカルの `.git` リモートを、リンク済み Vercel project に接続します。

```bash
# 連携状態の確認
vercel git ls --scope "<team slug or id>"

# ローカル .git のリモートを Vercel project に接続（develop / main の push でデプロイ）
vercel git connect --yes --scope "<team slug or id>"

# 連携解除
vercel git disconnect --scope "<team slug or id>"
```

> 公式: Git provider 連携は `vercel git connect`。参考: https://vercel.com/docs/cli/git

> **Production Branch**（production project: `main` / staging project: `develop`）、**Ignored Build Step**、**Auto-cancel Deployments** の設定には CLI の専用サブコマンドがありません。これらは下記 GUI で設定してください。Ignored Build Step は `vercel.json` の `git.deploymentEnabled` でも一部制御できます。

### GUI（fallback）

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Git」**

| 設定項目 | 値 | 説明 |
|---|---|---|
| Connected Git Repository | `saoki0913/career_compass` | GitHub 連携済み |
| Production Branch | production project: `main` / staging project: `develop` | Local → Staging → Production の正本 |
| Ignored Build Step | 下記 | Preview build を正式運用から外す |
| Auto-cancel Deployments | `On`（推奨） | 同ブランチへの連続 push で前のビルドをキャンセル |

正式な対応関係は [環境構成の前提](#環境構成の前提) の表を参照。

Vercel Preview は正式な release / OAuth / Stripe / 書き込み確認の対象外です。将来の Preview build を抑止する場合、Ignored Build Step は以下にします。Vercel は `0` で build skip、非 0 で build 継続です。

```bash
# staging project: develop だけ build
if [ "$VERCEL_GIT_COMMIT_REF" = "develop" ]; then exit 1; else exit 0; fi

# production project: main だけ build
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
```

## 4-4. 環境変数を設定

### CLI（推奨・正規ルート: sync script 経由）

このリポジトリでは Vercel の env は **repo の sync script で一括同期する**のが正本です。値の正本は `.secrets/` bundle にあり、script が内部で `vercel env` を呼び出して反映します。手動で `vercel env add` を打つより、まずこの経路を使ってください。

```bash
# 差分確認（値は表示せずキー名の差分だけ出す。production project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production

# 反映（production project の Production scope へ）
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production

# staging project（staging も Vercel の Production scope に乗せる）
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-staging
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-staging --vercel-env production

# repo の標準入口（全 provider 一括）
make ops-secrets-sync
```

> インベントリ確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみで行います。実 secret ファイルは直接開きません。変数の意味・必須性・環境差の正本は [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) と `.secrets/` bundle です。この文書に変数カタログを複製しないでください。

### CLI（直接 `vercel env` を使う場合）

単発の確認や、sync script を介さずに 1 変数だけ操作したいときは `vercel env` を直接使えます。**この場合 `.secrets/` bundle が正本でなくなるため、後で sync script の `--check` に差分として出ます。** 恒久的な値は必ず bundle 側に反映してから sync してください。

このリポジトリでは staging / production は別 project なので、`VERCEL_PROJECT_ID`（project id）+ `VERCEL_ORG_ID`（= `VERCEL_TEAM_ID` の値）+ `--scope` で対象を固定します（sync script と同じ方法）。env scope は staging / production とも `production` です。

```bash
# 変数一覧（Production scope のキー名を確認）
VERCEL_PROJECT_ID="<project id>" VERCEL_ORG_ID="<team id>" \
  vercel env ls production --scope "<team slug or id>"

# 1 変数を追加（値は stdin から渡す。bash history に残さない）
printf '%s' "<value>" | VERCEL_PROJECT_ID="<project id>" VERCEL_ORG_ID="<team id>" \
  vercel env add DATABASE_URL production --scope "<team slug or id>"

# 既存の同名変数を上書き（確認プロンプトを skip）
printf '%s' "<value>" | VERCEL_PROJECT_ID="<project id>" VERCEL_ORG_ID="<team id>" \
  vercel env add DATABASE_URL production --force --yes --scope "<team slug or id>"

# 変数を削除（確認 skip）
VERCEL_PROJECT_ID="<project id>" VERCEL_ORG_ID="<team id>" \
  vercel env rm DATABASE_URL production --yes --scope "<team slug or id>"
```

> 公式: 環境変数の CLI 操作は `vercel env ls/add/rm/update/pull`。参考: https://vercel.com/docs/cli/env

**Sensitive の挙動（公式仕様）**: `vercel env add` は production / preview に対して **デフォルトで sensitive** として保存します（保存後は Dashboard でも `vercel env ls` でも値を再表示できません）。暗号化のみにしたい場合は `--no-sensitive`、明示的に sensitive 指定するなら `--sensitive` を付けます（両方同時はエラー）。development scope は sensitive 不可です。

> **重要**: 環境変数の変更は **次回デプロイから** 反映されます。既存のデプロイには影響しません。反映には再デプロイが必要です（[4-9](#4-9-デプロイ実行--確認)）。

> `vercel env pull <file>` は **クラウド側の値をローカルファイルに書き出す**コマンドです（`next dev` 等のローカルツール向け）。`.secrets/` bundle が正本のこのリポジトリでは、確認用途以外では使いません。`vercel pull`（`.vercel/` にキャッシュ）は `vercel build` / `vercel dev` 用で、通常運用では不要です。

### GUI（fallback）

1. Vercel Dashboard → 対象プロジェクトをクリック
2. 上部の **「Settings」** タブをクリック
3. 左サイドメニューから **「Environment Variables」** をクリック

変数の追加手順:

1. **Key** 欄に変数名を入力（例: `DATABASE_URL`）
2. **Value** 欄に値を入力
3. **Environment** チェックボックスで適用先を選択:

| Environment | 適用タイミング | 用途 |
|---|---|---|
| **Production** | production project の `main` / staging project の `develop` | 正式な production / staging |
| **Preview** | 正式運用では未使用 | OAuth / Stripe / DB 書き込み用 secret を入れない |
| **Development** | `vercel dev` ローカル実行時 | ローカル開発用 |

4. シークレットキー（`STRIPE_SECRET_KEY` 等）は **「Sensitive」** トグルを ON にする
   - ON にすると保存後に値を再表示できなくなる（セキュリティ強化）
5. **「Save」** ボタンをクリック

> **重要**: 環境変数の変更は **次回デプロイから** 反映されます。既存のデプロイには影響しません。変数設定後に再デプロイが必要な場合は、Deployments タブから最新デプロイの **「...」** → **「Redeploy」** をクリック。

### 環境変数の正本

Vercel に設定する変数の意味・必須性・環境差は、この文書では管理しません。正本は [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) と `.secrets/` bundle です。設定・差分確認は上記 CLI（sync script）を使います。この setup 文書は操作手順だけを扱い、変数カタログをここに複製しないでください。

### 設定不要な変数

| 変数 | 理由 |
|---|---|
| `OPENAI_API_KEY` | AI API はバックエンド (Railway) 経由 |
| `ANTHROPIC_API_KEY` | 同上 |
| `CLAUDE_MODEL` / `OPENAI_MODEL` | バックエンド側で設定 |
| `CORS_ORIGINS` | バックエンド側の設定 |

## 4-5. Domains 設定

### CLI（推奨）

```bash
# scope 配下のドメイン一覧
vercel domains ls --scope "<team slug or id>"

# ドメインの詳細（DNS / 検証状態）を確認
vercel domains inspect shupass.jp --scope "<team slug or id>"

# ドメインを project に追加（production project に www / apex を割り当て）
vercel domains add www.shupass.jp career-compass --scope "<team slug or id>"
vercel domains add shupass.jp career-compass --scope "<team slug or id>"

# staging project には stg サブドメインを割り当て
vercel domains add stg.shupass.jp career-compass-staging --scope "<team slug or id>"
```

> 公式: ドメイン管理は `vercel domains add/ls/inspect/rm`。参考: https://vercel.com/docs/cli/domains

> DNS レコード自体（CNAME / A）の設定は [Step 0](./DOMAIN_OPERATIONS.md) 側で完了している前提です。SSL 証明書は DNS が valid になると自動発行されます（Let's Encrypt）。`vercel domains inspect` で `Valid Configuration` を確認してください。

### GUI（fallback）

1. Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Domains」**
2. ドメイン入力欄に `shupass.jp` と入力 → **「Add」** ボタンをクリック
3. DNS 設定の指示が表示される（[Step 0](./DOMAIN_OPERATIONS.md) で設定済み）

**Step 0 で設定済み。** 以下が Valid Configuration であることを確認:

| ドメイン | 状態 | 説明 |
|---|---|---|
| `www.shupass.jp` | Valid Configuration | CNAME → `cname.vercel-dns.com` |
| `shupass.jp` | Redirects to www.shupass.jp | A レコード → `76.76.21.21` |

| 設定項目 | 値 | 説明 |
|---|---|---|
| SSL Certificate | 自動発行 (Let's Encrypt) | DNS 設定後に自動 |
| Git Branch | `main` (Production) | ドメインに紐づくブランチ |

> `*.vercel.app` の Preview URL は正式環境ではありません。OAuth、Stripe Webhook、CORS、trusted origins、監視対象には登録しません。

## 4-6. Functions 設定

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Functions」**

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Default Function Region | `hnd1` (Tokyo, Japan) | ユーザーに最も近いリージョン |
| Max Duration | `60s` (Pro) / `10s` (Hobby) | Serverless Function のタイムアウト |

> **重要**: ES 添削や企業情報取得は FastAPI (Railway) に中継します。Railway からの応答を待つ時間も含まれるため、Pro プラン（60s）を推奨。Hobby プラン（10s）では長時間処理がタイムアウトする可能性があります。

## 4-7. Cron Jobs 設定

`vercel.json` で定義済み（Dashboard での追加設定は不要）:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-notifications",
      "schedule": "0 0 * * *"
    }
  ]
}
```

| 設定項目 | 値 | 説明 |
|---|---|---|
| スケジュール | `0 0 * * *` | UTC 0:00 = **JST 9:00** に実行 |
| エンドポイント | `/api/cron/daily-notifications` | 日次の締切通知チェック |
| 認証 | `CRON_SECRET` 環境変数 | Bearer トークンで不正実行を防止 |
| プラン要件 | **Pro 以上** | Hobby プランでは Cron 利用不可 |

> Vercel Dashboard → 対象プロジェクト → **Cron Jobs** タブで実行履歴を確認可能。

## 4-8. Security Headers

`next.config.ts` で設定済み（Vercel Dashboard での追加設定は不要）:

| ヘッダー | 値 | 目的 |
|---|---|---|
| `X-Frame-Options` | `DENY` | クリックジャッキング防止 |
| `X-Content-Type-Options` | `nosniff` | MIME タイプスニッフィング防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラー情報の制限 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ブラウザ機能の制限 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HTTPS 強制 |
| `Content-Security-Policy` | `src/proxy.ts` + `src/lib/security/csp.ts` 参照 | XSS 防止（全 HTML 面で nonce CSP を適用） |

## 4-9. デプロイ実行 & 確認

### CLI（推奨・正規ルート: Git push + release automation）

このリポジトリの正規デプロイは **Git push による自動デプロイ**です。`develop` への push で staging project、`main` への push で production project がデプロイされます。release automation（repo script）がこの流れを束ねます。

```bash
# repo の release automation 入口（staging 検証 → 本番昇格まで）
make deploy-staging      # staging のみ
make deploy-production   # 本番のみ（staging gate あり）
make deploy              # staged-only 明示時
```

> Git-based deploy はビルド時に System Environment Variables が揃うため、Next.js では最も安全です。

### CLI（直接 `vercel` でデプロイする場合）

Git を介さずに手元から直接デプロイすることもできます（hotfix 確認など）。project は `VERCEL_PROJECT_ID` + `VERCEL_ORG_ID` + `--scope` で固定します。

```bash
# production デプロイ（production project）
VERCEL_PROJECT_ID="<project id>" VERCEL_ORG_ID="<team id>" \
  vercel --prod --scope "<team slug or id>"

# ビルドログも表示しながらデプロイ
VERCEL_PROJECT_ID="<project id>" VERCEL_ORG_ID="<team id>" \
  vercel deploy --prod --logs --scope "<team slug or id>"

# 既存デプロイの再デプロイ
vercel redeploy <deployment-url-or-id> --scope "<team slug or id>"
```

> 公式: デプロイは `vercel` / `vercel --prod`、再デプロイは `vercel redeploy`。参考: https://vercel.com/docs/cli/deploy / https://vercel.com/docs/cli/redeploy

### デプロイ状況の確認（CLI）

```bash
# 本番デプロイ一覧（vercel ls は vercel list のエイリアス）
vercel list --prod --scope "<team slug or id>"

# 特定デプロイの詳細（ビルドログ付き）
vercel inspect <deployment-url-or-id> --logs --scope "<team slug or id>"

# ランタイムログを追跡
vercel logs <deployment-url> --scope "<team slug or id>"
```

> 公式: デプロイ一覧 `vercel list`、詳細 `vercel inspect`、ログ `vercel logs`。参考: https://vercel.com/docs/cli/list / https://vercel.com/docs/cli/inspect / https://vercel.com/docs/cli/logs

> 正式な staging は別 project の `stg.shupass.jp` です。`*.vercel.app` の preview URL は release automation と保証対象から外します。

### GUI（fallback）

1. Vercel Dashboard → 対象プロジェクト → 上部の **「Deployments」** タブをクリック
2. 各デプロイのステータスを確認:
   - **Building**: ビルド中（デプロイをクリック → Build Logs で進捗確認）
   - **Ready**: デプロイ完了
   - **Error**: ビルド失敗（デプロイをクリック → Build Logs でエラー確認）
3. デプロイの **「...」**（三点メニュー）→ **「Redeploy」** で再デプロイ可能

## 4-10. トラブルシューティング（`404: NOT_FOUND`）

Vercel の画面/ブラウザで **Vercelロゴ付きの `404: NOT_FOUND`** が表示される場合、アプリ内部の 404 ではなく
「そのドメインが正しいデプロイに紐づいていない」か「デプロイ対象ディレクトリが誤っている」可能性が高いです。

### チェック項目（UI）

Vercel Dashboard → 対象プロジェクト → Settings → General:

- Framework Preset: **Next.js**
- Root Directory: **`.`**
- Build Command: `npm run build`

> 環境変数の変更は **次回デプロイから** 反映されます。設定後は Redeploy が必要です。

### チェック項目（CLI）

```bash
# ログイン済みユーザー確認
vercel whoami

# プロジェクト一覧（チーム/スコープの取り違えがないか）
vercel project ls --scope "<team slug or id>"

# リンク済み project の設定（Root Directory / Framework）を確認
vercel project inspect --scope "<team slug or id>"

# 本番デプロイ一覧（vercel ls は vercel list のエイリアス）
vercel list --prod --scope "<team slug or id>"

# ドメイン一覧
vercel domains ls --scope "<team slug or id>"
```

> 公式: project 一覧/詳細は `vercel project ls` / `vercel project inspect`。参考: https://vercel.com/docs/cli/project

### 追加の切り分け

- `*.vercel.app` でも `NOT_FOUND` の場合:
  - 「別プロジェクトを見ている」「Root Directory が違う」可能性が高い
- カスタムドメインだけ `NOT_FOUND` の場合:
  - ドメインが別プロジェクトに紐づいている/Production ではなく Preview に紐づいている可能性
