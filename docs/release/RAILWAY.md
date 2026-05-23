# Step 3: Railway にバックエンドをデプロイ

[← インデックス](./README.md)

---

> いまの標準運用では、Railway の env は `scripts/release/sync-career-compass-secrets.sh`（入口は `make ops-secrets-sync`）で同期し、値の正本は repo local の `.secrets/` です。人間向けの一覧は [`docs/operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) を参照してください。
>
> 本ファイルは **CLI 優先・GUI は fallback** で書いています。各操作は `railway` CLI（推奨）を先に、Railway Dashboard（fallback）を後に示します。CLI が無い操作（アカウント作成など）のみ GUI を正とします。

## 概要

| 項目 | 内容 |
|---|---|
| 用途 | FastAPI バックエンド（ES 添削・志望動機・ガクチカの SSE、企業情報検索 / RAG）のホスティング |
| 必須/任意 | 必須（バックエンドの本番・staging 稼働に必要） |
| 環境構成 | **staging と production は別 Railway project**（[ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) の topology を正本にする） |
| 未設定時の挙動 | バックエンドが起動せず、ES 添削・企業情報取得など FastAPI 経由の機能がすべて失敗する |
| ストレージ | ChromaDB と BM25 index は Railway **Volume**（`/app/data`）に永続化する。Volume が無いとデプロイ毎にデータ消失 |

> production / staging backend はどちらも repo 直下の `railway.toml` + `Dockerfile.railway-backend` を正本として使います。`backend/railway.toml` は削除済みで、Railway service の `Root Directory` は空欄に揃えます。

## 3-0. 前提 CLI（アカウント作成 & ログイン）

### アカウント作成（GUI のみ・初回 1 回）

CLI ではアカウント自体を作成できないため、初回だけ GUI で作成します。

1. https://railway.com/ にアクセス
2. **Start a New Project** → **GitHub で登録**（推奨）
3. GitHub アカウントと連携を許可

> GitHub 連携すると、リポジトリからの自動デプロイが可能になります。
> 公式: https://railway.com/

### CLI インストール & ログイン（推奨）

以降の操作はこの CLI を前提にします。

```bash
# グローバルインストール（任意のディレクトリで実行可能）
npm install -g @railway/cli

# ログイン（ブラウザが開きます）
railway login

# ブラウザを開けない環境（CI / リモート）では browserless ログイン
railway login --browserless

# 確認
railway whoami

# CLI のアップグレード
railway upgrade
```

> 公式: CLI の概要・サブコマンド一覧。https://docs.railway.com/cli
> 公式: ログイン（`railway login` / `--browserless`）。https://docs.railway.com/cli

### project / service / environment にリンク

`railway link` でローカル作業ディレクトリを Railway の project・environment・service に紐づけます。リンク情報は `.railway` ディレクトリに保存されます。**staging と production は別 project** なので、対象を切り替えるときは再 link します。

```bash
# 対話的にリンク（workspace → project → environment → service を選択）
railway link

# 非対話（CI / スクリプト）: project / environment / service を明示
railway link --project "<RAILWAY_PROJECT_ID>" --environment "<RAILWAY_ENVIRONMENT_NAME>" --service "<RAILWAY_SERVICE_NAME>"

# 現在のリンク状態を確認
railway status
railway status --json   # スクリプト用
```

| flag | 説明 |
|---|---|
| `-p, --project <ID\|NAME>` | リンクする project |
| `-e, --environment <ID\|NAME>` | リンクする environment |
| `-s, --service <ID\|NAME>` | リンクする service |
| `-w, --workspace <ID\|NAME>` | リンクする workspace |

> `RAILWAY_PROJECT_ID`（環境別・流用不可）／`RAILWAY_SERVICE_NAME`／`RAILWAY_ENVIRONMENT_NAME` の正本値は repo local の `.secrets/{staging,production}/railway-*.env` にあります。`RAILWAY_ENVIRONMENT_NAME` は別 project 構成のため staging / production とも `production` でよい同期メタキーで、アプリの環境分岐には使いません（分岐は `APP_ENV` のみ）。詳細は [ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md)。
> 公式: `railway link`（`--project` / `--environment` / `--service`）。https://docs.railway.com/cli/link
> 公式: グローバルオプション（`-s/--service`, `-e/--environment`, `--json`, `-y/--yes`）。https://docs.railway.com/cli/global-options

> **このリポジトリでのガードレール**: `railway` CLI の直接操作は `whoami` / `status` / `variables`（read-only）に限定します。env の変更系は必ず repo script（`make ops-secrets-sync`）を経由してください（後述 3-4）。`railway run` は local 開発で必要なときのみ使います。

## 3-1. プロジェクト & サービス作成

### GUI から作成（fallback・初回セットアップ）

GitHub 連携からの初回 service 作成は Dashboard が分かりやすいため、ここは GUI を fallback として残します。

1. https://railway.com/dashboard にログイン
2. 右上の **「New Project」** ボタンをクリック
3. **「Deploy from GitHub repo」** を選択
4. GitHub 連携がまだの場合は GitHub アカウントとの連携を許可
5. リポジトリ検索欄で `career_compass` と入力 → `saoki0913/career_compass` をクリック
6. 2 つの選択肢が表示される:
   - **「Add Variables」** → 先に環境変数を設定してからデプロイ（推奨）
   - **「Deploy Now」** → 即座にデプロイ開始（変数は後から設定可能）
7. 初回デプロイは設定が未完了のため失敗しても問題ない

> デプロイ後、**Project Canvas**（プロジェクトの全体管理画面）に遷移します。
> 公式: GitHub repo からのデプロイ。https://docs.railway.com/

### CLI から service を作成 / 接続（推奨・以降の運用）

project 作成後、空の service の追加・選択は CLI でできます。

```bash
# 既存 project にリンク済みの状態で、新しい service を追加
railway add

# 操作対象 service を選択（リンク中の project 内の service を切り替え）
railway service
```

> 公式: `railway add`（service 追加）/ `railway service`（service の選択）。https://docs.railway.com/cli

### サービスの Source 設定（GUI）

Source（接続リポジトリ・ブランチ・Root Directory）の指定は Dashboard で行います。

1. Project Canvas 上でサービスのカードをクリック
2. 右パネルが開く → **「Settings」** タブをクリック
3. **Source** セクションを見つける

| 設定項目 | 値 | 説明 |
|---|---|---|
| Repository | `saoki0913/career_compass` | GitHub リポジトリ（自動設定済み） |
| Branch | `main` | 本番デプロイ対象ブランチ |
| Root Directory | 空欄 | root `railway.toml` + `Dockerfile.railway-backend` を正本として使う |

> production / staging backend は repo 直下の `railway.toml` + `Dockerfile.railway-backend` を正本として使います。`backend/railway.toml` は削除済みで、Railway service の `Root Directory` は空欄に揃えます。

### Build 設定（GUI）

1. 同じ **「Settings」** タブ内の **Build** セクションを見つける

| 設定項目 | 値 | 説明 |
|---|---|---|
| Builder | **Dockerfile** | root `railway.toml` を利用 |
| Dockerfile Path | `Dockerfile.railway-backend` | backend runtime 用 Dockerfile |
| Watch Paths | `/backend/**` | バックエンドの変更のみでデプロイトリガー |

> Watch Paths を設定すると、フロントエンドだけの変更時にバックエンドが無駄に再デプロイされるのを防げます。

> **メモリ要件**: Cross-encoder モデル (`japanese-reranker-small-v2`, ~70M params) + ChromaDB + FastAPI で約 800MB〜1.2GB 使用。Railway はデフォルトで 8GB RAM まで利用可能（従量課金）。

> Source / Build は repo 直下の `railway.toml`（`build.dockerfilePath`）が正本です。Watch Paths のように `railway.toml` に無い項目のみ Dashboard で設定します。

## 3-2. Networking 設定（公開ドメイン）

デフォルトではサービスは外部からアクセスできません。公開ドメインを生成する必要があります。

### CLI で生成（推奨）

```bash
# 対象 service にリンクした状態で、Railway 生成ドメインを発行
railway domain

# カスタムドメインを追加（staging backend 用）
railway domain stg-api.shupass.jp --service "<RAILWAY_SERVICE_NAME>"

# 待受ポートを明示する場合
railway domain stg-api.shupass.jp --port 8080
```

| flag | 説明 |
|---|---|
| `-s, --service <SERVICE>` | ドメインを割り当てる service |
| `-p, --port <PORT>` | ドメインが接続するポート |

カスタムドメインを追加すると、CLI が **CNAME レコード**（トラフィック転送用）と **TXT レコード**（所有権確認用）を表示します。両方を DNS プロバイダ（Cloudflare）にそのまま登録してください。SSL 証明書は検証後に自動発行・自動更新されます（設定不要）。1 service につき Railway 生成ドメインは 1 つ、カスタムドメインは複数登録できます。

> 公式: `railway domain`（生成 / カスタム / `--service` / `--port`）。https://docs.railway.com/cli/domain
> 公式: カスタムドメインと DNS（CNAME / TXT）。https://docs.railway.com/networking/domains/working-with-domains

### GUI で生成（fallback）

1. サービスの **「Settings」** タブ → **「Networking」** セクションを見つける
2. **Public Networking** セクション内の **「Generate Domain」** ボタンをクリック
3. 自動生成されるドメイン（例: `shupass-backend-production.up.railway.app`）を確認
4. このドメインをコピー → Vercel の `FASTAPI_URL` に設定する（[Step 4-4 参照](./VERCEL.md#4-4-環境変数を設定)）
5. SSL 証明書は自動で発行・更新される（設定不要）

> カスタムドメインを使う場合は **Custom Domain** から設定可能（DNS の CNAME / TXT レコード設定が必要）。
> staging 用には別 Railway service / project を用意し、repo root build + `https://stg-api.shupass.jp` を `develop` に固定してください。任意の preview domain は正式運用対象にしません。

> production backend の公開ドメインは `shupass-backend-production.up.railway.app`（Makefile `BACKEND_URL` と一致）。staging backend は custom domain `stg-api.shupass.jp` を正式運用対象にします。

### staging backend の推奨設定

| 設定項目 | 値 |
|---|---|
| Repository | `saoki0913/career_compass` |
| Branch | `develop` |
| Root Directory | 空欄 |
| Dockerfile Path | `Dockerfile.railway-backend` |
| Healthcheck | `/health` |
| Custom Domain | `stg-api.shupass.jp` |

### Private Networking

同じ Railway プロジェクト内のサービス間通信に使用。今回は Vercel（外部）からのアクセスなので **Public Networking のみ必要**。

## 3-3. Volume を設定（永続ストレージ）

ChromaDB と BM25 インデックスはファイルに保存されるため、永続 Volume が必要です。
Volume がないとデプロイごとにデータが消失します。

### CLI で作成（推奨）

```bash
# 対象 service にリンクした状態で Volume を追加（mount path は / で始める）
railway volume add --mount-path /app/data

# Volume 一覧の確認
railway volume list

# 既存 Volume を service に接続 / 切り離し
railway volume attach --volume career-compass-data --service "<RAILWAY_SERVICE_NAME>"
railway volume detach --volume career-compass-data --service "<RAILWAY_SERVICE_NAME>"
```

| flag | 説明 |
|---|---|
| `-m, --mount-path <PATH>` | マウントパス（`/` で始める） |
| `-s, --service <SERVICE>` | 接続先 service |
| `-v, --volume <VOLUME>` | 対象 Volume（attach / detach / delete / update で使用） |

> Mount Path は `/app/data` にします。Railway のビルドはアプリを `/app` 配下に置くため、相対パス `./data` に書き込むアプリは `/app/data` にマウントします。
> 公式: `railway volume`（`add` / `list` / `attach` / `--mount-path`）。https://docs.railway.com/cli/volume
> 公式: Volume の使い方とマウントパス。https://docs.railway.com/volumes

### GUI で作成（fallback・2 通り）

**方法 1: Project Canvas で右クリック**
1. Project Canvas の空白部分を **右クリック**
2. コンテキストメニューから **Volume** の作成オプションを選択

**方法 2: Command Palette**
1. `⌘K`（Mac）/ `Ctrl+K`（Windows）で Command Palette を開く
2. 「volume」と入力して Volume 作成を選択

### Volume の設定

1. 接続先サービスを選択するプロンプトが表示 → バックエンドサービスを選択
2. 以下を設定:

| 設定 | 値 | 説明 |
|---|---|---|
| Name | `career-compass-data` | 任意の名前 |
| Mount Path | `/app/data` | Dockerfile の WORKDIR `/app` + `data/` |

> **重要**: Volume はランタイム時にマウントされます（ビルド時ではない）。ビルドフェーズ中に書き込んだデータは Volume には保存されません。
>
> `backend/docker-entrypoint.sh` が `/app/data/chroma` と `/app/data/bm25` サブディレクトリを自動作成し、パーミッションを設定します。
>
> **初回起動時**: Volume は空の状態。企業情報の新規URL取得ではデータが蓄積されます。同じURLの再取得時は、そのURLに紐づく既存RAGだけを更新します。
>
> Railway は `RAILWAY_VOLUME_NAME` と `RAILWAY_VOLUME_MOUNT_PATH` 環境変数を自動で注入します（手動設定不要）。

## 3-4. 環境変数を設定

### 標準運用: repo script で同期（推奨）

Railway に設定する変数の意味・必須性・環境差は、この文書では管理しません。正本は [operations/platform/ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) と repo local の `.secrets/` bundle です。

設定・差分確認は repo script を使います。スクリプト内部では `railway link` → `railway variables`（差分検出）/ `railway variable set --stdin --skip-deploys`（反映）を呼び出すため、**手動で個別の `railway variable set` を打つ運用はしません**。

```bash
# 差分確認（read-only。エージェント・通常運用はこれを優先）
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-staging
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-production

# 反映（apply）
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-staging
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-production

# Makefile 入口（インベントリ / drift 確認）
make ops-secrets-sync                                  # 既定は --check --target all
SYNC_MODE=--apply TARGET=railway-production make ops-secrets-sync
```

この setup 文書は Railway の操作場所と CLI コマンドだけを扱います。変数カタログをここに複製しないでください。

> backend に設定する主な FastAPI 側 env（正本は `.secrets/{staging,production}/fastapi.env`）: `APP_ENV`、`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`（`[共通可]`・`.env.local` の値を staging/production に流用してよい）、`REDIS_URL`（`[環境別]`・namespace 検査あり）、`CORS_ORIGINS`（`[環境別]`・localhost / `*` 不可）、`BACKEND_TRUSTED_HOSTS`（`[環境別]`・本番 host を含める）、`FRONTEND_URL`（alias `NEXT_PUBLIC_APP_URL`）、`INTERNAL_API_JWT_SECRET` / `CAREER_PRINCIPAL_HMAC_SECRET` / `TENANT_KEY_SECRET`（`[環境別]`・openssl 生成の内部鍵）。`RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_NAME` / `RAILWAY_ENVIRONMENT_NAME` は sync メタキー。各値の `[必須/推奨/任意]`・`[環境別/共通可]` は [ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) を正本にする。
>
> **`BACKEND_TRUSTED_HOSTS` 注意**: 未設定だと `/health` は通っても通常 API が host check で落ちます。production は `["shupass-backend-production.up.railway.app"]`、staging は `["stg-api.shupass.jp"]` を含めます。

### 手動 CLI（個別確認・障害対応）

read-only の確認は CLI で直接できます。**反映系（`set` / `delete`）は通常運用では repo script に任せます**（障害対応で手動投入する場合のみ使用）。

```bash
# 変数一覧（read-only）。リンク中の service / environment が対象
railway variables
railway variable list --kv          # KEY=VALUE 形式
railway variable list --json        # スクリプト用

# 別 service / environment を明示
railway variable list --service "<RAILWAY_SERVICE_NAME>" --environment "<RAILWAY_ENVIRONMENT_NAME>"

# （障害対応のみ）個別 set。--skip-deploys で即時 redeploy を抑止
railway variable set CORS_ORIGINS='["https://stg.shupass.jp"]' --skip-deploys
echo "<secret-value>" | railway variable set INTERNAL_API_JWT_SECRET --stdin --skip-deploys

# 複数同時 set も可
railway variable set KEY1=value1 KEY2=value2 --skip-deploys
```

| flag | 説明 |
|---|---|
| `-k, --kv` | `list` を `KEY=VALUE` 形式で表示 |
| `--stdin` | 標準入力から値を読む（secret をシェル履歴に残さない） |
| `--skip-deploys` | 変数変更時の自動 redeploy を抑止 |
| `-s, --service` / `-e, --environment` | 対象 service / environment |

> **重要**: `--skip-deploys` を付けない、または Dashboard で変数を変更した場合でも、既に動いているデプロイには即反映されません。反映には redeploy / restart が必要です（3-5・3-7 参照）。
> 公式: `railway variable`（`list` / `set` / `delete`, `--kv` / `--stdin` / `--skip-deploys`）。https://docs.railway.com/cli/variable
> 公式: Using Variables。https://docs.railway.com/variables

### GUI で設定（fallback）

1. Project Canvas 上でサービスのカードをクリック
2. 右パネルの **「Variables」** タブをクリック

**方法 1: 個別追加**
- **「New Variable」** ボタンをクリック → キーと値を入力

**方法 2: RAW Editor で一括ペースト**
- **「RAW Editor」** ボタンをクリック（Variables タブ内右上付近）
- `.env` 形式（`KEY=VALUE`、1 行 1 変数）でまとめてペースト → **「Update Variables」** で保存

**方法 3: 自動サジェスト**
- Railway が GitHub リポジトリ内の `.env` / `.env.example` ファイルを検出した場合、サジェストが表示される → ワンクリックでインポート可能

> **重要**: 変数の変更は、既に動いているデプロイには即反映されません。保存後は `Deployments` から **Redeploy** するか、サービスを再起動してください。

> ES添削パネルの標準モデルは UI の `モデル選択` dropdown から `Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro Preview / クレジット消費を抑えて添削` を切り替えられる。

### 設定不要な変数

| 変数 | 理由 |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | DB アクセスはフロントエンド (Drizzle ORM) が担当 |
| `NEXT_PUBLIC_APP_URL` | フロントエンド専用の環境変数 |
| `BETTER_AUTH_*` | 認証はフロントエンド側のみ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth はフロントエンド側のみ |
| `ENCRYPTION_KEY` | 暗号化はフロントエンド側のみ |
| `STRIPE_*` | 決済はフロントエンド (Vercel) 側のみ |
| `CLOUDFLARE_*` / `R2_*` | オブジェクトストレージはフロントエンド側のみ |
| `UPSTASH_REDIS_*` | レート制限はフロントエンド側のみ |
| `CRON_SECRET` | Vercel Cron 用の認証トークン |

> **Tip**: Railway の Variables 画面では **Shared Variables**（プロジェクト全体で共有）と **Service Variables**（サービス固有）を分けて管理できます。API キーは Service Variables に設定してください。

## 3-5. Deploy 設定

Healthcheck / Restart Policy などは repo 直下の `railway.toml`（`[deploy]`）が正本です。CLI から内容を直接編集するコマンドは無いため、変更は **`railway.toml` を編集 → push** が基本で、一時的な上書きのみ Dashboard で行います。

サービスの **「Settings」** タブ → **Deploy** セクション（fallback の上書き先）

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Healthcheck Path | `/health` | `railway.toml` で設定済み |
| Healthcheck Timeout | `120` (秒) | root `railway.toml` で設定済み |
| Restart Policy | `On Failure` | クラッシュ時のみ再起動 |
| Max Retries | `3` | 3回失敗で停止 |
| Railway Config File | `railway.toml` | Root Directory からの相対パス |

> repo root の `railway.toml` が正本です。変更したい場合は root `railway.toml` を編集するか、Dashboard から上書きできます。

## 3-6. リソース制限（任意）

リソース上限の CLI 設定コマンドは公開されていないため、ここは Dashboard が正です。

サービスの **「Settings」** タブ → **Resource Limits** セクション

デフォルトでは制限なし（8 vCPU / 8GB RAM まで利用可能）。コスト管理のため上限を設定することを推奨。

| リソース | 推奨上限 | 説明 |
|---|---|---|
| vCPU | `2` | 通常利用なら十分 |
| Memory | `2 GB` | Cross-encoder + ChromaDB で ~1.2GB |

> 月額コストの上限は Railway Dashboard → **Settings** → **Usage** → **Spending Limit** で設定できます。

## 3-7. デプロイ実行 & 確認

### 自動デプロイ（標準経路）

GitHub 連携済みの場合、production service は `main` の更新で自動デプロイが開始されます。staging service は `develop` を接続し、`stg-api.shupass.jp` で確認します。

通常リリースの正本は `make deploy` と `scripts/release/release-career-compass.sh` です。標準運用は `develop` push → staging 確認 → GitHub で `develop → main` merge → auto deploy です。**`railway up` は通常リリースでは使いません**。

### CLI で状況確認 / 再デプロイ（推奨・運用）

```bash
# デプロイ状況・project 情報
railway status

# 最新デプロイを再実行（コードの再アップロードなし。変数変更の反映に使う）
railway redeploy
railway redeploy --service "<RAILWAY_SERVICE_NAME>" --yes

# 再ビルドせずに再起動（既存イメージを再利用。health になるまで待機）
railway restart
```

> 公式: `railway redeploy`（`--service` / `--yes`）。https://docs.railway.com/cli/redeploy
> 公式: `railway restart`（再ビルドなしの再起動）。https://docs.railway.com/cli/restart

### CLI でデプロイ（障害対応・手動確認用）

```bash
# リンク中の service / environment にカレントディレクトリをアップロードしてデプロイ
railway up

# 対象を明示（別 project 構成では --environment が必須）
railway up --service "<RAILWAY_SERVICE_NAME>" --environment "<RAILWAY_ENVIRONMENT_NAME>"
railway up --project "<RAILWAY_PROJECT_ID>" --environment "<RAILWAY_ENVIRONMENT_NAME>"

# ログをストリームせず即時に戻る / CI 向けにビルドログのみ
railway up --detach
railway up --ci
```

| flag | 説明 |
|---|---|
| `-d, --detach` | ログ stream に接続しない |
| `-c, --ci` | ビルドログのみ stream して終了（CI モード） |
| `-s, --service` / `-e, --environment` / `-p, --project` | デプロイ対象 |

> `--project` を使う場合は `--environment` が必須です。
> 通常のリリース経路では `railway up` を使いません。障害対応・手動確認時のみ使用します。
> 公式: `railway up`（`--detach` / `--ci` / `--service` / `--environment` / `--project`）。https://docs.railway.com/cli/up
> 公式: Deploying with the CLI。https://docs.railway.com/cli/deploying

### GUI で確認（fallback）

Project Canvas 上でサービスをクリック → 右パネルの **「Deployments」** タブでデプロイ状況を確認。

### デプロイログの確認

CLI（推奨）:

```bash
# 直近ログ（stream）
railway logs

# ビルドログ / 行数指定 / 期間・フィルタ
railway logs --build
railway logs --lines 200
railway logs --since 1h
railway logs --lines 100 --filter "@level:error"

# 別 service / environment を明示
railway logs --service "<RAILWAY_SERVICE_NAME>" --environment "<RAILWAY_ENVIRONMENT_NAME>"
```

| flag | 説明 |
|---|---|
| `-b, --build` | ビルドログを表示 |
| `-d, --deployment` | デプロイログを表示 |
| `-n, --lines <N>` | 取得行数（指定すると stream を無効化） |
| `-s, --service` / `-e, --environment` | 対象 service / environment |

> `--tail` flag はありません。行数指定は `--lines`（`-n`）を使います。
> 公式: `railway logs`（`--build` / `--lines` / `--since` / `--filter`）。https://docs.railway.com/cli/logs

GUI（fallback）:

サービスの **「Deployments」** タブ → 対象デプロイをクリック → **Build Logs** / **Deploy Logs**

### ヘルスチェック

デプロイ完了後、公開ドメインにアクセス:

```bash
curl https://shupass-backend-production.up.railway.app/
# => {"message": "就活Pass API", "version": "0.1.0"}

curl https://shupass-backend-production.up.railway.app/health
# => {"status": "healthy"}

# 追加の health 系エンドポイント
curl https://shupass-backend-production.up.railway.app/health/ready
curl https://shupass-backend-production.up.railway.app/health/version

# staging backend
curl https://stg-api.shupass.jp/health
```

> デプロイ直後は Cross-encoder モデルのダウンロード（初回のみ、~200MB）に数分かかる場合があります。ヘルスチェックが通るまで待ってください。
> ローカルから全環境の health をまとめて確認する場合は `zsh scripts/release/verify-health.sh` を使います。

## 3-8. トラブルシューティング

| 症状 | 原因 | 対処（CLI 優先） |
|---|---|---|
| ビルド失敗 | Root Directory / Dockerfile 設定不一致 | `railway logs --build` で原因確認。Settings → Source → Root Directory を空欄、Dockerfile Path を `Dockerfile.railway-backend` に |
| 起動後すぐクラッシュ | メモリ不足 | `railway logs` で OOM 確認。Resource Limits で Memory を 2GB 以上に |
| ヘルスチェック失敗 | ポート不一致 | アプリが `$PORT` で待受できているか確認。`railway variable list` で `PORT` を手動上書きしていないか確認（していれば削除して Railway 自動注入を優先） |
| Volume データ消失 | Volume 未マウント | `railway volume list` で `/app/data` にマウントされているか確認 |
| CORS エラー | `CORS_ORIGINS` 未設定 | repo script で同期（`...sync-career-compass-secrets.sh --apply --target railway-production`）。production は `["https://www.shupass.jp","https://shupass.jp"]`、staging は `["https://stg.shupass.jp"]` |
| 通常 API が host check で落ちる | `BACKEND_TRUSTED_HOSTS` 未設定 | `.secrets/{staging,production}/fastapi.env` を更新し repo script で同期。`/health` だけ通る場合はこれを疑う |
| 外部からアクセス不可 | Public Domain 未生成 | `railway domain`（または Settings → Networking → Generate Domain） |
| 変数を変えたのに反映されない | 自動 redeploy 抑止 / 古いデプロイ | `railway redeploy` または `railway restart` |

CLI でまとめて確認する場合の例:

```bash
railway whoami
railway status
railway variable list
railway logs --lines 200
curl -I https://shupass-backend-production.up.railway.app/health
```

> Vercel 側を併せて確認する場合は `vercel whoami` / `vercel projects ls` を使います。
