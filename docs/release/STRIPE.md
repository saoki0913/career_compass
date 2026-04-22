# Step 2: Stripe 本番設定

[← 目次に戻る](./PRODUCTION.md)

Stripe は Vercel (フロントエンド) 側のみで使用します。バックエンド (Railway) には Stripe 関連の設定は不要です。

特商法ページと `Commerce Disclosure` の整備は、[`INDIVIDUAL_BUSINESS_COMPLIANCE.md`](./INDIVIDUAL_BUSINESS_COMPLIANCE.md) を参照してください。

就活Pass の現行方針は `Harbor Works` を公開主体にし、`support@shupass.jp` をサポート窓口として固定しつつ、バーチャルオフィス住所は公開し、個人名は請求時開示とする運用です。Stripe 本番申請は、少なくともバーチャルオフィス契約と特商法ページ更新が終わってから始めてください。

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

1. バーチャルオフィスを契約する
2. 公開用住所が固まったら `/legal` に所在地を直接記載する
3. その後に Stripe 本番利用申請へ進む

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

公開面では `Harbor Works` とバーチャルオフィス住所を表示する一方、Stripe の本人確認では本名・生年月日・自宅住所の提出が必要になる可能性があります。これは Stripe 向けの非公開提出であり、`/legal` の公開文面とは分けて扱います。

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

`.env.local` に **`sk_live_...` のシークレットキー**（`STRIPE_SECRET_KEY`）を入れたうえで:

```bash
npm run stripe:bootstrap-live
```

次を本番 API で揃えます（冪等・既存があれば再利用・Webhook は URL 一致時はイベントだけ更新）。

- 商品 `就活Pass Subscription`（metadata `shupass_subscription=1`）と 4 Price（下表どおり）
- Webhook `https://www.shupass.jp/api/webhooks/stripe`（5 イベント）
- Customer Portal の**デフォルト設定**（支払い方法・プラン変更・キャンセル・請求履歴、規約/プライバシー URL、return URL `/settings`）

終了時に `STRIPE_PRICE_*` と（Webhook 新規時のみ）`STRIPE_WEBHOOK_SECRET` の追記用行が標準出力に出ます。`codex-company` の `vercel-production.env` バンドルへ反映し、`zsh scripts/release/sync-career-compass-secrets.sh --check` → `--apply` を実行してください。

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
| 公開主体 | `Harbor Works` |
| 所在地 | 契約したバーチャルオフィス住所 |
| サポートメール | `support@shupass.jp` |
| Commerce Disclosure URL | `https://www.shupass.jp/legal` |
| Terms URL | `https://www.shupass.jp/terms` |
| Privacy URL | `https://www.shupass.jp/privacy` |

`/legal` には、次の内容をページ本文に直接記載します。

1. `販売事業者: Harbor Works`
2. `所在地: 契約したバーチャルオフィス住所`
3. `メールアドレス: support@shupass.jp`
4. `運営責任者: 請求があった場合に遅滞なく開示`
5. `電話番号: 請求があった場合に遅滞なく開示`

就活Pass では、特商法ページの運営情報を環境変数で管理する前提にしません。公開文面はページに直接書く方針です。

### Stripe 本番申請前チェック

- [ ] バーチャルオフィスの契約有無を判断した
- [ ] `/legal` の公開主体が `Harbor Works` である
- [ ] `/legal` に所在地が直接記載されている
- [ ] サポート窓口が `support@shupass.jp` に統一されている
- [ ] `/pricing` `/terms` `/legal` の返金・解約方針が一致している
- [ ] 個人名と電話番号を請求時開示にする方針が固まっている

差し戻し時の対応順:

1. 電話番号の公開要否を確認し、必要なら事業用番号を追加する
2. `運営責任者` の表示要件を Stripe に確認する
3. 最後まで解決しない場合のみ個人名の表示方法を再判断する

### 手動（Dashboard）

Stripe Dashboard → **商品カタログ** → **商品を追加**

> **重要**: テストモードで作成した商品は本番モードには引き継がれません。本番モードで新規に作成する必要があります。

### 1商品に 4 recurring price を作成

Customer Portal で月額/年額の切替と downgrade を扱う前提のため、**商品は 1 つ**にまとめ、その配下に `Standard Monthly` / `Standard Annual` / `Pro Monthly` / `Pro Annual` の 4 price を作成します。

### Standard Monthly

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Subscription` |
| 説明 | `月100クレジット・企業無制限・選考50回/RAG100ページ無料枠（要約）` |
| 価格 | ¥1,490 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、価格の詳細画面で **Price ID** (`price_...`) を控える → `STRIPE_PRICE_STANDARD_MONTHLY`

### Standard Annual

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Subscription` |
| 説明 | `月100クレジット・企業無制限・選考50回/RAG100ページ無料枠（年額）` |
| 価格 | ¥14,900 / 年 (recurring) |
| 請求間隔 | 毎年 |

作成後、Price ID を控える → `STRIPE_PRICE_STANDARD_ANNUAL`

### Pro Monthly

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Subscription` |
| 説明 | `月300クレジット・企業無制限・選考150回/RAG300ページ無料枠（要約）` |
| 価格 | ¥2,980 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、Price ID を控える → `STRIPE_PRICE_PRO_MONTHLY`

### Pro Annual

| 設定 | 値 |
|---|---|
| 商品名 | `就活Pass Subscription` |
| 説明 | `月300クレジット・企業無制限・選考150回/RAG300ページ無料枠（年額）` |
| 価格 | ¥29,800 / 年 (recurring) |
| 請求間隔 | 毎年 |

作成後、Price ID を控える → `STRIPE_PRICE_PRO_ANNUAL`

## 2-4. Webhook エンドポイントの設定

Stripe Dashboard → **開発者** → **Webhook** → **エンドポイントを追加**

| 設定 | 値 |
|---|---|
| Endpoint URL | `https://www.shupass.jp/api/webhooks/stripe` |
| バージョン | 最新の API バージョン |

**受信するイベント** (5 つ選択):

| イベント | トリガー | アプリ内の処理 |
|---|---|---|
| `checkout.session.completed` | ユーザーが決済完了 | サブスクリプション作成・プラン更新・クレジット付与 |
| `customer.subscription.updated` | プラン変更・更新 | プラン反映・`cancel_at_period_end` 同期 |
| `customer.subscription.deleted` | サブスクリプション解約 | Free プランにダウングレード |
| `invoice.payment_succeeded` | 支払い成功（月次更新含む） | ステータスを active に復帰（クレジット再付与なし） |
| `invoice.payment_failed` | 支払い失敗 | ステータスを past_due に変更 |

作成後、**Signing Secret** (`whsec_...`) を控える → `STRIPE_WEBHOOK_SECRET`

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
```

各イベントでアプリ内の処理が正常に動作することを確認:
- [ ] `checkout.session.completed` → サブスクリプション作成・プラン更新
- [ ] `customer.subscription.updated` → プラン変更反映
- [ ] `customer.subscription.deleted` → Free プランにダウングレード
- [ ] `invoice.payment_failed` → ステータスが `past_due` に変更
- [ ] `invoice.payment_succeeded` → ステータスが `active` に復帰

## 2-7. テストカードでの決済テスト

テストモードで以下のカード番号を使用:

| カード番号 | 結果 |
|---|---|
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0002` | カード拒否 |
| `4000 0000 0000 3220` | 3D セキュア認証必須 |

- 有効期限: 未来の任意の日付（例: 12/34）
- CVC: 任意の 3 桁（例: 123）
