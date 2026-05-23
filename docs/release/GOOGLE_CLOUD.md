# Google Cloud の本番設定

[← インデックス](./README.md)

---

## 1. Google Cloud Console プロジェクト設定

Google Cloud Console (https://console.cloud.google.com/)

### 管理プロジェクト

就活Pass の Google 系サービスは、既存の Google Cloud プロジェクトに集約する。

| 項目 | 値 |
|---|---|
| プロジェクト ID | `ukarun-483616` |
| プロジェクト名 | `career-compass` |
| プロジェクト番号 | `547165397226` |

Google Cloud のプロジェクト ID は作成後に変更できない。わかりやすくしたい場合は、表示名だけ変更するか、新しいプロジェクトを作って API / OAuth / API キーを作り直す。

```bash
# 作業対象を固定
gcloud config set project ukarun-483616

# 現在の対象プロジェクトを確認
gcloud config get-value project

# 表示名だけ変更する場合（プロジェクト ID は変わらない）
gcloud projects update ukarun-483616 --name="career-compass"
```

> 公式: Google Cloud の `projectId` は作成後読み取り専用。参考: https://cloud.google.com/resource-manager/docs/creating-managing-projects

### API の有効化

このアプリで実際に使う Google 系 API は以下。`Google Docs API` / `Google Drive API` は現時点の実装では直接使っていないため、有効化しない。

| API | 用途 | 必須 |
|---|---|---|
| **API Keys API** (`apikeys.googleapis.com`) | API キーの作成・一覧・削除 | Yes |
| **Generative Language API** (`generativelanguage.googleapis.com`) | Gemini API | Yes（Gemini を使う場合） |
| **Google Calendar API** (`calendar-json.googleapis.com`) | カレンダー一覧、予定作成・更新・削除、freeBusy | Yes（カレンダー連携を使う場合） |
| **Document AI API** (`documentai.googleapis.com`) | PDF OCR | Yes（Google Document AI OCR を使う場合） |

```bash
gcloud services enable \
  apikeys.googleapis.com \
  generativelanguage.googleapis.com \
  calendar-json.googleapis.com \
  documentai.googleapis.com \
  --project=ukarun-483616

gcloud services list --enabled --project=ukarun-483616
```

> 公式: API の有効化は Google Cloud プロジェクト単位。参考: https://cloud.google.com/service-usage/docs/enable-disable

### API キー管理

`GOOGLE_API_KEY` は Gemini API 用。チャット、ログ、issue、共有メモに貼った API キーは、`lookup` で `NOT_FOUND` でも再利用しない。漏洩済みとして削除または無効化し、新しく作る。

既存キーの確認:

```bash
gcloud services api-keys list --project=ukarun-483616
gcloud services api-keys lookup "<API_KEY>"
```

Gemini production 用キーの作成:

```bash
gcloud services api-keys create \
  --project=ukarun-483616 \
  --display-name="career-compass-gemini-production" \
  --api-target=service=generativelanguage.googleapis.com
```

staging と production は別キーにする。

```bash
gcloud services api-keys create \
  --project=ukarun-483616 \
  --display-name="career-compass-gemini-staging" \
  --api-target=service=generativelanguage.googleapis.com
```

作成後は、Google Cloud Console の **API とサービス** → **認証情報** → 対象 API キーで以下を確認する。

| 設定 | 値 |
|---|---|
| API の制限 | `Generative Language API` のみ |
| アプリケーションの制限 | サーバー側でのみ使うため、必要に応じて環境の送信元に合わせて制限 |

> 公式: API キーは制限して使う。参考: https://cloud.google.com/docs/authentication/api-keys

### Document AI 管理

`Document AI API` は `Google Docs API` とは別物。就活Pass では PDF OCR の経路で `documentai.googleapis.com` を呼び出す。アクセスは API キーではなく、サービスアカウントの JSON 鍵で行う。

必要な環境変数:

| 環境変数 | 値の例 | 説明 |
|---|---|---|
| `GOOGLE_DOCUMENT_AI_PROJECT_ID` | `ukarun-483616` | プロセッサを作成した Google Cloud プロジェクト ID |
| `GOOGLE_DOCUMENT_AI_LOCATION` | `us`（または `eu`） | プロセッサのロケーション。リージョナルエンドポイントと一致させる |
| `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` | （Document AI の processor ID） | 作成したプロセッサの ID |
| `GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON` | （サービスアカウント JSON の中身を 1 行で） | アクセストークン発行に使うサービスアカウント鍵 |

#### 0. 前提

`documentai.googleapis.com` の有効化は「API の有効化」節（このページ上部）で実施済みであること。未有効化の場合はそちらの `gcloud services enable` を先に実行する。以降のコマンドは `gcloud config set project ukarun-483616` で対象プロジェクトを固定した状態を前提にする。

> 公式: API の有効化は Google Cloud プロジェクト単位。参考: https://cloud.google.com/service-usage/docs/enable-disable

#### 1. ロケーションを決める

Document AI のロケーションはデータの保存・処理の場所を決め、API のリージョナルエンドポイント（`LOCATION-documentai.googleapis.com`）と一致させる必要がある。日本からの利用では、レイテンシ重視なら `us`、データ所在を EU に限定したい場合は `eu` を選ぶ。`OCR_PROCESSOR` / `FORM_PARSER_PROCESSOR` はどちらのロケーションでも利用できる。一度決めたロケーションは以降のすべての手順（プロセッサ作成・処理リクエスト・`GOOGLE_DOCUMENT_AI_LOCATION`）で揃える。

> 公式: ロケーションごとにデータ保存・文書処理が行われる。`us`（米国）/ `eu`（EU）のマルチリージョンを選択する。参考: https://cloud.google.com/document-ai/docs/regions

#### 2. Document AI プロセッサを作成する（REST API）

gcloud には Document AI のプロセッサを作成するサブコマンドが無いため、公式 REST API（`projects.locations.processors.create`）を curl で呼ぶ。認証は `gcloud auth print-access-token` で取得したアクセストークンを `Authorization: Bearer` に渡す。

利用可能なプロセッサ種別を確認する場合:

```bash
# LOCATION は us または eu
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://us-documentai.googleapis.com/v1/projects/ukarun-483616/locations/us:fetchProcessorTypes"
```

PDF OCR 用に Document OCR プロセッサ（種別 `OCR_PROCESSOR`）を作成する。Form Parser を使う場合は `OCR_PROCESSOR` を `FORM_PARSER_PROCESSOR` に置き換える。

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"type": "OCR_PROCESSOR", "displayName": "career-compass-ocr-production"}' \
  "https://us-documentai.googleapis.com/v1/projects/ukarun-483616/locations/us/processors"
```

レスポンスの `name` フィールド（`projects/ukarun-483616/locations/us/processors/PROCESSOR_ID`）の末尾が processor ID。これを `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` に設定する。後から一覧で確認する場合:

```bash
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://us-documentai.googleapis.com/v1/projects/ukarun-483616/locations/us/processors"
```

> 公式: gcloud にはプロセッサ作成コマンドが無く、REST または client library で作成する。`OCR_PROCESSOR` / `FORM_PARSER_PROCESSOR` は汎用プロセッサ。参考: https://cloud.google.com/document-ai/docs/create-processor / https://cloud.google.com/document-ai/docs/processors-list

#### 3. サービスアカウントを作成し最小権限を付与する

Document AI はサービスアカウントでアクセストークンを発行して呼び出す。処理（OCR）のみを行うため、付与するロールは `roles/documentai.apiUser`（文書処理のみを許可）に限定する。これは `documentai.processors.processOnline` / `documentai.processors.processBatch` を含み、プロセッサ管理権限を持たない最小ロール。

```bash
# サービスアカウントを作成（email は SA_NAME@PROJECT_ID.iam.gserviceaccount.com になる）
gcloud iam service-accounts create career-compass-documentai \
  --project=ukarun-483616 \
  --display-name="career-compass Document AI"

# 処理のみの最小ロールを付与
gcloud projects add-iam-policy-binding ukarun-483616 \
  --member="serviceAccount:career-compass-documentai@ukarun-483616.iam.gserviceaccount.com" \
  --role="roles/documentai.apiUser"
```

> 公式: `roles/documentai.apiUser` は文書処理のみを許可する最小ロール。最小権限の原則に従い、必要以上の権限を付与しない。参考: https://cloud.google.com/document-ai/docs/access-control/iam-roles / https://cloud.google.com/iam/docs/service-accounts-create

#### 4. JSON 鍵を発行する

```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=career-compass-documentai@ukarun-483616.iam.gserviceaccount.com
```

発行した鍵は再ダウンロードできない。`key.json` の中身を `GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON` に設定する。

- **1 行 JSON にする**: 環境変数として扱うため、改行を含まない 1 行の JSON 文字列にする。
- **実鍵はリポジトリに置かない**: 実ファイルは `.secrets/`（gitignored）に保管し、チャット・ログ・issue・共有メモに鍵本体を貼らない。
- **漏洩時は無効化して再発行**: 鍵が露出した可能性がある場合は、その鍵を削除し、新しい鍵を発行して差し替える。発行済み鍵の一覧・削除は次のとおり。

```bash
# 既存鍵の一覧（KEY_ID を確認）
gcloud iam service-accounts keys list \
  --iam-account=career-compass-documentai@ukarun-483616.iam.gserviceaccount.com

# 漏洩した鍵を削除
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=career-compass-documentai@ukarun-483616.iam.gserviceaccount.com
```

> 公式: サービスアカウント鍵はダウンロード後に再取得できない。漏洩時は速やかに削除する。参考: https://cloud.google.com/iam/docs/keys-create-delete

#### 5. 動作確認（任意）

プロセッサと権限が正しく設定されているかは、同期処理（`:process`）の curl で確認できる。`content` は対象 PDF を base64 エンコードした文字列、`mimeType` は `application/pdf`。

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"rawDocument": {"mimeType": "application/pdf", "content": "BASE64_PDF_CONTENT"}}' \
  "https://us-documentai.googleapis.com/v1/projects/ukarun-483616/locations/us/processors/PROCESSOR_ID:process"
```

> 公式: 同期処理は `processors.process` を呼ぶ。`rawDocument` に base64 の `content` と `mimeType` を渡す。参考: https://cloud.google.com/document-ai/docs/send-request

> 公式: Document AI REST API は `documentai.googleapis.com`。参考: https://cloud.google.com/document-ai/docs/reference/rest

## 2. Google OAuth 同意画面の設定

Google Cloud Console → **Google Auth Platform** → **Branding / Audience / Data Access**

### 基本情報

| 設定項目 | 値 | 説明 |
|---|---|---|
| User Type | **外部** | Google Workspace 外のユーザーも対象 |
| アプリ名 | `就活Pass` | ログイン時の同意画面に表示 |
| ユーザー サポートメール | `support@shupass.jp` | ユーザーからの問い合わせ先 |
| アプリのロゴ | ロゴ画像をアップロード | 同意画面に表示（120x120px 推奨） |

### アプリのドメイン

| 設定項目 | 値 |
|---|---|
| アプリのホームページ | `https://www.shupass.jp` |
| アプリのプライバシー ポリシー リンク | `https://www.shupass.jp/privacy` |
| アプリの利用規約リンク | `https://www.shupass.jp/terms` |
| 承認済みドメイン | `shupass.jp` |

### デベロッパーの連絡先情報

| 設定項目 | 値 |
|---|---|
| メールアドレス | 開発者のメールアドレス（Google からの連絡用） |

### スコープ

**スコープを追加または削除** → 以下を選択:

| スコープ | 説明 | 種別 |
|---|---|---|
| `.../auth/userinfo.email` | メールアドレス | 非機密 |
| `.../auth/userinfo.profile` | 名前、プロフィール画像 | 非機密 |
| `openid` | OpenID Connect 認証 | 非機密 |
| `https://www.googleapis.com/auth/calendar` | Google Calendar 全体 | 機密 |
| `https://www.googleapis.com/auth/calendar.readonly` | Google Calendar 読み取り | 機密 |
| `https://www.googleapis.com/auth/calendar.events` | 予定の作成・更新 | 機密 |
| `https://www.googleapis.com/auth/calendar.freebusy` | 空き時間取得 | 機密 |

> 現在の実装は Calendar scope を要求するため、外部ユーザー向けの本番公開では Google の確認が必要になる可能性がある。将来的には `calendar` のような広い scope を外し、必要最小限に整理する。

### 公開ステータス

| ステータス | 説明 |
|---|---|
| **テスト** | テストユーザーのみログイン可能（最大 100 名） |
| **本番** | 全 Google ユーザーがログイン可能 |

> **重要**: 本番リリース前に **アプリを公開** をクリックしてステータスを「本番」に変更してください。テストのままだと登録したテストユーザー以外はログインできません。

## 3. Google OAuth 認証情報の作成

Google Cloud Console → **Google Auth Platform** → **Clients** → **Create client**

OAuth クライアントは環境別に分ける。

| 環境 | クライアント名 | 用途 |
|---|---|---|
| local | `career-compass-local` | ローカル開発 |
| staging | `career-compass-staging` | staging |
| production | `career-compass-production` | 本番 |

| 設定項目 | 値 | 説明 |
|---|---|---|
| アプリケーションの種類 | **ウェブ アプリケーション** | — |
| 名前 | 上表のクライアント名 | 識別用 |

### 承認済みの JavaScript 生成元

local:

```
http://localhost:3000
```

staging:

```
https://stg.shupass.jp
```

production:

```
https://www.shupass.jp
https://shupass.jp
```

> production は `www.shupass.jp`、staging は `stg.shupass.jp` を正式な OAuth origin とします。

### 承認済みのリダイレクト URI

local:

```
http://localhost:3000/api/auth/callback/google
```

staging:

```
https://stg.shupass.jp/api/auth/callback/google
```

production:

```
https://www.shupass.jp/api/auth/callback/google
https://shupass.jp/api/auth/callback/google
```

> `*.vercel.app` preview URL は正式な OAuth redirect URI として登録しません。

### 作成後に控えるキー

| キー | 環境変数名 | 設定先 |
|---|---|---|
| クライアント ID | `GOOGLE_CLIENT_ID` | Vercel |
| クライアント シークレット | `GOOGLE_CLIENT_SECRET` | Vercel |

> **注意**: クライアント シークレットは作成後に一度だけ表示されます。安全に保管してください。

## 4. Railway の CORS 更新

Railway 側の `CORS_ORIGINS` にカスタムドメインを設定:

Railway Dashboard → 対象 Service → **Variables**

```
CORS_ORIGINS=["https://www.shupass.jp","https://shupass.jp"]
```

staging service では以下を設定:

```
CORS_ORIGINS=["https://stg.shupass.jp"]
```
