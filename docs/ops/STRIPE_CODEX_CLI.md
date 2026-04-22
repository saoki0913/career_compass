# Stripe Codex CLI

Codex から Stripe の状態確認と定型同期を行うための CLI です。初期実装は `CLI-first` で、`test` と `live` の両環境を扱います。

## 方針

- 既定環境は `test`
- `--env live` を明示したときだけ本番キーを使う
- 商品 / Price / Webhook / Billing Portal は API 経由で同期する
- `Commerce Disclosure` や一部の事業者情報は Dashboard 手動確認を残す
- すべてのコマンドで `--json` を付けると Codex 向けの JSON を返す

## コマンド

```bash
npm run stripe:inspect -- --env test --json
npm run stripe:audit -- --env live --json
npm run stripe:sync-products -- --env test --dry-run --json
npm run stripe:sync-webhook -- --env live --json
npm run stripe:sync-portal -- --env live --dry-run --json
npm run stripe:check-live-readiness -- --json
```

## 認証

次の順でキーを解決します。

- `test`: `STRIPE_SECRET_KEY_TEST` → `STRIPE_TEST_SECRET_KEY` → `STRIPE_SECRET_KEY`
- `live`: `STRIPE_SECRET_KEY_LIVE` → `STRIPE_LIVE_SECRET_KEY` → `STRIPE_SECRET_KEY`

`test` で `sk_live_...`、`live` で `sk_test_...` を渡した場合は即失敗します。

## 自動同期の対象

- managed product `就活Pass Subscription`
- 4 Price
  - `STRIPE_PRICE_STANDARD_MONTHLY`
  - `STRIPE_PRICE_STANDARD_ANNUAL`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_ANNUAL`
- Webhook `https://www.shupass.jp/api/webhooks/stripe`
- Billing Portal の default 設定

## 手動確認が残る項目

- `Commerce Disclosure` URL
- Dashboard 上の事業者情報
- statement descriptor 周辺

CLI の `audit` と `check-live-readiness` は、これらを `manualChecks` として返します。Codex は自動で「確認済み」とは扱いません。
