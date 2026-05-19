# Stripe Codex CLI

Codex から Stripe の状態確認と定型同期を行うための CLI です。`staging` と `production` の target を扱います。

## 方針

- `--target staging` は Stripe test + `https://stg.shupass.jp`
- `--target production` は Stripe live + `https://www.shupass.jp`
- Preview URL (`*.vercel.app/api/webhooks/stripe`) は remote Webhook に登録しない
- 商品 / Price / Webhook / Billing Portal は API 経由で同期する
- `Commerce Disclosure` や一部の事業者情報は Dashboard 手動確認を残す
- すべてのコマンドで `--json` を付けると Codex 向けの JSON を返す

## コマンド

```bash
npm run stripe:inspect -- --target staging --json
npm run stripe:audit -- --target production --json
npm run stripe:sync-products -- --target staging --dry-run --json
npm run stripe:sync-webhook -- --target production --json
npm run stripe:sync-portal -- --target production --dry-run --json
npm run stripe:check-live-readiness -- --json
```

## 認証

次の順でキーを解決します。

- `test`: `STRIPE_SECRET_KEY_TEST` → `STRIPE_TEST_SECRET_KEY` → `STRIPE_SECRET_KEY`
- `live`: `STRIPE_SECRET_KEY_LIVE` → `STRIPE_LIVE_SECRET_KEY` → `STRIPE_SECRET_KEY`

`test` で `sk_live_...`、`live` で `sk_test_...` を渡した場合は即失敗します。

## 自動同期の対象

- managed products `就活Pass Standard` / `就活Pass Pro`
- 4 Price
  - `STRIPE_PRICE_STANDARD_MONTHLY`
  - `STRIPE_PRICE_STANDARD_ANNUAL`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_ANNUAL`
- Webhook `https://stg.shupass.jp/api/webhooks/stripe` または `https://www.shupass.jp/api/webhooks/stripe`
- Billing Portal の default 設定

`audit` / `inspect` は active な `*.vercel.app/api/webhooks/stripe` を stale endpoint として報告します。通常の sync は stale endpoint を削除しません。削除・無効化は Stripe Dashboard または明示的な運用手順で行います。

## 手動確認が残る項目

- `Commerce Disclosure` URL
- Dashboard 上の事業者情報
- statement descriptor 周辺

CLI の `audit` と `check-live-readiness` は、これらを `manualChecks` として返します。Codex は自動で「確認済み」とは扱いません。

## Makefile

```bash
make stripe-preflight    # npm run stripe:check-live-readiness -- --json（本番 Stripe の整合チェック）
```
