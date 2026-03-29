# 本番リリース手順書（Vercel + Railway + Supabase）

就活Pass（シューパス）の本番デプロイ手順をステップバイステップで記載します。

**本番ドメイン**: `www.shupass.jp`（`shupass.jp` は `www` にリダイレクト）

## セキュリティ注意（重要）

- 認証情報やAPIキー（Google/Stripe/DB/各種Secret）は **チャットやIssueに貼らない**（漏洩扱いになります）
- もし貼ってしまった場合は **全てローテーション** して、Vercel/Railway の環境変数を更新して **再デプロイ** してください

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

### 6-1. ローカルで昇格準備を完了する

```bash
# develop ブランチで実行
make ops-release-check
make deploy
```

> `make deploy` は `develop` 上で `lint` / `build` を通し、staging 昇格前の最終確認だけを行います。  
> `main` へのマージや本番デプロイはこのコマンドでは実行しません。CLI の安全ラッパー方針は [CLI_GUARDRAILS.md](../ops/CLI_GUARDRAILS.md) を参照してください。

### 6-2. staging に反映して確認する

```bash
git push origin develop
```

- `develop` への push で staging 用 CI が走る
- staging 環境 `https://stg.shupass.jp` と `https://stg-api.shupass.jp` が最新 `develop` を反映する
- Google ログイン、企業作成、canonical、`robots.txt`、`sitemap.xml` を staging で確認する

### 6-3. GitHub で `develop -> main` PR を作成する

- GitHub 上で `develop` から `main` への Pull Request を作成する
- `main` への PR は `develop` からのみ許可する
- required checks は `main-promotion-guard` と `develop-ci` を green にする

### 6-4. `main` マージで本番デプロイする

- GitHub 上で PR を merge する
- `main` への更新だけをトリガーに Vercel / Railway が本番へ自動デプロイする
- ローカルで `main` を直接更新したり、provider CLI から本番 deploy を実行しない

### 6-5. デプロイ状況の確認

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
- [ ] **robots / sitemap**: `https://www.shupass.jp` を基準に出力される（`NEXT_PUBLIC_APP_URL` が本番ドメインと一致すること）
- [ ] **Search Console**: プロパティに `https://www.shupass.jp` を追加し、所有権確認（`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` を Vercel に設定）後、`https://www.shupass.jp/sitemap.xml` をサイトマップとして送信する（手順の補足は [marketing/README.md の SEO ロールアウト](../marketing/README.md)）
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

### 本番 DB がコードより遅れていないか（Drizzle）

`.env.production` に本番の `DIRECT_URL`（Direct 5432）を入れたうえで:

```bash
npm run check:prod-db-drift
```

`documents.es_category` の有無と `__drizzle_migrations` 件数を [drizzle_pg/meta/_journal.json](drizzle_pg/meta/_journal.json) と突合します。問題があれば `make deploy-migrate` の後に再実行してください。

本番 Playwright（`scripts/release/post-deploy-playwright.sh production`）で企業詳細まで踏む場合は、Google storage state に加え **`E2E_PRODUCTION_COMPANY_ID`**（対象企業の UUID）を環境変数で渡してください（[e2e/release-production-readonly.spec.ts](../../e2e/release-production-readonly.spec.ts)）。

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
