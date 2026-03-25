# 本番リリース手順書（Vercel + Railway + Supabase）

就活Pass（シューパス）の本番デプロイ手順をステップバイステップで記載します。

**本番ドメイン**: `www.shupass.jp`（`shupass.jp` は `www` にリダイレクト）

## セキュリティ注意（重要）

- 認証情報やAPIキー（Google/Stripe/DB/各種Secret）は **チャットやIssueに貼らない**（漏洩扱いになります）
- もし貼ってしまった場合は **全てローテーション** して、Vercel/Railway の環境変数を更新して **再デプロイ** してください

---

## リリース関連ドキュメント一覧

本番・ステージングの作業は、次のファイルに分割してあります。迷ったらこの表から辿ってください。

| 文書 | 内容 |
|------|------|
| [PRODUCTION.md](./PRODUCTION.md)（この文書） | 全体フロー、develop→main、デプロイ後チェック |
| [DOMAIN.md](./DOMAIN.md) | ドメイン（お名前.com → Cloudflare → Vercel） |
| [SUPABASE.md](./SUPABASE.md) | 本番 Supabase / Postgres の扱い |
| [STRIPE.md](./STRIPE.md) | Stripe 本番（Checkout / Webhook / Portal） |
| [RAILWAY.md](./RAILWAY.md) | FastAPI バックエンドの Railway デプロイ |
| [VERCEL.md](./VERCEL.md) | Next.js の Vercel デプロイ |
| [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) | Google OAuth、CORS、Upstash 等 |
| [ENV_REFERENCE.md](./ENV_REFERENCE.md) | 環境変数のクイックリファレンス |
| [INDIVIDUAL_BUSINESS_COMPLIANCE.md](./INDIVIDUAL_BUSINESS_COMPLIANCE.md) | 個人事業・特商法・Stripe 表記 |

開発環境のセットアップは [開発ガイドと環境変数](../setup/DEVELOPMENT_AND_ENV.md) を参照してください。

---

## 構成

```
                 www.shupass.jp
                        │
                    ┌────▼────┐
                    │ お名前   │  registrar
                    │ .com    │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │Cloudflare│ authoritative DNS
                    └────┬────┘
                         │
┌─────────────┐     ┌───▼──────────┐     ┌─────────┐
│   Vercel     │────▶│  Railway     │────▶│ Supabase │
│  (Next.js)   │     │  (FastAPI)   │     │(Postgres)│
│ www.shupass.jp│     │  Port $PORT  │     │          │
└──────┬───────┘     └──────┬───────┘     └──────────┘
       │                    │
       │                    ├── ChromaDB (Railway Volume)
       │                    └── BM25 Index (Railway Volume)
       │
       ├── Stripe (決済)
       ├── Google OAuth (認証)
       └── OpenAI / Anthropic (AI)
```

| コンポーネント | デプロイ先 | ドメイン / パス |
|---|---|---|
| フロントエンド | Vercel | `www.shupass.jp` / `/` (ルート) |
| staging フロントエンド | Vercel | `stg.shupass.jp` |
| バックエンド | Railway | `*.up.railway.app`（Railway で生成される公開ドメイン） |
| staging バックエンド | Railway | `stg-api.shupass.jp` |
| データベース | Supabase (PostgreSQL) | — |
| staging DB | Supabase (shared production project) | staging / production で同じ project を参照 |
| ベクトルDB / BM25 | Railway Volume | `/app/data` |

---

## セットアップ手順

| Step | 内容 | ドキュメント |
|---|---|---|
| **Step 0** | ドメイン設定（お名前.com → Vercel） | [DOMAIN.md](./DOMAIN.md) |
| **Step 1** | Supabase (PostgreSQL) 本番データベース | [SUPABASE.md](./SUPABASE.md) |
| **Step 2** | Stripe 本番設定 | [STRIPE.md](./STRIPE.md) |
| **Step 3** | Railway にバックエンドをデプロイ | [RAILWAY.md](./RAILWAY.md) |
| **Step 4** | Vercel にフロントエンドをデプロイ | [VERCEL.md](./VERCEL.md) |
| **Step 5** | 外部サービスの本番設定（Google OAuth, CORS, Upstash） | [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) |
| **Ref** | 環境変数クイックリファレンス | [ENV_REFERENCE.md](./ENV_REFERENCE.md) |

---

## Step 6: develop → main マージ & デプロイ

### 6-1. ローカルで release automation を開始する

```bash
make ops-release-check
make deploy
```

> `make deploy` は `scripts/release/release-career-compass.sh` を正本として、local gate、`develop` push、staging 確認、`develop -> main` PR 自動作成 / 自動 merge、本番の read-only smoke まで進めます。  
> direct な provider deploy は使わず、GitHub-connected deploy を標準運用にします。

ローカルの変更をまとめて release 対象へ含めたいときは、次を使います。

```bash
make deploy-stage-all
```

> `make deploy-stage-all` は `git add -A` 相当でローカル変更を全部 stage したうえで、通常の release automation を続行します。不要な差分まで含めないよう注意してください。

### 6-2. 実行される内容

- `develop` ブランチと release scope の確認（`make deploy-stage-all` ではローカル変更を自動 stage）
- provider auth / secrets inventory / infra bootstrap の preflight
- `scripts/ci/run-frontend-verify.sh`（`lint`, `build`, `test:unit`, `npm audit --audit-level=high`）
- `scripts/ci/run-backend-deterministic.sh`
- staged changes があれば release commit を作成（`make deploy-stage-all` では commit 前に `git add -A`）
- `git push origin develop`
- `Develop CI` 成功待ち
- staging `https://stg.shupass.jp` / `https://stg-api.shupass.jp/health` の反映確認
- staging Playwright major verification
- `develop -> main` PR 自動作成 / `Main Release Gate` / `Dependency Review` / `CodeQL` 成功後に自動 merge
- production `https://www.shupass.jp` / backend health の反映確認
- production read-only Playwright smoke

### 6-3. デプロイ状況の確認

- **Vercel**: https://vercel.com/dashboard → Deployments タブ
- **Railway**: https://railway.app/dashboard → 対象 Service → Deployments タブ

---

## Step 7: デプロイ後の動作確認

### 必須チェックリスト

- [ ] **バックエンド Health Check**: `https://<your-railway-domain>/health` が 200 で返る
- [ ] **フロントエンド表示**: `https://www.shupass.jp` でページが表示される
- [ ] **ドメイン SSL**: `https://www.shupass.jp` で証明書が有効（ブラウザの鍵アイコン確認）
- [ ] **Apex リダイレクト**: `https://shupass.jp` → `https://www.shupass.jp` にリダイレクトされる
- [ ] **Canonical / OGP**: `https://www.shupass.jp` を返す
- [ ] **robots / sitemap**: `https://www.shupass.jp` を基準に出力される（`NEXT_PUBLIC_APP_URL` が本番 origin と一致すること）
- [ ] **構造化データ**: トップ・主要クラスターで `FAQPage` JSON-LD が出力されること（リッチリザルトテストは任意）
- [ ] **Google ログイン**: ログイン → オンボーディング → ダッシュボード
- [ ] **企業登録**: 企業を作成し、情報取得が正常に動作する
- [ ] **ES 添削**: ES を作成 → 添削実行 → スコア・リライト結果表示
- [ ] **Stripe 決済**: テストカード `4242 4242 4242 4242` で Standard プランを購入
  - ※ テスト後にサブスクリプションをキャンセル
- [ ] **プラン機能制限**: Free / Standard / Pro で機能制限が正しく適用される
- [ ] **Stripe カスタマーポータル**: 設定画面 →「プラン管理」→ Stripe ポータルが開く

### 追加チェック（運用後）

- [ ] Vercel Cron (`/api/cron/daily-notifications`) の実行ログ確認
- [ ] Sentry にイベントが届くことを確認（設定した場合）
- [ ] Railway の Volume 使用量確認

### Playwright 自動確認

- staging: `scripts/release/post-deploy-playwright.sh staging`
  - guest major
  - `PLAYWRIGHT_AUTH_STATE` がある場合は logged-in major も実行
- GitHub の `Main Release Gate` では staging に対して `guest-major`, `auth-boundary`, `user-major`, `regression` を必須実行する
- production: `scripts/release/post-deploy-playwright.sh production`
  - public / canonical / robots / sitemap
  - `PLAYWRIGHT_AUTH_STATE` がある場合は logged-in read-only surfaces

`PLAYWRIGHT_AUTH_STATE` がない場合、production の authenticated smoke は skip されます。ローカル Chrome の既存 Google セッションから取得する場合は `scripts/release/capture-google-storage-state.sh production` を使います。

staging の GitHub Actions 認証 E2E は Google storage state を使わず、`/api/internal/test-auth/login` に `CI_E2E_AUTH_SECRET` を渡して Better Auth session を発行します。この route は `CI_E2E_AUTH_ENABLED=1` の non-production 環境でのみ有効です。

### Secret Inventory

- `codex-company/.secrets/career_compass/vercel-staging.env`
- `codex-company/.secrets/career_compass/vercel-production.env`
- `codex-company/.secrets/career_compass/railway-staging.env`
- `codex-company/.secrets/career_compass/railway-production.env`
- `codex-company/.secrets/career_compass/supabase.env`
- `codex-company/.secrets/google-oauth/career_compass.env`

テンプレートは repo 内 `scripts/templates/` を使います。

### デプロイ不具合の切り分け（CLI）

Vercel の `404: NOT_FOUND` や Railway の到達不可が出たときは、`vercel whoami`、`vercel projects ls`、`vercel ls --prod`、`railway status`、`railway logs --tail 200`、`curl -I` を個別に実行して切り分けます。

---

## 注意事項

### Railway の料金体系

Railway は従量課金制です。月 $5 の無料クレジットが付与されます。

| リソース | 単価 | 備考 |
|---|---|---|
| CPU | $0.000463/分/vCPU | 使用した分だけ |
| メモリ | $0.000231/分/GB | デフォルト上限 8GB |
| Volume | $0.25/GB/月 | 永続ディスク |
| ネットワーク（送信） | $0.10/GB | 受信は無料 |

> 低トラフィック（就活生向けアプリ）の場合、月 $5-15 程度の見込み。

### メモリ要件

Cross-encoder モデル (`hotchpotch/japanese-reranker-small-v2`, ~70M params) のロードに約 400MB のメモリが必要です。
Railway はデフォルトで 8GB まで利用可能なため、メモリ不足の心配はありません。

### ChromaDB / BM25 データ

開発環境の `backend/data/` は Git に含まれていません。本番では空の状態からスタートし、企業情報を取得するたびにデータが蓄積されます。Railway Volume にデータが永続化されます。

### Vercel Cron

`vercel.json` に設定済みの日次通知 cron:
- スケジュール: `0 0 * * *` (UTC 0:00 = JST 9:00)
- Vercel **Pro プラン以上** で利用可能（Hobby では Cron は利用不可）
- `CRON_SECRET` 環境変数で認証（未設定だと不正実行のリスク）

### Stripe テストモード → 本番モード

本番申請が完了するまではテストモードの API キー (`sk_test_`, `pk_test_`) を使用します。
本番申請完了後、本番キー (`sk_live_`, `pk_live_`) に切り替えてください。

> **注意**: テストモードの商品・価格は本番モードに引き継がれません。[Step 2-3](./STRIPE.md#2-3-本番用の商品価格を作成) で本番用の商品を新規作成してください。
