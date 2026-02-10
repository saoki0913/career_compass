# クレジット・課金機能

Free/Standard/Proプランに基づくクレジット管理と、Stripe連携による決済機能。

**参照実装**:
- `src/lib/credits/cost.ts` — クレジットコスト計算
- `src/lib/stripe/` — Stripe連携（config, client, index）
- `src/app/api/stripe/` — Stripe API
- `src/app/api/credits/route.ts` — クレジット残高API

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| **プラン** | Free / Standard / Pro |
| **課金方式** | 月額サブスクリプション（Stripe） |
| **クレジット** | 月次付与 + 消費制（成功時のみ消費） |
| **リセット** | JST基準（Asia/Tokyo）月次リセット |
| **無料利用** | 日次制限（`dailyFreeUsage`で管理） |

---

## 2. プラン比較

| 機能 | Free | Standard | Pro |
|------|------|----------|-----|
| 月次クレジット | 30 | 300 | 800 |
| ES添削 | 月3回（無料枠） | クレジット消費 | クレジット消費 |
| リライトスタイル | 3種（バランス/堅め/個性強め） | 8種（全スタイル） | 8種（全スタイル） |
| セクション添削 | 不可 | 可 | 可 |
| 企業RAG連携 | 不可 | 可 | 可 |
| ガクチカ素材数 | 3 | 10 | 20 |
| ゲスト | 2素材、制限機能 | — | — |

---

## 3. クレジット消費コスト

### ES添削

```
コスト = min(5, max(2, ceil(charCount / 800)))
```

| 文字数 | クレジット |
|--------|-----------|
| 〜800 | 2 |
| 〜1600 | 2 |
| 〜2400 | 3 |
| 〜3200 | 4 |
| 3201〜 | 5（上限） |

> 最低2クレジットで短文ESの収益性を確保。最大5クレジットで過大課金を防止。

### その他の機能

| 機能 | トランザクションタイプ | コスト |
|------|----------------------|--------|
| 企業情報フェッチ | `company_fetch` | 固定コスト |
| ガクチカ深掘り | `gakuchika` | 5問回答ごとに1クレジット |
| ガクチカES下書き | `gakuchika_draft` | 固定コスト |
| 志望動機Q&A | `motivation` | 固定コスト |
| 志望動機下書き | `motivation_draft` | 固定コスト |

---

## 4. ビジネスルール

### 成功時のみ消費

```typescript
const result = await operation();
if (result.success) {
  await consumeCredits(userId, cost);
}
// 失敗時はクレジットを消費しない
```

### 月次リセット

```
lastResetAt と現在時刻を比較（JST基準）
  → 月が変わっていればリセット
  → balance を monthlyAllocation にリセット
  → lastResetAt を更新
```

### 無料利用制限（`dailyFreeUsage`）

- 日付は JST の `YYYY-MM-DD` 形式
- `companyFetchCount` で企業情報フェッチ回数を追跡
- ユーザー/ゲスト別にXOR制約付き一意インデックス

---

## 5. Stripe連携

### 5.1 チェックアウトフロー

```
ユーザーがプラン選択
  ↓
POST /api/stripe/checkout
  → Stripe Customer 作成/取得
  → Stripe Checkout Session 作成
    - 月額/年額の選択
    - プロモーションコード対応
    - 請求先住所自動収集
  ↓
Stripe Checkout ページにリダイレクト
  → 決済完了
  ↓
Webhook: checkout.session.completed
  → subscriptions テーブル更新
  → credits テーブル初期化
```

### 5.2 カスタマーポータル

```
POST /api/stripe/portal
  → Stripe Customer Portal セッション作成
  → ポータルページにリダイレクト
  → プラン変更、カード更新、解約が可能
```

### 5.3 Webhookイベント処理

| イベント | 処理内容 |
|----------|---------|
| `checkout.session.completed` | サブスクリプション開始、クレジット付与 |
| `customer.subscription.updated` | プラン変更、クレジット配分更新 |
| `customer.subscription.deleted` | サブスクリプション終了、Freeプランに降格 |
| `invoice.payment_succeeded` | 決済成功、次月クレジット付与 |
| `invoice.payment_failed` | 決済失敗の通知 |

### 5.4 冪等性保証

`processedStripeEvents` テーブルで処理済みイベントIDを記録し、同じイベントの二重処理を防止。

---

## 6. DBテーブル

### `credits`（1ユーザー1レコード）

| カラム | 型 | 説明 |
|--------|-----|------|
| `balance` | `integer` | 現在の残高 |
| `monthlyAllocation` | `integer` | 月次付与量（Free: 30, Standard: 300, Pro: 800） |
| `partialCreditAccumulator` | `integer` | 端数蓄積用 |
| `lastResetAt` | `timestamptz` | 最終リセット日時 |

### `creditTransactions`（監査ログ）

| カラム | 型 | 説明 |
|--------|-----|------|
| `amount` | `integer` | 変動量（正: 付与、負: 消費） |
| `type` | `enum` | トランザクションタイプ（9種） |
| `referenceId` | `text` | 参照先ID（ドキュメントID等） |
| `description` | `text` | 説明 |
| `balanceAfter` | `integer` | 処理後残高 |

**トランザクションタイプ**: `monthly_grant`, `plan_change`, `company_fetch`, `es_review`, `gakuchika`, `gakuchika_draft`, `motivation`, `motivation_draft`, `refund`

### `subscriptions`（1ユーザー1レコード）

| カラム | 型 | 説明 |
|--------|-----|------|
| `stripeCustomerId` | `text` | Stripe顧客ID |
| `stripeSubscriptionId` | `text (UNIQUE)` | StripeサブスクリプションID |
| `stripePriceId` | `text` | Stripe価格ID |
| `status` | `text` | サブスクリプション状態 |
| `currentPeriodEnd` | `timestamptz` | 現在の課金期間終了日 |

### `processedStripeEvents`

- Webhook冪等性保証用テーブル
- イベントID重複チェックに使用

### `dailyFreeUsage`

| カラム | 型 | 説明 |
|--------|-----|------|
| `userId` / `guestId` | `text (FK)` | オーナー（XOR制約） |
| `date` | `text` | 日付（JST `YYYY-MM-DD`） |
| `companyFetchCount` | `integer` | 企業フェッチ回数 |

---

## 7. APIルート

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/credits` | クレジット残高取得 |
| POST | `/api/stripe/checkout` | Stripeチェックアウトセッション作成 |
| POST | `/api/stripe/portal` | Stripeカスタマーポータルセッション作成 |
| POST | `/api/webhooks/stripe` | Stripe Webhookハンドラ |
| GET | `/api/activation` | アクティベーション状態確認 |
| POST | `/api/checkout` | チェックアウト処理 |

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/lib/credits/cost.ts` | ES添削コスト計算（`calculateESReviewCost`） |
| `src/lib/credits/index.ts` | クレジット消費・残高管理 |
| `src/lib/stripe/config.ts` | Stripe設定（価格ID等） |
| `src/lib/stripe/client.ts` | Stripeクライアント初期化 |
| `src/lib/stripe/index.ts` | Stripe共通ユーティリティ |
| `src/app/api/credits/route.ts` | クレジット残高API |
| `src/app/api/stripe/checkout/route.ts` | チェックアウトAPI |
| `src/app/api/stripe/portal/route.ts` | カスタマーポータルAPI |
| `src/app/api/webhooks/stripe/route.ts` | WebhookハンドラAPI |
| `src/app/pricing/page.tsx` | 料金ページ |
| `src/lib/db/schema.ts` | DBスキーマ（`credits`, `creditTransactions`, `subscriptions`, `processedStripeEvents`, `dailyFreeUsage`） |
