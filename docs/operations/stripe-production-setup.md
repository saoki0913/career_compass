# Stripe 本番セットアップガイド — 就活Pass

## 0. 前提条件

### Stripe アカウントの本番利用申請

1. https://dashboard.stripe.com/account/onboarding にアクセス
2. 事業形態、業種（ソフトウェア）、ウェブサイト（`https://www.shupass.jp`）を入力
3. 本人確認書類を提出
4. 銀行口座を登録
5. 2段階認証を有効化

### 明細書表記

| 項目 | 設定値 |
|---|---|
| 漢字 | 就活Pass |
| ローマ字 | SHUPASS |
| 短縮 | SHUPASS |
| サポートメール | support@shupass.jp |

> `src/lib/stripe/managed-config.json` の `account.statementDescriptor` が正本。

## 1. Live API キーの取得

Stripe Dashboard → 開発者 → API キー → テストモードを OFF にする。

- `pk_live_...` (公開可能キー)
- `sk_live_...` (シークレットキー) — **一度しか表示されない。必ず控える。**

## 2. Stripe CLI インストールとログイン

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

## 3. 環境変数の準備

`.env.local` に Live 用キーを設定する:

```
STRIPE_SECRET_KEY_LIVE=sk_live_xxxxxxxx
```

スクリプトのキー解決順序（`scripts/stripe/core.mjs` の `resolveStripeSecretKey`）:

1. `STRIPE_SECRET_KEY_LIVE`
2. `STRIPE_LIVE_SECRET_KEY`
3. `STRIPE_SECRET_KEY`

最初に見つかった `sk_live_` プレフィックス付きのキーが使われる。テスト環境と混在させないため `STRIPE_SECRET_KEY_LIVE` を推奨する。

## 4. 方法 A: 一括ブートストラップ（推奨）

`stripe:bootstrap-live` は Products + Webhook + Portal を一括で同期する（`scripts/release/stripe-shupass-live-bootstrap.mjs`）。内部で `syncProducts` → `syncWebhook` → `syncPortal` を順に実行する。

### dry-run で事前確認

個別スクリプトで dry-run を実行し、何が作成・更新されるかを確認する:

```bash
npm run stripe:sync-products -- --env live --dry-run --json
npm run stripe:sync-webhook -- --env live --dry-run --json
npm run stripe:sync-portal -- --env live --dry-run --json
```

各スクリプトの共通オプション:

| オプション | 説明 |
|---|---|
| `--env live` | Live 環境を対象にする（デフォルトは `test`） |
| `--env test` | テスト環境を対象にする（デフォルト） |
| `--dry-run` | 実際の変更を行わず、計画だけを出力する |
| `--json` | JSON 形式で出力する |

### 実行

```bash
npm run stripe:bootstrap-live
```

出力される環境変数を控える:

```
STRIPE_PRICE_STANDARD_MONTHLY=price_xxx
STRIPE_PRICE_STANDARD_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

> 既存 Webhook を再利用した場合、`STRIPE_WEBHOOK_SECRET` は出力されない。Dashboard → Webhooks → 該当エンドポイント → Signing secret からコピーする。

### 作成されるリソース

`managed-config.json` に基づいて以下が作成される:

| リソース | 詳細 |
|---|---|
| Product x2 | 「就活Pass Standard」（metadata: `shupass_plan=standard`）、「就活Pass Pro」（metadata: `shupass_plan=pro`） |
| Price x4 | Standard 月額 1,490円 / 年額 14,900円、Pro 月額 2,980円 / 年額 29,800円（各 Product に 2 Price） |
| Webhook | `https://www.shupass.jp/api/webhooks/stripe` に対して 8 イベントを登録 |
| Portal | Customer Portal の設定（プラン変更、キャンセル、支払い方法更新を有効化。2 Product 構成で interval 重複なし） |

## 5. 方法 B: 個別スクリプトで段階実行

一括ブートストラップの代わりに、個別に実行することもできる:

```bash
# 1. Product と Price を作成
npm run stripe:sync-products -- --env live --json

# 2. Webhook エンドポイントを作成
npm run stripe:sync-webhook -- --env live --json

# 3. Customer Portal を設定
npm run stripe:sync-portal -- --env live --json
```

各スクリプトは冪等で、既存リソースがあれば差分だけを更新する。

## 6. 環境変数をシークレットバンドルに反映

`codex-company/.secrets/career_compass/vercel-production.env` に追記する:

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_STANDARD_MONTHLY=price_xxx
STRIPE_PRICE_STANDARD_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Vercel に同期する:

```bash
# 差分確認
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production --vercel-env production

# 反映
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production
```

## 7. Dashboard 手動設定

以下の項目は Dashboard で手動設定する。`managed-config.json` の `compliance` セクションの URL と一致させる。

| 項目 | 設定先 | 値 |
|---|---|---|
| 特商法表記 URL | 設定 → 事業者情報 | `https://www.shupass.jp/legal` |
| Terms of Service URL | Settings → Public details | `https://www.shupass.jp/terms` |
| プライバシーポリシー URL | Settings → Public details | `https://www.shupass.jp/privacy` |
| サポートメール | 設定 → 事業者情報 | `support@shupass.jp` |
| サポートページ URL | 設定 → 事業者情報 | `https://www.shupass.jp/contact` |

**重要**: Terms of Service URL が未設定の場合、Stripe Checkout が 400 エラーを返す。

## 8. 検証

```bash
# 本番 readiness チェック（readiness: "ready" を確認）
npm run stripe:check-live-readiness -- --json

# 全項目の監査（ok: true を確認）
npm run stripe:audit -- --env live --json

# 全体状況の確認（Product / Price / Webhook / Portal の一覧）
npm run stripe:inspect -- --env live --json

# Makefile エイリアス（check-live-readiness の --json 実行）
make stripe-preflight
```

### readiness 判定ロジック

`check-live-readiness` は以下の 3 段階で判定する（`scripts/stripe/check-live-readiness.mjs`）:

| readiness | 条件 |
|---|---|
| `ready` | 全自動チェック OK かつ手動チェック項目なし |
| `manual_review_required` | 全自動チェック OK だが手動確認が必要な項目あり |
| `not_ready` | 自動チェックで不合格項目あり |

## 9. テスト

### ローカル Webhook テスト（テストモード）

```bash
# ターミナル 1: Stripe CLI で Webhook をローカルに転送
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# ターミナル 2: 各イベントをトリガー
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe trigger invoice.payment_succeeded
stripe trigger charge.refunded
stripe trigger charge.dispute.created
stripe trigger charge.dispute.closed
```

登録イベントの一覧は `managed-config.json` の `webhook.events` が正本。

### テストカード

| カード番号 | 結果 |
|---|---|
| 4242 4242 4242 4242 | 成功 |
| 4000 0000 0000 0002 | 拒否 |
| 4000 0000 0000 3220 | 3D セキュア |

### 本番最小限テスト

1. `https://www.shupass.jp/pricing` で Standard プランを選択
2. 実カードで決済を完了する
3. Stripe Dashboard でサブスクリプションが作成されたことを確認
4. アプリの設定画面 → 請求管理 → Customer Portal が開くことを確認
5. Customer Portal からサブスクリプションをキャンセルする
6. Stripe Dashboard から全額返金を実行する

## 10. モニタリング

```bash
# Dashboard: Webhooks → イベントログで配信状況を確認

# Stripe CLI でリアルタイム監視（Live モード）
stripe listen --live
stripe logs tail --live

# 定期的な監査（CI / cron で実行推奨）
npm run stripe:audit -- --env live --json
```

## 11. ロールバック計画

> **注意**: 本番環境でテストキー（`sk_test_*`）を使用するロールバックは禁止。`validateStripePriceConfig()` の production hard gate がサーバー起動をブロックする。

| 対象 | 手順 |
|---|---|
| Products / Prices | Dashboard で Archive → `stripe:sync-products -- --env live` で再作成 → env 更新 |
| Webhook | Dashboard で削除 → `stripe:sync-webhook -- --env live` で再作成 → env 更新 |
| Portal 設定 | `stripe:sync-portal -- --env live` で再同期 |
| 課金一時停止 | Stripe Dashboard で全 Price を Archive → ユーザーに「メンテナンス中」表示。復旧時に `stripe:sync-products -- --env live` で再作成 |
| 緊急時（全面停止） | Vercel で `STRIPE_SECRET_KEY` を削除 → Checkout/Portal API が 500 を返す → 復旧時にキーを再設定 |

## 12. 完了チェックリスト

- [ ] Stripe 本番アカウント有効化 + 2FA 有効化
- [ ] `npm run stripe:bootstrap-live` 完了（または方法 B で個別実行完了）
- [ ] 6つの Stripe 環境変数が `vercel-production.env` に設定済み
- [ ] Vercel production に env 同期済み（`sync-career-compass-secrets.sh --apply`）
- [ ] Dashboard で特商法表記 URL 設定済み（`https://www.shupass.jp/legal`）
- [ ] Dashboard で Terms of Service URL 設定済み（`https://www.shupass.jp/terms`）
- [ ] `npm run stripe:check-live-readiness -- --json` が `readiness: "ready"`
- [ ] `make stripe-preflight` が `readiness: "ready"` を返すこと（Section 13 完了条件）
- [ ] テストカードでの Checkout 決済成功
- [ ] Webhook イベントが正常に処理される
- [ ] Customer Portal が正常に動作する
