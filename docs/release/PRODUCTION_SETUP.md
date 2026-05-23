# 本番セットアップ手順書（Vercel + Railway + Supabase）

初期セットアップ手順書。日常運用は [operations/production/RUNBOOK.md](../operations/production/RUNBOOK.md) を参照。

就活Pass（シューパス）の本番デプロイ手順をステップバイステップで記載します。

**本番ドメイン**: `www.shupass.jp`（`shupass.jp` は `www` にリダイレクト）

## セキュリティ注意（重要）

- 認証情報やAPIキー（Google/Stripe/DB/各種Secret）は **チャットやIssueに貼らない**（漏洩扱いになります）
- もし貼ってしまった場合は **全てローテーション** して、Vercel/Railway の環境変数を更新して **再デプロイ** してください

---

## 構成

```
                 www.shupass.jp
                        |
                    +----v----+
                    | お名前   |  registrar
                    | .com    |
                    +----+----+
                         |
                    +----v----+
                    |Cloudflare| authoritative DNS
                    +----+----+
                         |
+-------------+     +---v---------+     +---------+
|   Vercel     |---->|  Railway     |---->| Supabase |
|  (Next.js)   |     |  (FastAPI)   |     |(Postgres)|
| www.shupass.jp|     |  Port $PORT  |     |          |
+------+-------+     +------+------+     +----------+
       |                    |
       |                    +-- ChromaDB (Railway Volume)
       |                    +-- BM25 Index (Railway Volume)
       |
       +-- Stripe (決済)
       +-- Google OAuth (認証)
       +-- OpenAI / Anthropic (AI)
```

| コンポーネント | デプロイ先 | ドメイン / パス |
|---|---|---|
| フロントエンド | Vercel | `www.shupass.jp` / `/` (ルート) |
| staging フロントエンド | Vercel | `stg.shupass.jp` |
| バックエンド | Railway | `*.up.railway.app`（Railway で生成される公開ドメイン） |
| staging バックエンド | Railway | `stg-api.shupass.jp` |
| データベース | Supabase (PostgreSQL) | -- |
| staging DB | Supabase (PostgreSQL) | production とは別 project（`career-compass-staging`）を参照 |
| ベクトルDB / BM25 | Railway Volume | `/app/data` |

---

## セットアップ手順

| Step | 内容 | ドキュメント |
|---|---|---|
| **Step 0** | ドメイン運用正本（Web / Mail / 解約判断） | [DOMAIN_OPERATIONS.md](./DOMAIN_OPERATIONS.md) |
| **Step 1** | Supabase (PostgreSQL) 本番データベース | [SUPABASE.md](./SUPABASE.md) |
| **Step 2** | Stripe 本番設定 | [STRIPE.md](./STRIPE.md) |
| **Step 3** | Railway にバックエンドをデプロイ | [RAILWAY.md](./RAILWAY.md) |
| **Step 4** | Vercel にフロントエンドをデプロイ | [VERCEL.md](./VERCEL.md) |
| **Step 5a** | Google Cloud / OAuth / CORS | [GOOGLE_CLOUD.md](./GOOGLE_CLOUD.md) |
| **Step 5b** | Upstash Redis（レート制限） | [UPSTASH_REDIS.md](./UPSTASH_REDIS.md) |
| **Step 5c** | Sentry（エラー追跡・外部監視） | [SENTRY.md](./SENTRY.md) |
| **Ref** | 環境変数リファレンス（SSOT） | [ENVIRONMENT_VARIABLES.md](../operations/platform/ENVIRONMENT_VARIABLES.md) |

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
