---
topic: security-stripe
review_date: 2026-04-14
category: security
supersedes: null
status: active
---

# Stripe 決済セキュリティ詳細

**監査日**: 2026-04-14
**対象**: Stripe 決済統合、サブスクリプション管理、クレジットシステム

---

## Confirmed by code

### C-1: Stripe 未課金でのサーバサイド entitlement 拡大

**Impact**

認証済みユーザーが `/api/auth/plan` に `{ plan: "pro" }` を POST するだけで、Stripe 課金を経ずにサーバサイドの全 quota が Pro レベルに拡大される。

**追加リスク（CSRF 免除による外部トリガー可能性）**: `/api/auth/plan` は `/api/auth/` プレフィックスの下にあるため、`proxy.ts:40-44` の `CSRF_EXEMPT_PATHS` により Origin 検証と CSRF トークン検証の両方がスキップされる（`validateCsrf()` が line 127-129 で早期 return）。Better Auth の CSRF 保護は `[...all]/route.ts` 経由のリクエストにのみ適用され、`/api/auth/plan/route.ts` は独立した Next.js API ルートであるため Better Auth の保護対象外。

現時点での緩和策は Better Auth のセッション cookie が `SameSite: lax` であること。`lax` は cross-origin の POST リクエストではcookie を送信しないため、通常のブラウザ実装ではフォームベース CSRF は成立しない。ただし、これは SameSite の正しい実装に全面的に依存する防御であり、defense-in-depth の原則に反する。`/api/auth/plan` と `/api/auth/onboarding` は Better Auth 管理外のカスタムルートであるため、`CSRF_EXEMPT_PATHS` から除外するか、個別に CSRF トークン検証を実装すべき。

| リソース | free | pro（不正取得） | 倍率 |
|---------|------|----------------|------|
| 月次クレジット | 50 | 750 | 15x |
| RAG ソース上限 | 3 | 500 | 167x |
| RAG HTML ページ/月 | 20 | 500 | 25x |
| RAG PDF ページ/月 | 60 | 600 | 10x |
| スケジュール取得/月 | 10 | 200 | 20x |

**Evidence**

1. `src/app/api/auth/plan/route.ts:33-62` — `plan` を `VALID_PLANS` に含まれるか検証するだけで、Stripe `subscriptions.status` を確認しない
2. `src/lib/credits/shared.ts:36-39` `getUserPlan()` — `userProfiles.plan` をそのまま返し、Stripe subscription を参照しない
3. `src/lib/company-info/pricing.ts:7-32` — plan に基づく quota 定義（`MONTHLY_RAG_HTML_FREE_PAGES` 等）
4. `src/app/api/companies/[id]/fetch-corporate/route.ts:158` — `getCompanyRagSourceLimit(plan)` で RAG quota を決定

**Reproduction**

```bash
# 1. 認証済みセッションで POST
curl -X POST https://shupass.jp/api/auth/plan \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<valid_session>" \
  -H "X-CSRF-Token: <csrf_token>" \
  -d '{"plan": "pro"}'

# 2. 応答: {"success":true,"plan":"pro","message":"Plan set to pro"}
# 3. 以降の全 API で Pro quota が適用される
```

**Verification status**: Confirmed

**Recommendation**

`/api/auth/plan` で `plan !== "free"` の場合、`subscriptions` テーブルを確認し `status === "active"` かつ `stripePriceId` が要求されたプランに対応するかを検証する。

```typescript
if (plan !== "free") {
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);
  if (!sub) {
    return NextResponse.json({ error: "Active subscription required" }, { status: 403 });
  }
  const expectedPlan = getPlanFromPriceId(sub.stripePriceId);
  if (expectedPlan !== plan) {
    return NextResponse.json({ error: "Plan does not match subscription" }, { status: 403 });
  }
}
```

---

### C-2: Legacy checkout エンドポイント残存

**Impact**

UI からの参照はゼロだが、`/api/checkout` が HTTP POST で到達可能。クライアント送信の任意 `priceId` をバリデーションなしで Stripe `checkout.sessions.create()` に渡す。

**Evidence**

1. `src/app/api/checkout/route.ts:17` — `const { priceId } = await req.json()` で受け取り、l.19-33 でそのまま Stripe へ
2. 正規導線 `src/app/api/stripe/checkout/route.ts:41` は `getPriceId(plan, period)` でサーバ側 whitelist 解決
3. Codebase 全体で `/api/checkout` への参照ゼロ（grep 結果）

**Reproduction**

```bash
curl -X POST https://shupass.jp/api/checkout \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<valid_session>" \
  -d '{"priceId": "price_arbitrary_id"}'
# Stripe Checkout URL が返される
```

**Verification status**: Confirmed

**Recommendation**

`src/app/api/checkout/route.ts` を削除する。正規導線は `/api/stripe/checkout` で完結しており、このファイルは不要。削除が難しい場合は、priceId を環境変数定義の whitelist と照合するバリデーションを追加する。

---

## Design/ops concerns

### D-5: サブスクリプション解約後のアクセス

**Impact**

`currentPeriodEnd` まで利用を継続するのはサブスクリプションの標準仕様であり、脆弱性ではない。ただし、即時アクセス失効が必要なビジネス要件がある場合は別途対応が必要。

**Evidence**

- `src/app/api/webhooks/stripe/route.ts:178-208` — `customer.subscription.deleted` で `plan: "free"` に更新
- Stripe は `cancel_at_period_end` を設定した場合、期間終了まで subscription を active に保つ

**Verification status**: Confirmed（仕様通り）

**Recommendation**

現状はサブスク標準仕様に準拠しており対応不要。即時失効が必要な場合は、Webhook で `cancel_at_period_end` を検知し `plan` を即時ダウングレードするロジックを追加。

---

### D-6: Webhook metadata からのプラン判定

**Impact**

Webhook ハンドラが `session.metadata?.plan` を参照するが、署名検証済み webhook 内であり、かつ `getPlanFromPriceId(priceId)` による fallback がある。

**Evidence**

- `src/app/api/webhooks/stripe/route.ts:76` — `const newPlan = planFromMetadata || getPlanFromPriceId(priceId) || "standard"`
- Webhook は `stripe.webhooks.constructEvent()` で署名検証済み

**Verification status**: Confirmed（低リスク）

**Recommendation**

metadata への依存を削除し、常に `getPlanFromPriceId(priceId)` で決定することを推奨。metadata は非権限付与データ（ロギング・トレース用）に限定する。

---

### D-7: アカウント削除時の Stripe 解約失敗

**Impact**

Stripe 解約が失敗してもアカウント削除を続行するため、ユーザーの Stripe subscription が孤立し課金が継続するリスクがある。

**Evidence**

- `src/app/api/settings/account/route.ts:48-59` — `stripe.subscriptions.cancel()` の失敗を catch してログのみ、削除を続行

**Verification status**: Confirmed（設計判断）

**Recommendation**

選択肢A: 解約失敗時はアカウント削除を中断し、「先に Stripe ポータルで解約してください」とユーザーに通知する。
選択肢B: 現状維持し、定期的な orphan subscription 検出バッチで対応する。

---

## Integrity / Auditability

### A-1: クレジット残高の監査ログ整合性

**Impact**

`confirmReservation()` で `creditTransactions.balanceAfter` を更新する際、read→update が単一トランザクションでない。残高消費自体は `credits.balance` の SQL 制約で原子的に行われており、権限昇格や残高バイパスは発生しない。`balanceAfter` の会計トレース品質の問題。

**Evidence**

- `src/lib/credits/reservations.ts:105-118` — `confirmReservation()` 内で `getCreditRow()` で read した後、別クエリで `balanceAfter` を update（トランザクション外）

**Verification status**: Fixed (2026-04-16)

**Recommendation**

`confirmReservation()` を `db.transaction()` でラップし、read→update を原子的にする。会計監査の信頼性を向上させるが、緊急度は低い。

**Resolution (2026-04-16)**

`src/lib/credits/reservations.ts` の `confirmReservation()` を `db.transaction()`
でラップし、`getCreditRow()` (read) と `creditTransactions.balanceAfter` update
を同一トランザクション内で実行するようにした。既存の排他は `credits.balance`
の SQL 制約で成立していたためセキュリティ影響は元々なく、会計トレース品質の
向上が目的。関連テスト: `src/lib/credits/reservations.test.ts` の
`balanceAfter` 一貫性ケース。
