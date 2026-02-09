# Step 2: Stripe 本番設定

[← 目次に戻る](./PRODUCTION.md)

Stripe は Vercel (フロントエンド) 側のみで使用します。バックエンド (Railway) には Stripe 関連の設定は不要です。

---

## 2-1. Stripe アカウントの本番利用申請

https://dashboard.stripe.com/account/onboarding にアクセスし、以下の情報を入力します。

### ビジネス情報

| 項目 | 入力内容 |
|---|---|
| 事業形態 | 個人事業主 or 法人（該当するものを選択） |
| 業種 | 「ソフトウェア」 |
| 事業のウェブサイト | `https://shupass.jp` |
| 商品の説明 | 「就活支援 AI サービス。ES 添削・企業情報検索・スケジュール管理を提供」 |

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
| サポート用 URL | `https://shupass.jp` | — |

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

Stripe Dashboard → **商品カタログ** → **商品を追加**

> **重要**: テストモードで作成した商品は本番モードには引き継がれません。本番モードで新規に作成する必要があります。

### Standard プラン

| 設定 | 値 |
|---|---|
| 商品名 | `Standard プラン` |
| 説明 | `月300クレジット・企業30社・ES添削10回/月` |
| 価格 | ¥980 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、価格の詳細画面で **Price ID** (`price_...`) を控える → `STRIPE_PRICE_STANDARD_MONTHLY`

### Pro プラン

| 設定 | 値 |
|---|---|
| 商品名 | `Pro プラン` |
| 説明 | `月800クレジット・企業無制限・ES添削無制限` |
| 価格 | ¥2,980 / 月 (recurring) |
| 請求間隔 | 毎月 |

作成後、Price ID を控える → `STRIPE_PRICE_PRO_MONTHLY`

## 2-4. Webhook エンドポイントの設定

Stripe Dashboard → **開発者** → **Webhook** → **エンドポイントを追加**

| 設定 | 値 |
|---|---|
| Endpoint URL | `https://shupass.jp/api/webhooks/stripe` |
| バージョン | 最新の API バージョン |

**受信するイベント** (5 つ選択):

| イベント | トリガー | アプリ内の処理 |
|---|---|---|
| `checkout.session.completed` | ユーザーが決済完了 | サブスクリプション作成・プラン更新・クレジット付与 |
| `customer.subscription.updated` | プラン変更・更新 | プラン変更・クレジット再計算 |
| `customer.subscription.deleted` | サブスクリプション解約 | Free プランにダウングレード |
| `invoice.payment_succeeded` | 支払い成功（月次更新含む） | ステータスを active に復帰 |
| `invoice.payment_failed` | 支払い失敗 | ステータスを past_due に変更 |

作成後、**Signing Secret** (`whsec_...`) を控える → `STRIPE_WEBHOOK_SECRET`

## 2-5. カスタマーポータルの設定

Stripe Dashboard → **設定** → **Billing** → **カスタマーポータル**

以下を有効化:

| 機能 | 有効/無効 |
|---|---|
| 支払い方法の更新 | 有効 |
| サブスクリプションのキャンセル | 有効 |
| 請求履歴の表示 | 有効 |
| インボイスのダウンロード | 有効 |

**ビジネス情報**:

| 項目 | 値 |
|---|---|
| ビジネス名 | `就活Pass` |
| プライバシーポリシー URL | `https://shupass.jp/privacy` |
| 利用規約 URL | `https://shupass.jp/terms` |

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
