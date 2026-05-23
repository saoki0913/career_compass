# Sentry の本番設定

[← インデックス](./README.md)

---

## 1. 概要

Sentry はエラー追跡（error tracking）と外部死活監視（uptime / cron）に使う。

- **重要度**: 本番のみ導入推奨（任意）。staging は任意。DSN 未設定でもアプリは起動する。
- **未設定時の挙動**:
  - Next.js: `SENTRY_NEXTJS_DSN` / `NEXT_PUBLIC_SENTRY_DSN` 未設定なら SDK は初期化されず、エラーは送信されない（`sentry.server.config.ts` / `sentry.edge.config.ts` は DSN が無いと `Sentry.init()` を呼ばない）。
  - FastAPI: DSN 未設定なら `init_sentry()` が `False` を返し送信無効。production で DSN 未設定の場合は `RuntimeWarning`（fatal ではない、`backend/app/config.py`）。
  - source map upload: `SENTRY_AUTH_TOKEN` 未設定なら `next.config.ts` の `withSentryConfig` が自動で upload を無効化する。
- **現状の方針（Phase 0）**: Replay と performance tracing は使わず、error tracking のみ。Next.js / FastAPI とも `tracesSampleRate` は実装側で `0` 固定。設定前に `docs/operations/platform/MONITORING_SETUP.md` の送信禁止項目（PII / secrets）を確認する。
- **DSN は環境別**: production と staging で別プロジェクト・別 DSN にする。DSN は SSOT 上 `[環境別]`（後述 7 章）。

> 公式: DSN は SDK の送信先を表す識別子。参考: https://docs.sentry.io/concepts/key-terms/dsn-explainer/

変数の意味の正本は `docs/operations/platform/ENVIRONMENT_VARIABLES.md`。本書は取得手順の正本とする。

---

## 2. 前提 CLI

`sentry-cli` は project 作成・DSN 取得を除くほぼすべての操作（release 作成、source map upload、cron monitor の check-in）を CLI で行える。project 作成と DSN 取得は CLI サブコマンドが無いため Web API（curl）を第一に使う（4 章）。

### インストール

```bash
# npm（推奨。プロジェクトの devDependency としても可）
npm install --save-dev @sentry/cli
# 単発実行なら
npx @sentry/cli --version

# Homebrew（macOS）
brew install getsentry/tools/sentry-cli

# インストールスクリプト
curl -sL https://sentry.io/get-cli/ | sh
```

> 公式: sentry-cli のインストール。参考: https://docs.sentry.io/cli/installation/

### ログイン（認証）

```bash
# 対話ログイン（auth token 設定画面を開き、貼り付けて ~/.sentryclirc に保存）
sentry-cli login

# もしくは環境変数で渡す（CI 向け。Organization Auth Token を使う）
export SENTRY_AUTH_TOKEN="___ORG_AUTH_TOKEN___"

# 接続と認証情報の確認
sentry-cli info
```

- CI / sentry-cli では **Organization Auth Token** を使う。organization 配下の全 project にアクセスでき、権限が限定されている。
- token は `~/.sentryclirc` の `[auth] token=...`、環境変数 `SENTRY_AUTH_TOKEN`、または `sentry-cli login --auth-token ...` のいずれかで渡す。

> 公式: sentry-cli の認証。参考: https://docs.sentry.io/cli/configuration/
> 公式: Auth Token の種別。参考: https://docs.sentry.io/product/accounts/auth-tokens/

### よく使う環境変数

release / source map 系コマンドは以下を参照する。`SENTRY_ORG` は共通、`SENTRY_PROJECT` は frontend / backend で分ける（後述）。

```bash
export SENTRY_ORG="___ORG_SLUG___"
export SENTRY_PROJECT="___PROJECT_SLUG___"
export SENTRY_AUTH_TOKEN="___ORG_AUTH_TOKEN___"
```

---

## 3. プロジェクト構成

frontend（Next.js）と backend（FastAPI）は別 project に分け、DSN を混ぜない。環境（production / staging）も別 project にする。

| 用途 | 例: project slug | 設定先 | 主な DSN 変数 |
|---|---|---|---|
| Frontend production | `career-compass-frontend` | Vercel (production) | `SENTRY_NEXTJS_DSN` / `NEXT_PUBLIC_SENTRY_DSN` |
| Frontend staging | `career-compass-frontend-staging` | Vercel staging project (Production scope) | 同上（別 DSN） |
| Backend production | `career-compass-backend` | Railway (production) | `SENTRY_FASTAPI_DSN`（または alias） |
| Backend staging | `career-compass-backend-staging` | Railway (staging) | 同上（別 DSN） |

> project slug は例。既存の Sentry organization の命名に合わせる。SDK 側の `service` tag は frontend が `career-compass-frontend`、backend が `career-compass-backend` で固定送信される（`sentry.server.config.ts` / `backend/app/observability/sentry_setup.py`）。

---

## 4. プロジェクト作成・DSN 取得（CLI / API 優先、GUI は fallback）

`sentry-cli` には project 作成・DSN 取得のサブコマンドが無い。CLI ファーストの本書では **Sentry Web API（curl）を第一**、Dashboard を fallback とする。auth token には `project:write`（または `project:admin`）scope が必要。

### 4-1. プロジェクト作成（Web API 優先）

project は team 配下に作る。`{team_id_or_slug}` は対象 team の slug。

```bash
curl https://sentry.io/api/0/teams/${SENTRY_ORG}/___TEAM_SLUG___/projects/ \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "career-compass-frontend",
    "slug": "career-compass-frontend",
    "platform": "javascript-nextjs"
  }'
```

backend は `"platform": "python-fastapi"` で同様に作成する。201 応答にプロジェクトの `id` / `slug` などが含まれる。

> 公式: Create a New Project（`POST /api/0/teams/{org}/{team}/projects/`）。参考: https://docs.sentry.io/api/projects/create-a-new-project/

**fallback（GUI）**: Sentry Dashboard → **Projects** → **Create Project** → Platform に Next.js / FastAPI を選び、frontend / backend・環境ごとに作成する。
> 公式: Create a Sentry Project。参考: https://docs.sentry.io/product/sentry-basics/integrate-frontend/create-new-project/

### 4-2. DSN 取得（Web API 優先）

project 作成時に DSN（client key）が 1 つ自動発行される。既存 key の DSN は keys 一覧 API で取得できる。`dsn.public` が SDK に渡す DSN。

```bash
# 既存 client key と DSN を一覧
curl https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/keys/ \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}"

# 必要なら新しい client key を作成（応答の dsn.public が DSN）
curl https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/keys/ \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"name": "career-compass-frontend-dsn"}'
```

応答 JSON の `dsn.public`（`https://<public_key>@o<org>.ingest.sentry.io/<project_id>` 形式）を控える。

> 公式: List a Project's Client Keys。参考: https://docs.sentry.io/api/projects/list-a-projects-client-keys/
> 公式: Create a New Client Key（応答に `dsn.public` を含む）。参考: https://docs.sentry.io/api/projects/create-a-new-client-key/

**fallback（GUI）**: Dashboard → **Settings** → 対象 Project → **Client Keys (DSN)** で DSN をコピーする。

### 4-3. 取得した DSN の設定先

| キー | 環境変数名 | 設定先 | 備考 |
|---|---|---|---|
| Frontend DSN | `NEXT_PUBLIC_SENTRY_DSN` | Vercel | browser SDK |
| Frontend DSN | `SENTRY_NEXTJS_DSN` | Vercel | server / edge SDK。未設定時のみ legacy `SENTRY_DSN` を fallback |
| Backend DSN | `SENTRY_FASTAPI_DSN` | Railway | FastAPI SDK。frontend project の DSN と混ぜない |
| Backend DSN | `BACKEND_SENTRY_DSN` | Railway | FastAPI SDK の互換 alias |
| Backend DSN | `SENTRY_DSN` | Railway | legacy fallback。新規設定では使わない |

> backend DSN は `SENTRY_FASTAPI_DSN` → `BACKEND_SENTRY_DSN` → `SENTRY_DSN` の順で解決する（`backend/app/observability/sentry_setup.py`）。**3 つの alias のうち 1 つだけ**設定すればよい。新規は `SENTRY_FASTAPI_DSN` を使う。

Vercel / Railway への env 反映は `docs/release/VERCEL.md` / `docs/release/RAILWAY.md` の手順に従う。CLI 反映の例:

```bash
# Vercel（staging / production は別 project。どちらも Production scope に環境別 DSN を投入）
vercel env add SENTRY_NEXTJS_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production

# Railway（対象 service / environment を選択。秘匿値は stdin で渡す。詳細は RAILWAY.md）
printf '%s' "___BACKEND_DSN___" | railway variable set SENTRY_FASTAPI_DSN --stdin
```

---

## 5. キーの制限・セキュリティ

- **DSN は公開前提だが project 単位で分離する**。frontend / backend、production / staging を別 project の DSN にし、混在させない。
- **Auth Token は最小権限**。sentry-cli / CI には Organization Auth Token を使い、必要 scope（source map: `project:releases` 相当、project 作成: `project:write`）に絞る。個人の長期 user token を CI に置かない。
- **PII / secrets を送らない**。送信前に scrubbing を通している（Next.js: `src/lib/sentry-sanitize.ts` の `scrubSentryEvent`、FastAPI: `backend/app/observability/sentry_setup.py` が request の `headers` / `cookies` / `data` / `query_string` を drop、URL の query / fragment を除去）。`sendDefaultPii` は両者 `false`。送信禁止項目は `docs/operations/platform/MONITORING_SETUP.md` を確認する。
- `SENTRY_AUTH_TOKEN` は `[環境別]`・原則別値（漏洩時の影響範囲・権限分離のため）。`SENTRY_ORG` は `[共通可]`。

> 公式: Auth Token の権限。参考: https://docs.sentry.io/product/accounts/auth-tokens/

---

## 6. release / source map（CLI 優先）

### 6-1. 自動 source map upload（既定）

Next.js のビルドは `next.config.ts` の `withSentryConfig` が source map の inject / upload を自動で行う。`SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` が揃っていれば build 時に upload され、`SENTRY_AUTH_TOKEN` 未設定なら upload は自動で無効化される（`sourcemaps.disable`）。通常はこの自動経路で十分で、追加の手動コマンドは不要。

| 変数 | 用途 | 設定先 |
|---|---|---|
| `SENTRY_ORG` | source map upload / release 対象 organization | Vercel |
| `SENTRY_PROJECT` | source map upload / release 対象 project | Vercel |
| `SENTRY_AUTH_TOKEN` | source map upload の認証 | Vercel |

### 6-2. 手動 release / source map（CLI、必要時）

CI で明示的に release を切る、または FastAPI 側など withSentryConfig 外で source map を扱う場合は sentry-cli を使う。`SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` を事前に export しておく。

```bash
# release 名を git から提案させる（SDK の release と一致させる）
VERSION=$(sentry-cli releases propose-version)

# release 作成 → commit 紐付け → finalize
sentry-cli releases new "$VERSION"
sentry-cli releases set-commits "$VERSION" --auto
sentry-cli releases finalize "$VERSION"

# deploy 通知（環境を指定）
sentry-cli deploys new --release "$VERSION" -e production
```

source map を手動 upload する場合（ビルド成果物ディレクトリを指定）:

```bash
# debug ID を成果物に注入してから upload する
sentry-cli sourcemaps inject ./.next
sentry-cli sourcemaps upload --release="$VERSION" ./.next
```

- SDK 側の release 名は upload 時の `--release` と一致させる必要がある。
- 本アプリの SDK は `SENTRY_RELEASE` 未設定時、Next.js は `VERCEL_GIT_COMMIT_SHA`、FastAPI は `RAILWAY_GIT_COMMIT_SHA` を release として使う（`sentry.server.config.ts` / `backend/app/config.py`）。手動で `sentry-cli releases new` する場合は同じ値（`propose-version` は git commit から導出）を使う。

> 公式: Release Management（`releases new` / `set-commits --auto` / `finalize` / `deploys new`）。参考: https://docs.sentry.io/cli/releases/
> 公式: source map の CLI upload（`sourcemaps inject` / `sourcemaps upload --release`）。参考: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/

---

## 7. 環境変数マッピング表

| 変数名 | 設定先 | 重要度 | 環境区分 | 用途 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | 任意 | 環境別 | browser SDK の DSN |
| `SENTRY_NEXTJS_DSN` | Vercel | 任意 | 環境別 | Next.js server / edge SDK の DSN |
| `SENTRY_FASTAPI_DSN` | Railway | 任意 | 環境別 | FastAPI SDK の DSN（推奨 alias） |
| `BACKEND_SENTRY_DSN` | Railway | 任意 | 環境別 | FastAPI DSN の互換 alias（いずれか 1 つ） |
| `SENTRY_DSN` | Vercel / Railway | 任意 | 環境別 | legacy fallback DSN（新規では使わない） |
| `SENTRY_ORG` | Vercel | 任意 | 共通可 | source map / release 対象 organization |
| `SENTRY_PROJECT` | Vercel | 任意 | 環境別 | source map / release 対象 project |
| `SENTRY_AUTH_TOKEN` | Vercel / CI | 任意 | 環境別 | source map upload・API 操作の認証 |
| `SENTRY_ENVIRONMENT` | Vercel / Railway | 任意 | 環境別 | `production` / `staging`。未設定時 FastAPI は `APP_ENV` を使う |
| `SENTRY_RELEASE` | Vercel / Railway | 任意 | 環境別 | release id。未設定時は commit SHA を使う |
| `SENTRY_TRACES_SAMPLE_RATE` | Railway | 任意 | 環境別 | FastAPI tracing のサンプリング率（下記注意） |

> **`SENTRY_TRACES_SAMPLE_RATE` の現状**: `backend/app/config.py` は既定 `0.05` で読み込むが、`init_sentry()` は Phase 0 方針で `traces_sample_rate=0.0` を固定で渡しており、現時点ではこの変数を `sentry_sdk.init` に反映していない。tracing を有効化するまで実効値は 0 で、設定しても挙動は変わらない。

---

## 8. ローカル値の流用可否

- **`SENTRY_ORG`**: `[共通可]`。organization slug は環境分離の境界ではないため、`.env.local` の値を staging / production にそのまま使ってよい（`docs/operations/platform/ENVIRONMENT_VARIABLES.md` の「同値でもよい」分類）。
- **DSN 各種（`SENTRY_NEXTJS_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_FASTAPI_DSN` / `BACKEND_SENTRY_DSN` / `SENTRY_DSN`）**: `[環境別]`。production と staging を別 project にし、4 章の手順で**環境ごとに DSN を取得**する。流用しない（エラーが環境を跨いで混在するため）。
- **`SENTRY_PROJECT`**: `[環境別]`。frontend / backend・環境ごとに別 project slug。
- **`SENTRY_AUTH_TOKEN`**: `[環境別]`・原則別値。漏洩時の影響範囲・権限・監査を分けるため、production は専用 token にする。
- **`SENTRY_ENVIRONMENT` / `SENTRY_RELEASE`**: `[環境別]`。環境名・release id は環境ごとに異なる。

---

## 9. 外部死活監視（uptime / cron）

本番リリース前の外部死活監視は Sentry を正とする。

### 9-1. Cron monitor（CLI 優先）

定期ジョブ（バッチ通知、daily summary、calendar-sync など `src/app/api/cron/*`）の監視は `sentry-cli monitors run` で check-in できる。monitor の作成・更新も同コマンドが行うため、先に Dashboard で monitor を作る必要はない。check-in の認可には **project DSN（`SENTRY_DSN`）** を使う（auth token ではない）。

```bash
# project DSN を check-in 用に渡す（対象 project の DSN）
export SENTRY_DSN="___MONITOR_PROJECT_DSN___"

# 監視対象コマンドをラップして実行（成功/失敗/タイムアウトを自動 check-in）
# JST 基準・毎時 0 分・許容遅延 10 分・最大実行 5 分の例
sentry-cli monitors run career-compass-daily-notifications \
  -s "0 * * * *" \
  --check-in-margin 10 \
  --max-runtime 5 \
  --timezone "Asia/Tokyo" \
  -- <監視したいコマンド>
```

- `-s` / `--schedule` は crontab 形式（要クォート）。締切・通知系の基準時刻は `Asia/Tokyo` に合わせる（プロジェクトのビジネスルール）。
- 複数環境を分ける場合は `-e <env>`（例 `-e production`）を付ける。

> 公式: Crons (CLI)（`monitors run`、check-in は project DSN で認可）。参考: https://docs.sentry.io/cli/crons/
> 公式: Cron Monitoring 全般。参考: https://docs.sentry.io/product/crons/

### 9-2. Uptime monitor（GUI）

HTTP uptime monitor は Sentry に CLI / 公開 API の作成手段が無いため、Dashboard で作成する。Dashboard → **Alerts** → **Create Alert** → **Uptime Monitor** で対象 URL・method・チェック間隔・タイムアウトを設定し、email alert を有効にする。必須 3 monitors:

| # | Monitor | URL | Type |
|---:|---|---|---|
| 1 | 本番 Frontend | `https://www.shupass.jp` | Uptime / HTTP 200 |
| 2 | 本番 Backend Health | `https://api.shupass.jp/health` | Uptime / HTTP 200 |
| 3 | 本番 Backend Ready | `https://api.shupass.jp/health/ready` | Uptime / HTTP 200 |

Sentry 側で body / header assertion を設定できる場合は、backend health に `X-Request-Id`、ready に `ready` 相当の body を追加確認する。staging、apex redirect（2026-05-09 実測: 307）、robots.txt、sitemap.xml は release blocker ではなく任意監視とする。

`*.railway.app` は Sentry Uptime の domain-wide limit に達しており、Railway 生成ドメインでは backend monitor を作成できない。backend uptime は最後に回し、Railway production backend に `api.shupass.jp` などの独自ドメインを設定してから作成する。

UptimeRobot を併用する場合は任意の冗長監視として扱う。最小構成は本番 Frontend と production backend health の 2 monitors で十分であり、網羅的な monitor 登録は本番リリース条件にしない。

> 公式: Uptime Monitoring の設定。参考: https://docs.sentry.io/product/alerts/create-alerts/uptime-alert-config/

---

## 10. 動作確認

```bash
# CLI 接続・認証の確認
sentry-cli info

# DSN が引けるか（client key 一覧）
curl https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/keys/ \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}"
```

- 反映確認: production デプロイ後、Vercel / Railway の env に DSN が入っていること、Sentry Dashboard の対象 project に最初の event（テスト送信や初回エラー）が届くことを確認する。
- FastAPI は production で DSN 未設定だと起動ログに `RuntimeWarning`（エラー監視無効）が出る。これを目印に設定漏れを検知できる。
