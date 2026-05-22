# Step 2: Stripe 本番設定

[← インデックス](../README.md)

Stripe は Vercel (フロントエンド) 側のみで使用します。バックエンド (Railway) には Stripe 関連の設定は不要です。

特商法ページと `Commerce Disclosure` の整備は、[`INDIVIDUAL_BUSINESS_COMPLIANCE.md`](./INDIVIDUAL_BUSINESS_COMPLIANCE.md) を参照してください。

就活Pass の現行方針は、Stripe 審査で求められた `運営責任者` を個人名で公開し、`support@shupass.jp` をサポート窓口として固定しつつ、所在地と電話番号は請求時開示とする運用です。

---

## 2-1. Stripe アカウントの本番利用申請

https://dashboard.stripe.com/account/onboarding にアクセスし、以下の情報を入力します。

### ビジネス情報

| 項目 | 入力内容 |
|---|---|
| 事業形態 | 個人事業主 or 法人（該当するものを選択） |
| 業種 | 「ソフトウェア」 |
| 事業のウェブサイト | `https://www.shupass.jp` |
| 商品の説明 | 「就活支援 AI サービス。ES 添削・企業情報検索・スケジュール管理を提供」 |

就活Pass の現時点の順序:

1. `/legal` に販売事業者名・運営責任者名・請求時開示文言を直接記載する
2. 所在地と電話番号の開示請求に遅滞なく返信できる運用を用意する
3. Stripe Dashboard の本人確認・サポート連絡先・Commerce Disclosure URL を設定する
4. Stripe から追加で公開を求められた場合のみ、バーチャルオフィス住所や事業用電話番号を再検討する

### 申請者（個人）の本人確認

| 項目 | 入力内容 |
|---|---|
| 氏名（漢字） | 登記名 or 本名 |
| 氏名（ローマ字） | パスポート表記に準拠 |
| 生年月日 | — |
| 自宅住所 | — |
| 電話番号 | — |
| 本人確認書類 | 運転免許証 / マイナンバーカード / パスポートのいずれか（写真アップロード） |

> **注意**: 法人の場合は登記簿謄本（履歴事項全部証明書）の提出が必要になる場合があります。

### 明細書表記（Statement Descriptor）

顧客のクレジットカード明細に表示される名称です。

| 項目 | 設定値 | 備考 |
|---|---|---|
| 明細書表記（漢字） | `就活Pass` | カード明細に表示 |
| 明細書表記（ローマ字） | `SHUPASS` | 5〜22文字、英数字のみ |
| 短縮表記 | `SHUPASS` | 一部カード会社で使用 |
| サポート用メールアドレス | `support@shupass.jp` | 請求に関する問い合わせ先 |
| サポート用電話番号 | — | 任意 |
| サポート用 URL | `https://www.shupass.jp` | — |

公開面では販売事業者名と運営責任者名に個人名を表示する一方、Stripe の本人確認では生年月日・自宅住所の提出が必要になる可能性があります。これは Stripe 向けの非公開提出であり、`/legal` の公開文面とは分けて扱います。

### 銀行口座（売上の入金先）

| 項目 | 入力内容 |
|---|---|
| 銀行名 | — |
| 支店名 | — |
| 口座種別 | 普通 or 当座 |
| 口座番号 | — |
| 口座名義 | 本人名義であること |

> 入金サイクル: Stripe Japan のデフォルトは**週次**（毎週金曜日に前週分を入金）。
> Dashboard → Settings → Payouts で変更可能。

### セキュリティ設定

| 項目 | 推奨設定 |
|---|---|
| 2段階認証 | **必ず有効化**（SMS or 認証アプリ） |
| パスワード | Stripe 専用の強力なパスワード |

## 2-2. 本番 API キーの取得

申請が承認されたら（通常 1〜3 営業日）:

1. Stripe Dashboard → **開発者** → **API キー**
2. **テストモード** トグルを **OFF** にして本番モードに切り替え
3. 以下のキーを控える:

| キー | 形式 | 用途 |
|---|---|---|
| 公開可能キー | `pk_live_...` | フロントエンド（ブラウザ）から Stripe.js に渡す |
| シークレットキー | `sk_live_...` | サーバーサイドから Stripe API を呼ぶ |

> **重要**: シークレットキーは一度しか表示されません。安全に保管してください。
> テスト中は `pk_test_` / `sk_test_` を使い、本番申請完了後に `pk_live_` / `sk_live_` に切り替えます。

## 2-3. 本番用の商品・価格を作成

### 自動（推奨）

本番 Stripe key は `.env.local` に置かず、一時プロセス env または canonical secrets bundle のみから渡します:

```bash
STRIPE_SECRET_KEY_LIVE=<sk_live_...> npm run stripe:bootstrap-live
```

次を本番 API で揃えます（冪等・既存があれば再利用・Webhook は URL 一致時はイベントだけ更新）。

- 商品 `就活Pass Standard` / `就活Pass Pro`（metadata `shupass_plan=standard|pro`）と 4 Price（下表どおり）
- Webhook `https://www.shupass.jp/api/webhooks/stripe`（8 イベント）
- Customer Portal の**デフォルト設定**（支払い方法・プラン変更・キャンセル・請求履歴、規約/プライバシー URL、return URL `/settings`）

終了時に `STRIPE_PRICE_*` の追記用行が標準出力に出ます。Webhook 新規作成時の `STRIPE_WEBHOOK_SECRET` 値は標準出力に出さず、Stripe Dashboard で確認して repo local `.secrets/production/nextjs.env` の `STRIPE_WEBHOOK_SECRET` へ反映してください（secret bundle の正本は repo local `.secrets/`。解決順は [operations/production/SECRETS_MANAGEMENT.md](../../operations/production/SECRETS_MANAGEMENT.md) を参照）。その後 `zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production` → `zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production` を実行します。

> **注意**: Stripe CLI のプロファイルが `rk_live_...`（制限付きキー）だけの場合、`stripe ... --live` が応答しないことがあります。ブートストラップは **`sk_live_` を `STRIPE_SECRET_KEY` に渡す**想定です。

### Commerce Disclosure / サポート（Dashboard）

API でカバーできない項目は Dashboard で登録します。

| 項目 | 推奨値 |
|---|---|
| Commerce / 特商法（Commercial disclosure） | `https://www.shupass.jp/legal` |
| プライバシー | `https://www.shupass.jp/privacy`（ポータル設定でも指定済み） |
| 利用規約 | `https://www.shupass.jp/terms`（ポータル設定でも指定済み） |
| サポートメール | `support@shupass.jp` |
| サポート URL | `https://www.shupass.jp/contact`（またはサイト上の問い合わせ導線） |

（設定場所は Dashboard のレイアウト変更により異なる場合があります。**設定**内の事業者情報・Compliance・Customer portal 周辺を確認してください。）

就活Pass では、最初に次を固定します。

| 項目 | 値 |
|---|---|
| 公開主体 | `青木 駿介` |
| 所在地 | 請求時開示 |
| サポートメール | `support@shupass.jp` |
| Commerce Disclosure URL | `https://www.shupass.jp/legal` |
| Terms URL | `https://www.shupass.jp/terms` |
| Privacy URL | `https://www.shupass.jp/privacy` |

`/legal` には、次の内容をページ本文に直接記載します。

1. `販売事業者: 青木 駿介`
2. `所在地: 請求があった場合、購入申込み前に遅滞なく電子メールにて開示`
3. `メールアドレス: support@shupass.jp`
4. `運営責任者: 青木 駿介`
5. `電話番号: 請求があった場合、購入申込み前に遅滞なく電子メールにて開示`

就活Pass では、特商法ページの運営情報を環境変数で管理する前提にしません。公開文面はページに直接書く方針です。

### Stripe 本番申請前チェック

- [ ] `/legal` の販売事業者と運営責任者が `青木 駿介` である
- [ ] `/legal` の所在地と電話番号が請求時開示である
- [ ] サポート窓口が `support@shupass.jp` に統一されている
- [ ] `/pricing` `/terms` `/legal` の返金・解約方針が一致している
- [ ] 所在地と電話番号の請求があった場合に遅滞なく開示できる運用がある

差し戻し時の対応順:

1. 電話番号の公開要否を確認し、必要なら事業用番号を追加する
2. 所在地の公開要否を確認し、必要ならバーチャルオフィス住所を追加する
3. Stripe 審査用に所在地・電話番号を非公開提出できるか確認する

### 手動（Dashboard）

Stripe Dashboard → **商品カタログ** → **商品を追加**

> **重要**: テストモードで作成した商品は本番モードには引き継がれません。本番モードで新規に作成する必要があります。

### 2商品に各 2 recurring price を作成

現行の正本は `src/lib/stripe/managed-config.json` です。**商品は Standard / Pro の 2 つ**に分け、それぞれに月額・年額の 2 price を作成します。Customer Portal は 2 Product 構成で interval 重複を避けます。

### Standard Monthly

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Standard` |
| 説明 | `就活Pass Standard（月額）` |
| 価格 | ¥1,490 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、価格の詳細画面で **Price ID** (`price_...`) を控える → `STRIPE_PRICE_STANDARD_MONTHLY`

### Standard Annual

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Standard` |
| 説明 | `就活Pass Standard（年額）` |
| 価格 | ¥14,900 / 年 (recurring) |
| 請求間隔 | 毎年 |

作成後、Price ID を控える → `STRIPE_PRICE_STANDARD_ANNUAL`

### Pro Monthly

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Pro` |
| 説明 | `就活Pass Pro（月額）` |
| 価格 | ¥2,980 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、Price ID を控える → `STRIPE_PRICE_PRO_MONTHLY`

### Pro Annual

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Pro` |
| 説明 | `就活Pass Pro（年額）` |
| 価格 | ¥29,800 / 年 (recurring) |
| 請求間隔 | 毎年 |

作成後、Price ID を控える → `STRIPE_PRICE_PRO_ANNUAL`

## 2-4. Webhook エンドポイントの設定

Stripe Dashboard → **開発者** → **Webhook** → **エンドポイントを追加**

| 設定 | 値 |
|---|---|
| Endpoint URL | `https://www.shupass.jp/api/webhooks/stripe` |
| バージョン | 最新の API バージョン |

**受信するイベント** (8 つ選択):

| イベント | トリガー | アプリ内の処理 |
|---|---|---|
| `checkout.session.completed` | ユーザーが決済完了 | サブスクリプション作成・プラン更新・クレジット付与 |
| `customer.subscription.updated` | プラン変更・更新 | プラン反映・`cancel_at_period_end` 同期 |
| `customer.subscription.deleted` | サブスクリプション解約 | Free プランにダウングレード |
| `invoice.payment_succeeded` | 支払い成功（月次更新含む） | ステータスを active に復帰（クレジット再付与なし） |
| `invoice.payment_failed` | 支払い失敗 | ステータスを past_due に変更 |
| `charge.refunded` | 返金 | 全額返金は Free 降格、部分返金は通知のみ |
| `charge.dispute.created` | 支払い異議申し立て発生 | billing hold を設定し、AI クレジット消費を停止 |
| `charge.dispute.closed` | 支払い異議申し立て終了 | won は hold 解除、lost は Free 降格 |

作成後、**Signing Secret** (`whsec_...`) を控える → repo local `.secrets/production/nextjs.env` の `STRIPE_WEBHOOK_SECRET`

テストモードの remote Webhook は `https://stg.shupass.jp/api/webhooks/stripe` を正本にします。`*.vercel.app/api/webhooks/stripe` のような Preview URL は一時的に動いても失効しやすいため、Stripe Dashboard に登録しません。ローカル検証は `stripe listen --forward-to localhost:3000/api/webhooks/stripe` のみを使います。

Vercel production だけに反映する場合:

```bash
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production --vercel-env production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production
```

## 2-5. カスタマーポータルの設定

Stripe Dashboard → **設定** → **Billing** → **カスタマーポータル**

以下を有効化:

| 機能 | 有効/無効 |
|---|---|
| 支払い方法の更新 | 有効 |
| サブスクリプションのキャンセル | 有効 |
| サブスクリプションの変更 | 有効 |
| 請求履歴の表示 | 有効 |
| インボイスのダウンロード | 有効 |

**ビジネス情報**:

| 項目 | 値 |
|---|---|
| ビジネス名 | `就活Pass` |
| プライバシーポリシー URL | `https://www.shupass.jp/privacy` |
| 利用規約 URL | `https://www.shupass.jp/terms` |

## 2-6. Webhook のテスト

本番キーを設定する前に、テストモードで動作確認:

```bash
# Stripe CLI をインストール
brew install stripe/stripe-cli/stripe

# ログイン
stripe login

# ローカルに Webhook を転送
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# 別ターミナルでテストイベント送信
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe trigger invoice.payment_succeeded
stripe trigger charge.refunded
stripe trigger charge.dispute.created
stripe trigger charge.dispute.closed
```

各イベントでアプリ内の処理が正常に動作することを確認:
- [ ] `checkout.session.completed` → サブスクリプション作成・プラン更新
- [ ] `customer.subscription.updated` → プラン変更反映
- [ ] `customer.subscription.deleted` → Free プランにダウングレード
- [ ] `invoice.payment_failed` → ステータスが `past_due` に変更
- [ ] `invoice.payment_succeeded` → ステータスが `active` に復帰
- [ ] `charge.refunded` → 全額返金は Free 降格、部分返金は通知のみ
- [ ] `charge.dispute.created` → billing hold で AI クレジット消費停止
- [ ] `charge.dispute.closed` → won は hold 解除、lost は Free 降格

## 2-7. テストカードでの決済テスト

テストモードで以下のカード番号を使用:

| カード番号 | 結果 |
|---|---|
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0002` | カード拒否 |
| `4000 0000 0000 3220` | 3D セキュア認証必須 |

- 有効期限: 未来の任意の日付（例: 12/34）
- CVC: 任意の 3 桁（例: 123）

## 本番運用 env チェック

Stripe 本番稼働で必須の env は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../../operations/platform/ENVIRONMENT_VARIABLES.md) の Vercel セクションを正本にします。この文書では変数カタログを複製しません。

確認は `make stripe-preflight`。

## 2-8. Preflight Check（make stripe-preflight）

本番デプロイ前に Stripe アカウントの整合チェックを行います。

```bash
make stripe-preflight
```

チェック内容:
- Product / Price が managed-config.json と一致するか
- Webhook エンドポイントが正しく設定されているか
- Customer Portal の設定が一致するか
- Account の business profile / statement descriptor の整合
- Commerce Disclosure URL（手動確認項目として出力）

`readiness: "ready"` が返れば OK。`manual_review_required` の場合は `manualChecks` の内容を Dashboard で確認してください。

## 2-9. 個別同期スクリプトと運用

### Stripe シークレットキーの解決順序

`stripe:bootstrap-live` などの本番スクリプトのキー解決順序（`scripts/stripe/core.mjs` の `resolveStripeSecretKey`）:

1. `STRIPE_SECRET_KEY_LIVE`
2. `STRIPE_LIVE_SECRET_KEY`
3. `STRIPE_SECRET_KEY`

最初に見つかった `sk_live_` プレフィックス付きのキーが使われる。テスト環境と混在させないため `STRIPE_SECRET_KEY_LIVE` を推奨する。

### 個別スクリプト（段階実行 / dry-run）

一括 `stripe:bootstrap-live` の代わりに個別実行できる。各スクリプトは冪等で、既存リソースがあれば差分だけ更新する。

```bash
npm run stripe:sync-products -- --target production --dry-run --json
npm run stripe:sync-webhook  -- --target production --dry-run --json
npm run stripe:sync-portal   -- --target production --dry-run --json
```

| オプション | 説明 |
|---|---|
| `--target production` | Stripe live + `https://www.shupass.jp` を対象 |
| `--target staging` | Stripe test + `https://stg.shupass.jp` を対象 |
| `--env live` / `--env test` | 環境を明示（デフォルト `test`） |
| `--dry-run` | 変更せず計画だけ出力 |
| `--json` | JSON 形式で出力 |

`--target` を優先して使う。Preview URL (`*.vercel.app/api/webhooks/stripe`) は remote Webhook として登録しない。

### Vercel 同期メタキー

`.secrets/production/nextjs.env` の Stripe 7 値に加え、Vercel 同期用メタキー `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` が production bundle に必要。欠けている場合、`--check` は Stripe env の差分確認前に停止する。

### readiness 判定ロジック

`check-live-readiness` は 3 段階で判定する（`scripts/stripe/check-live-readiness.mjs`）:

| readiness | 条件 |
|---|---|
| `ready` | 全自動チェック OK かつ手動チェック項目なし |
| `manual_review_required` | 全自動チェック OK だが手動確認が必要な項目あり |
| `not_ready` | 自動チェックで不合格項目あり |

### 検証・監査・モニタリング

```bash
npm run stripe:check-live-readiness -- --json   # readiness: "ready" を確認
npm run stripe:audit -- --target production --json   # ok: true を確認
npm run stripe:inspect -- --target production --json # Product/Price/Webhook/Portal 一覧

# 本番モニタリング
stripe listen --live
stripe logs tail --live
npm run stripe:audit -- --env live --json   # CI / cron 推奨
```

> **重要**: Terms of Service URL が未設定の場合、Stripe Checkout が 400 エラーを返す。本番デプロイ前に Dashboard → Settings → Public details で設定すること。

### ロールバック計画

> **注意**: 本番で `sk_test_*` を使うロールバックは禁止。`validateStripePriceConfig()` の production hard gate がサーバー起動をブロックする。

| 対象 | 手順 |
|---|---|
| Products / Prices | Dashboard で Archive → `stripe:sync-products -- --target production` で再作成 → env 更新 |
| Webhook | Dashboard で削除 → `stripe:sync-webhook -- --target production` で再作成 → env 更新 |
| Portal 設定 | `stripe:sync-portal -- --target production` で再同期 |
| 課金一時停止 | 全 Price を Archive → 「メンテナンス中」表示 → 復旧時に `stripe:sync-products` で再作成 |
| 緊急時（全面停止） | Vercel で `STRIPE_SECRET_KEY` を削除 → Checkout/Portal API が 500 → 復旧時にキー再設定 |
