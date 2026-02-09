# 本番リリース手順書（Vercel + Railway + Supabase）

Career Compass (ウカルン) の本番デプロイ手順をステップバイステップで記載します。

**本番ドメイン**: `shupass.jp`（お名前.com で取得済み）

---

## 構成

```
                    shupass.jp
                        │
                    ┌────▼────┐
                    │ お名前   │  DNS (NS → Vercel)
                    │ .com    │
                    └────┬────┘
                         │
┌─────────────┐     ┌───▼──────────┐     ┌─────────┐
│   Vercel     │────▶│  Railway     │────▶│ Supabase │
│  (Next.js)   │     │  (FastAPI)   │     │(Postgres)│
│  shupass.jp  │     │  Port 8000   │     │          │
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
| フロントエンド | Vercel | `shupass.jp` / `/` (ルート) |
| バックエンド | Railway | `career-compass-backend.up.railway.app` |
| データベース | Supabase (PostgreSQL) | — |
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

### 6-1. main ブランチにマージ

```bash
# Makefile コマンドで実行（安全ガード付き）
make deploy
```

または手動で:

```bash
git checkout main
git merge develop
git push origin main
```

> `git push` により Vercel と Railway の両方で自動デプロイが開始されます。

### 6-2. デプロイ状況の確認

- **Vercel**: https://vercel.com/dashboard → Deployments タブ
- **Railway**: https://railway.app/dashboard → 対象 Service → Deployments タブ

---

## Step 7: デプロイ後の動作確認

### 必須チェックリスト

- [ ] **バックエンド Health Check**: `https://career-compass-backend.up.railway.app/` で JSON 応答を確認
- [ ] **フロントエンド表示**: `https://shupass.jp` でページが表示される
- [ ] **ドメイン SSL**: `https://shupass.jp` で証明書が有効（ブラウザの鍵アイコン確認）
- [ ] **www リダイレクト**: `https://www.shupass.jp` → `https://shupass.jp` にリダイレクトされる
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
