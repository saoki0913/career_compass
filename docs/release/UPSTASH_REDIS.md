# Upstash Redis の本番設定

[← インデックス](./README.md)

---

## 1. 概要

Vercel のサーバーレス環境では分散 rate limit と日次 LLM token 上限のために Upstash Redis を使用します。FastAPI 側でも SSE 同時接続制御に Redis を使います。

| 項目 | 内容 |
|---|---|
| 用途 | レートリミット、日次トークン制限、SSE 同時接続制御 |
| 重要度 | 推奨（production / staging では実質必須） |
| 未設定時の挙動 | local/dev は in-memory fallback で継続。`UPSTASH_*` / `REDIS_URL` が未設定ならキャッシュ無効・レート制限無効で動作する |

production / staging では日次 token 上限をインスタンス間で共有するため Redis 設定が必要です。
staging と production は別データベースを使うことを推奨します。Upstash Free で 1 DB しか使えない等で同じ DB を共有する場合でも、`UPSTASH_REDIS_NAMESPACE` / `REDIS_NAMESPACE` で production / staging / local の key を必ず分離します（namespace は `APP_ENV` と同値）。

Region は `ap-northeast-1`（東京）を推奨します（レイテンシ最小化）。

> 公式: Upstash Redis の利用可能リージョンに `ap-northeast-1`（Tokyo）が含まれる。参考: https://upstash.com/docs/common/concepts/global-replication

---

## 2. 前提 CLI

DB 作成・認証情報取得は `@upstash/cli`（推奨）または Developer API（curl）で行えます。CLI が使えない場合は GUI（fallback）に降格します。

```bash
# Upstash CLI のインストール（npm グローバル）
npm i -g @upstash/cli

# ログイン（メールアドレスと Management API Key を対話入力）
upstash auth login

# 非対話の場合は環境変数で渡す（CI など）
export UPSTASH_EMAIL="<account-email>"
export UPSTASH_API_KEY="<management-api-key>"
```

Management API Key は Upstash Console の **Account** → **Management API** → **Create API Key** で発行します（Developer API・CLI 共通で使用）。

> 公式: Upstash CLI のインストール・`auth login`・環境変数。参考: https://github.com/upstash/cli/blob/main/README.md
> 公式: Management API Key の発行手順（Account → Management API）。参考: https://upstash.com/docs/devops/developer-api/redis/get_database

---

## 3. データベース作成・認証情報の取得

### CLI（推奨）

`upstash redis create` で DB を作成し、`upstash redis get` で認証情報（REST URL / REST token / password / endpoint / port）を取得します。出力はすべて JSON なので `jq` でパイプできます。

```bash
# production 用 DB を東京リージョンで作成
upstash redis create \
  --name career-compass-ratelimit-production \
  --region ap-northeast-1

# staging は別 DB を推奨
upstash redis create \
  --name career-compass-ratelimit-staging \
  --region ap-northeast-1

# DB 一覧（database_id を確認）
upstash redis list

# 単一 DB の詳細（認証情報を含む）
upstash redis get --db-id "<database_id>"

# 認証情報を隠して構成だけ確認したい場合
upstash redis get --db-id "<database_id>" --hide-credentials
```

`upstash redis get` のレスポンスには次のフィールドが含まれます。`rest_token` と `endpoint` から Vercel 用の値を、`password` / `endpoint` / `port` から FastAPI 用の `REDIS_URL` を組み立てます。

| レスポンスフィールド | 用途 |
|---|---|
| `endpoint` | REST URL のホスト名（`https://<endpoint>`）。`REDIS_URL` のホストにも使う |
| `rest_token` | `UPSTASH_REDIS_REST_TOKEN` の値（読み書き用） |
| `read_only_rest_token` | 読み取り専用トークン（本アプリでは未使用） |
| `password` | `REDIS_URL`（`rediss://`）のパスワード |
| `port` | `REDIS_URL` のポート |
| `database_id` | `redis get` / `redis delete` 等で使う DB 識別子 |
| `state` | DB の状態（`active` 等） |

> 公式: `upstash redis create --name --region` / `upstash redis list` / `upstash redis get --db-id`（出力は JSON）。参考: https://upstash.com/docs/agent-resources/cli

#### 作成直後に TLS / eviction を設定する場合

`create` のフラグでは TLS / eviction を指定できないため、作成後に専用コマンドで有効化します（TLS は通常デフォルト有効）。

```bash
# メモリ上限時に古いキーを自動削除（eviction を有効化）
upstash redis enable-eviction --db-id "<database_id>"

# TLS を明示的に有効化したい場合
upstash redis enable-tls --db-id "<database_id>"
```

> 公式: TLS / eviction は作成時フラグではなく `enable-tls` / `enable-eviction` で設定する。参考: https://upstash.com/docs/agent-resources/cli

### Developer API / curl（CLI が使えない場合）

CLI を導入できない環境では、Upstash Developer API（Management API）を curl で直接叩けます。認証は Basic 認証（`-u <account-email>:<management-api-key>`）です。

```bash
# production 用 DB を東京リージョンで作成
curl -s -X POST "https://api.upstash.com/v2/redis/database" \
  -u "<account-email>:<management-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "database_name": "career-compass-ratelimit-production",
    "region": "ap-northeast-1",
    "tls": true,
    "eviction": true
  }'

# DB 一覧（database_id を確認）
curl -s "https://api.upstash.com/v2/redis/databases" \
  -u "<account-email>:<management-api-key>"

# 単一 DB の詳細（認証情報を含む）
curl -s "https://api.upstash.com/v2/redis/database/<database_id>" \
  -u "<account-email>:<management-api-key>"
```

レスポンス JSON のフィールド名は CLI と同じです（`database_id` / `endpoint` / `port` / `password` / `rest_token` / `read_only_rest_token` / `state`）。
`GET .../database/<id>` で認証情報を含めたくない場合は、クエリで `?hide` 相当の指定により credentials を除外できます（運用上、認証情報が必要なため通常は付けません）。

> 公式: `POST /v2/redis/database`（body: `database_name`, `region`, `tls`, `eviction`、Basic 認証）。参考: https://upstash.com/docs/devops/developer-api/redis/create_database_global
> 公式: `GET /v2/redis/database/{id}` で DB 詳細を取得（credentials 非表示クエリあり）。参考: https://upstash.com/docs/devops/developer-api/redis/get_database

### GUI（fallback）

CLI / API が使えない場合は Upstash Console から手動で作成します。

1. https://console.upstash.com/ にアクセス（GitHub / Google 連携でサインアップ可能）
2. **Create Database** をクリック

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Name | `career-compass-ratelimit` | 識別名（任意） |
| Type | **Regional** | 単一リージョン（グローバル不要） |
| Region | `ap-northeast-1` (Tokyo) | レイテンシ最小化 |
| TLS | Enabled | デフォルトのまま |
| Eviction | **Enabled** | メモリ上限時に古いキーを自動削除 |

データベース作成後、**REST API** セクションに `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` が表示されます。FastAPI 用の `REDIS_URL` は **Connect** / **Details** に表示される `rediss://` 接続文字列を使います。

> 公式: Upstash Console。参考: https://console.upstash.com/

### 取得値から各環境変数を組み立てる

| 環境変数 | 値の作り方 |
|---|---|
| `UPSTASH_REDIS_REST_URL` | `https://<endpoint>`（`endpoint` の前に `https://`） |
| `UPSTASH_REDIS_REST_TOKEN` | `rest_token` をそのまま |
| `REDIS_URL` | `rediss://default:<password>@<endpoint>:<port>`（TLS 必須の `rediss://` スキーム） |

> 公式: 標準 Redis クライアントは `rediss://:<password>@<host>:<port>` で接続（TLS デフォルト有効）。REST 接続は `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` を使う。参考: https://upstash.com/docs/redis/howto/connectclient

---

## 4. キーの制限・セキュリティ

- `UPSTASH_REDIS_REST_TOKEN` / `REDIS_URL`（password 入り）はサーバー専用 secret。クライアントに露出させない。
- Management API Key は DB の作成・削除権限を持つため、`.secrets/` 正本にのみ置き、漏洩時は Console で revoke して再発行する。
- read 専用処理しかしない経路では `read_only_rest_token` の利用を検討する（本アプリの現行実装は読み書きトークンを使用）。
- staging と production は別 DB を推奨。共有時も namespace を必ず分離する（次節）。

---

## 5. 環境変数マッピング

| 変数名 | 設定先 | 重要度 | 環境区分 |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `nextjs.env`（Vercel） | 推奨 | [環境別] |
| `UPSTASH_REDIS_REST_TOKEN` | `nextjs.env`（Vercel） | 推奨 | [環境別] |
| `UPSTASH_REDIS_NAMESPACE` | `nextjs.env`（Vercel） | 推奨 | [環境別]（`APP_ENV` と一致） |
| `REDIS_URL` | `fastapi.env`（Railway） | 推奨（deployed では実質必須） | [環境別] |
| `REDIS_NAMESPACE` | `fastapi.env`（Railway） | 任意 | [環境別]（未設定時 `APP_ENV` から導出） |

変数の意味の SSOT は [`docs/operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)。`UPSTASH_REDIS_NAMESPACE` / `REDIS_NAMESPACE` は「必ず別値」グループに属し、sync 時に namespace 重複が検査されます。

local 開発では `UPSTASH_*` / `REDIS_URL` は任意で、未設定なら in-memory fallback で動作します。

---

## 6. ローカル値の流用可否

`UPSTASH_*` / `REDIS_*` はすべて **[環境別]** です。`.env.local` の値を staging / production にそのまま流用してはいけません。理由は以下のとおりです。

- staging と production は別データベースを推奨するため、URL / token / password が環境ごとに異なる。
- 同じ DB を共有する場合でも `UPSTASH_REDIS_NAMESPACE` / `REDIS_NAMESPACE` は `APP_ENV` と同値にする必要があり、環境ごとに別値（`local` / `staging` / `production`）になる。sync は namespace 重複を検査するため、流用すると検査に弾かれる。

各環境で DB を作成（または namespace を分離）し、その環境専用の値を設定してください。

---

## 7. コスト目安

Upstash の料金は変動するため「目安」です。最新は公式 Pricing を確認してください。

| プラン | 制限（目安） | 備考 |
|---|---|---|
| **Free** | 10,000 コマンド/日, 256MB 程度 | 就活アプリの規模では十分な目安 |
| **Pay As You Go** | 従量課金（$0.2/100K コマンド程度） | 超過時の自動課金 |

> 公式: Upstash の最新料金。参考: https://upstash.com/pricing

---

## 8. 動作確認

- 設定後、Upstash Console の **Data Browser** でレート制限・トークン制限のキーが作成されていれば正常に書き込めています。
- CLI なら任意のキーで疎通確認できます。

```bash
# REST URL / token で疎通確認（PING 相当）
upstash redis exec --db-url "<UPSTASH_REDIS_REST_URL>" --db-token "<UPSTASH_REDIS_REST_TOKEN>" PING

# 名前空間付きキーの存在確認（例: production）
upstash redis exec --db-url "<UPSTASH_REDIS_REST_URL>" --db-token "<UPSTASH_REDIS_REST_TOKEN>" KEYS "production:*"
```

> 公式: `upstash redis exec --db-url --db-token <command>` で REST 経由のコマンド実行。参考: https://github.com/upstash/cli/blob/main/README.md
