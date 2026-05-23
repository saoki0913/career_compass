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
  --display-name="shupass-gemini-production" \
  --api-target=service=generativelanguage.googleapis.com
```

staging と production は別キーにする。

```bash
gcloud services api-keys create \
  --project=ukarun-483616 \
  --display-name="shupass-gemini-staging" \
  --api-target=service=generativelanguage.googleapis.com
```

作成後は、Google Cloud Console の **API とサービス** → **認証情報** → 対象 API キーで以下を確認する。

| 設定 | 値 |
|---|---|
| API の制限 | `Generative Language API` のみ |
| アプリケーションの制限 | サーバー側でのみ使うため、必要に応じて環境の送信元に合わせて制限 |

> 公式: API キーは制限して使う。参考: https://cloud.google.com/docs/authentication/api-keys

### Document AI 管理

`Document AI API` は `Google Docs API` とは別物。就活Pass では PDF OCR の経路で `documentai.googleapis.com` を呼び出す。

必要な環境変数:

```env
GOOGLE_DOCUMENT_AI_PROJECT_ID=ukarun-483616
GOOGLE_DOCUMENT_AI_LOCATION=（例: us または eu）
GOOGLE_DOCUMENT_AI_PROCESSOR_ID=（Document AI の processor ID）
GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON=（サービスアカウント JSON）
```

Document AI は API キーではなく、サービスアカウントでアクセストークンを発行して呼び出す。サービスアカウントには最小権限だけを付与する。

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
| local | `shupass-local` | ローカル開発 |
| staging | `shupass-staging` | staging |
| production | `shupass-production` | 本番 |

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
