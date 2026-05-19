# Step 5: 外部サービスの本番設定

[← インデックス](../README.md)

---

## 5-1. Google Cloud Console プロジェクト設定

Google Cloud Console (https://console.cloud.google.com/)

### プロジェクト作成

1. 上部メニューの **プロジェクト選択** → **新しいプロジェクト**
2. プロジェクト名: `career-compass`（任意）
3. 作成後、プロジェクトを選択

### API の有効化

**API とサービス** → **ライブラリ** → 以下の API を検索して **有効にする**:

| API | 用途 | 必須 |
|---|---|---|
| **Google People API** | ユーザープロフィール取得（OAuth ログイン） | Yes |
| **Google Calendar API** | カレンダー同期（将来機能） | No |

> Google+ API は非推奨。**People API** を使用してください。

## 5-2. Google OAuth 同意画面の設定

Google Cloud Console → **API とサービス** → **OAuth 同意画面**

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

> 全て「非機密」スコープのため、Google の審査は不要です。

### 公開ステータス

| ステータス | 説明 |
|---|---|
| **テスト** | テストユーザーのみログイン可能（最大 100 名） |
| **本番** | 全 Google ユーザーがログイン可能 |

> **重要**: 本番リリース前に **アプリを公開** をクリックしてステータスを「本番」に変更してください。テストのままだと登録したテストユーザー以外はログインできません。

## 5-3. Google OAuth 認証情報の作成

Google Cloud Console → **API とサービス** → **認証情報** → **認証情報を作成** → **OAuth クライアント ID**

| 設定項目 | 値 | 説明 |
|---|---|---|
| アプリケーションの種類 | **ウェブ アプリケーション** | — |
| 名前 | `就活Pass 本番` | 識別用（任意） |

### 承認済みの JavaScript 生成元

```
https://www.shupass.jp
https://shupass.jp
https://stg.shupass.jp
```

> production は `www.shupass.jp`、staging は `stg.shupass.jp` を正式な OAuth origin とします。

### 承認済みのリダイレクト URI

```
https://www.shupass.jp/api/auth/callback/google
https://stg.shupass.jp/api/auth/callback/google
```

> `*.vercel.app` preview URL は正式な OAuth redirect URI として登録しません。

### 作成後に控えるキー

| キー | 環境変数名 | 設定先 |
|---|---|---|
| クライアント ID | `GOOGLE_CLIENT_ID` | Vercel |
| クライアント シークレット | `GOOGLE_CLIENT_SECRET` | Vercel |

> **注意**: クライアント シークレットは作成後に一度だけ表示されます。安全に保管してください。

## 5-4. Railway の CORS 更新

Railway 側の `CORS_ORIGINS` にカスタムドメインを設定:

Railway Dashboard → 対象 Service → **Variables**

```
CORS_ORIGINS=["https://www.shupass.jp","https://shupass.jp"]
```

staging service では以下を設定:

```
CORS_ORIGINS=["https://stg.shupass.jp"]
```

## 5-5. Upstash Redis 設定（レート制限 / 日次トークン上限用）

Vercel のサーバーレス環境では分散 rate limit と日次 LLM token 上限のために Upstash Redis を使用します。
local/dev では未設定時に in-memory fallback で継続できますが、production / staging では日次 token 上限をインスタンス間で共有するため Redis 設定が必要です。
Upstash Free で 1 DB しか使えない場合は、同じ DB を使っても `UPSTASH_REDIS_NAMESPACE` で production / staging / local の key を必ず分離します。

### アカウント作成 & データベース作成

1. https://console.upstash.com/ にアクセス（GitHub 連携でサインアップ可能）
2. **Create Database** をクリック

| 設定項目 | 推奨値 | 説明 |
|---|---|---|
| Name | `career-compass-ratelimit` | 識別名（任意） |
| Type | **Regional** | 単一リージョン（グローバル不要） |
| Region | `ap-northeast-1` (Tokyo) | レイテンシ最小化 |
| TLS | Enabled | デフォルトのまま |
| Eviction | **Enabled** | メモリ上限時に古いキーを自動削除 |

### REST API 認証情報の取得

データベース作成後、**REST API** セクションに表示される:

| キー | 環境変数名 | 設定先 |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_URL` | Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` | Vercel |
| `UPSTASH_REDIS_NAMESPACE` | `UPSTASH_REDIS_NAMESPACE` | Vercel (`production` / `staging` / `local`) |

### 料金

| プラン | 制限 | 備考 |
|---|---|---|
| **Free** | 10,000 コマンド/日, 256MB | 就活アプリの規模では十分 |
| **Pay As You Go** | $0.2/100K コマンド | 超過時の自動課金 |

## 5-6. Sentry 設定（エラー追跡）

Phase 0 では Replay と tracing を使わず、error tracking のみ有効化する。設定前に `docs/ops/MONITORING_SETUP.md` の送信禁止項目を確認する。

### Vercel

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | browser SDK |
| `SENTRY_NEXTJS_DSN` | server / edge SDK。未設定時のみ legacy `SENTRY_DSN` を fallback |
| `SENTRY_ORG` | source map upload |
| `SENTRY_PROJECT` | source map upload |
| `SENTRY_AUTH_TOKEN` | source map upload |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id |

### Railway

| 変数 | 用途 |
|---|---|
| `SENTRY_FASTAPI_DSN` | FastAPI SDK。frontend project の DSN と混ぜない |
| `BACKEND_SENTRY_DSN` | FastAPI SDK の互換 alias |
| `SENTRY_DSN` | legacy fallback。新規設定では使わない |
| `SENTRY_ENVIRONMENT` | `production` / `staging` |
| `SENTRY_RELEASE` | release id |
| `SENTRY_TRACES_SAMPLE_RATE` | 既定 `0.05` |

## 5-7. Sentry-first 外部監視

本番リリース前の外部死活監視は Sentry を正とする。Sentry Dashboard で必須 3 monitors を作成し、email alert が有効であることを確認する。

| # | Monitor | URL | Type |
|---:|---|---|---|
| 1 | 本番 Frontend | `https://www.shupass.jp` | Uptime / HTTP 200 |
| 2 | 本番 Backend Health | `https://api.shupass.jp/health` | Uptime / HTTP 200 |
| 3 | 本番 Backend Ready | `https://api.shupass.jp/health/ready` | Uptime / HTTP 200 |

Sentry 側で body / header assertion を設定できる場合は、backend health に `X-Request-Id`、ready に `ready` 相当の body を追加確認する。staging、apex redirect（2026-05-09 実測: 307）、robots.txt、sitemap.xml は release blocker ではなく任意監視とする。

`*.railway.app` は Sentry Uptime の domain-wide limit に達しており、Railway 生成ドメインでは backend monitor を作成できない。backend uptime は最後に回し、Railway production backend に `api.shupass.jp` などの独自ドメインを設定してから作成する。

UptimeRobot を併用する場合は任意の冗長監視として扱う。最小構成は本番 Frontend と production backend health の 2 monitors で十分であり、網羅的な monitor 登録は本番リリース条件にしない。
