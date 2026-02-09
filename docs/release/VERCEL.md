# Step 4: Vercel にフロントエンドをデプロイ

[← 目次に戻る](./PRODUCTION.md) | [環境変数リファレンス →](./ENV_REFERENCE.md)

---

## 4-1. Vercel にプロジェクトをインポート

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

Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Git」**

| 設定項目 | 値 | 説明 |
|---|---|---|
| Connected Git Repository | `saoki0913/career_compass` | GitHub 連携済み |
| Production Branch | `main` | 本番デプロイ対象ブランチ |
| Ignored Build Step | — | 未設定（全 push でビルド） |
| Auto-cancel Deployments | `On`（推奨） | 同ブランチへの連続 push で前のビルドをキャンセル |

> `develop` ブランチへの push は自動的にプレビューデプロイが作成されます。

## 4-4. 環境変数を設定

1. Vercel Dashboard → 対象プロジェクトをクリック
2. 上部の **「Settings」** タブをクリック
3. 左サイドメニューから **「Environment Variables」** をクリック

### 変数の追加手順

1. **Key** 欄に変数名を入力（例: `DATABASE_URL`）
2. **Value** 欄に値を入力
3. **Environment** チェックボックスで適用先を選択:

| Environment | 適用タイミング | 用途 |
|---|---|---|
| **Production** | `main` ブランチのデプロイ | 本番 API キー・本番 URL |
| **Preview** | `develop` 等のプレビューデプロイ | テスト用 API キー・テスト URL |
| **Development** | `vercel dev` ローカル実行時 | ローカル開発用 |

4. シークレットキー（`STRIPE_SECRET_KEY` 等）は **「Sensitive」** トグルを ON にする
   - ON にすると保存後に値を再表示できなくなる（セキュリティ強化）
5. **「Save」** ボタンをクリック

> **重要**: 環境変数の変更は **次回デプロイから** 反映されます。既存のデプロイには影響しません。変数設定後に再デプロイが必要な場合は、Deployments タブから最新デプロイの **「...」** → **「Redeploy」** をクリック。

### 必須変数

```bash
# === アプリケーション ===
NEXT_PUBLIC_APP_URL=https://shupass.jp

# === データベース ===
DATABASE_URL=postgresql://...   # 推奨: Pooler (Transaction mode / 6543)
DIRECT_URL=postgresql://...     # 推奨: Direct connection (5432)

# === 認証 - Better Auth ===
BETTER_AUTH_SECRET=<openssl rand -base64 32 で生成>
BETTER_AUTH_URL=https://shupass.jp

# === 認証 - Google OAuth ===
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# === セキュリティ ===
ENCRYPTION_KEY=<openssl rand -hex 32 で生成（64桁hex）>

# === Stripe 決済 ===
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...

# === FastAPI バックエンド URL ===
FASTAPI_URL=https://shupass-backend-production.up.railway.app

# === Vercel Cron 認証 ===
CRON_SECRET=<openssl rand -hex 32 で生成>
```

### 任意変数（推奨）

```bash
# === レート制限 (Upstash Redis) ===
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

### 設定不要な変数

| 変数 | 理由 |
|---|---|
| `OPENAI_API_KEY` | AI API はバックエンド (Railway) 経由 |
| `ANTHROPIC_API_KEY` | 同上 |
| `CLAUDE_MODEL` / `OPENAI_MODEL` | バックエンド側で設定 |
| `CORS_ORIGINS` | バックエンド側の設定 |

## 4-5. Domains 設定

1. Vercel Dashboard → 対象プロジェクト → **「Settings」** → 左メニュー **「Domains」**
2. ドメイン入力欄に `shupass.jp` と入力 → **「Add」** ボタンをクリック
3. DNS 設定の指示が表示される（[Step 0](./DOMAIN.md) で設定済み）

**Step 0 で設定済み。** 以下が Valid Configuration であることを確認:

| ドメイン | 状態 | 説明 |
|---|---|---|
| `shupass.jp` | Valid Configuration | A レコード → `76.76.21.21` |
| `www.shupass.jp` | Redirects to shupass.jp | CNAME → `cname.vercel-dns.com` |

| 設定項目 | 値 | 説明 |
|---|---|---|
| SSL Certificate | 自動発行 (Let's Encrypt) | DNS 設定後に自動 |
| Git Branch | `main` (Production) | ドメインに紐づくブランチ |

> デフォルトドメイン (`career-compass-xxx.vercel.app`) はプレビュー環境として残しておくと便利。

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
| `Content-Security-Policy` | 詳細は `next.config.ts` 参照 | XSS 防止（Stripe・Google 許可済み） |

## 4-9. デプロイ実行 & 確認

### 自動デプロイ

GitHub 連携済みの場合、`main` ブランチへの push で自動デプロイが開始されます。

### デプロイ状況の確認

1. Vercel Dashboard → 対象プロジェクト → 上部の **「Deployments」** タブをクリック
2. 各デプロイのステータスを確認:
   - **Building**: ビルド中（デプロイをクリック → Build Logs で進捗確認）
   - **Ready**: デプロイ完了
   - **Error**: ビルド失敗（デプロイをクリック → Build Logs でエラー確認）
3. デプロイの **「...」**（三点メニュー）→ **「Redeploy」** で再デプロイ可能

> プレビューデプロイ: `develop` ブランチへの push で自動作成。一意の URL（`career-compass-xxx-yyy.vercel.app`）が発行されます。

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
vercel projects ls

# 本番デプロイ一覧
vercel ls --prod

# ドメイン一覧
vercel domains ls
```

### 追加の切り分け

- `*.vercel.app` でも `NOT_FOUND` の場合:
  - 「別プロジェクトを見ている」「Root Directory が違う」可能性が高い
- カスタムドメインだけ `NOT_FOUND` の場合:
  - ドメインが別プロジェクトに紐づいている/Production ではなく Preview に紐づいている可能性
