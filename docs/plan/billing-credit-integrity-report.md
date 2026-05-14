# 課金・クレジット整合性 リスク評価レポート

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


> **作成日**: 2026-05-04
> **ステータス**: ✅ 完了
> **対象**: career_compass (就活Pass) クレジットシステム全体
> **成果物**: リスク評価レポート（再現シナリオ・影響度・発生確率・修正方向性）
> **調査手法**: security-auditor × 2、code-reviewer × 1、database-engineer × 1 の4サブエージェントによる並列深掘り調査

---

## 完了条件

以下の全条件を満たした時点でレポート完了とする:

1. ✅ **4カテゴリ全ての深掘り調査完了** — 各カテゴリで根本原因・再現シナリオ・影響範囲が明文化されている
2. ✅ **リスクマトリクス作成** — 全問題に対して影響度(Severity) × 発生確率(Likelihood) の評価が付与されている
3. ✅ **修正方向性の提示** — 各問題に対して概要レベルの修正アプローチが記述されている
4. ✅ **優先順位付け** — 全問題が対応優先度順にランク付けされている
5. ✅ **現行コードの具体的参照** — 各問題がファイルパス・行番号レベルで根拠付けされている

---

## タスクリスト

| # | タスク | 担当 | 状態 | 備考 |
|---|--------|------|------|------|
| 1 | 並行性・Race Condition 深掘り調査 | security-auditor | ✅ 完了 | 8件検出（Critical 2, High 2, Medium 2, Low 1, Safe 1） |
| 2 | Stripe Webhook 整合性 深掘り調査 | security-auditor | ✅ 完了 | 8件検出（High 1, Medium 4, Low 3） |
| 3 | 予約ライフサイクル管理 深掘り調査 | code-reviewer | ✅ 完了 | 6件検出（High 2, Medium 3, Low 2）+ 安全確認7件 |
| 4 | 残高監査・照合メカニズム 深掘り調査 | database-engineer | ✅ 完了 | 6件検出（Critical 2, High 1, Medium 3） |
| 5 | リスクマトリクス統合 | orchestrator | ✅ 完了 | 重複排除後17件 |
| 6 | 修正方向性・優先順位策定 | orchestrator | ✅ 完了 | P0: 3件、P1: 4件、P2: 6件、P3: 4件 |
| 7 | 最終レポート執筆 | orchestrator | ✅ 完了 | |

---

## エグゼクティブサマリー

クレジットシステムの**コア消費パス**（`UPDATE ... WHERE balance >= amount`）は PostgreSQL の行ロックにより正しく直列化されており、二重消費は防止されている。しかし、コア以外の周辺操作に **17件の独立した問題** を検出した。

- **Critical（即時対応）**: 2件 — 監査ログ喪失リスク、無料枠バイパス
- **High（1週間以内）**: 4件 — クレジット不正生成、孤立予約永久ロック、確認失敗時の残高固定
- **Medium（1ヶ月以内）**: 7件 — 支払い失敗時のアクセス継続、返金/チャージバック未処理、サイレント消費失敗
- **Low（改善推奨）**: 4件 — 監査ログ重複、テーブル肥大化、戻り値情報不足

**金銭的影響の方向性**: Reserve-Confirm パターンの失敗は常に**ユーザー不利**（残高減少 + サービス未提供）、Direct-Consume パターンの失敗は常に**ユーザー有利**（サービス提供 + 残高未消費）。

**安全が確認された設計**: Stripe webhook べき等性（`processedStripeEvents`）、`cancelReservation` の CAS パターン（二重返金防止）、SSE ストリームの `onFinally` チェーン（ES Review / Interview）。

### 実装完了状況（2026-05-14 検証済み）

全 17 件の BCI 項目を修正完了した。以下は最終実装状態の検証結果である。

#### P0（即時対応）

- **BCI-01** [Verified Fixed]: `consumeCredits` / `reserveCredits` は `db.transaction()` 内で UPDATE + INSERT を実行する。`src/lib/credits/reservations.ts:71-129` (consumeCredits), `:155-218` (reserveCredits)。
- **BCI-02** [Verified Fixed]: RAG monthly usage は `FOR UPDATE` + SQL atomic increment (`col = col + N`) で更新する。credit 層の transaction と billing block check を統合済み。
- **BCI-03** [Verified Fixed]: `updatePlanAllocationCoreTx` は delta-based 更新 (`balance = balance + (newAllocation - oldAllocation)`) を使用する。`src/lib/credits/monthly-reset.ts:147-222`。

#### P1（1 週間以内）

- **BCI-04** [Verified Fixed]: `grantMonthlyCredits` は `amount = nextBalance - previousBalance` で差分値を記録する。`src/lib/credits/monthly-reset.ts:82-131`。CTE で `previous_balance` を取得し、差分を `creditTransactions.amount` に反映する。
- **BCI-05** [Fixed]: `cleanupExpiredReservations(cutoffMinutes)` を `src/lib/credits/reservations.ts:315-348` に追加。`src/app/api/cron/billing-maintenance/route.ts` が 30 分 TTL で定期実行する。バッチ上限 100 件/回。
- **BCI-06** [Fixed]: `src/bff/gakuchika/[id]/generate-es-draft/route.ts` で `confirmReservation` 失敗時に `cancelReservation(reservationId)` を呼ぶ（line 419）。motivation-draft パターンを踏襲。
- **BCI-07** [Fixed]: `updatePlanAllocationCoreTx` を webhook トランザクション内で呼ぶ。`src/lib/stripe/webhook-handlers.ts` の全ハンドラ（checkout: 299, subscription.updated: 345/374, downgrade: 121, restore: 181）が `db.transaction()` 内から `updatePlanAllocationCoreTx(tx, ...)` を使用。

#### P2（1 ヶ月以内）

- **BCI-08** [Verified Fixed]: `initializeCreditsTx` は `onConflictDoNothing({ target: credits.userId })` を使用。`src/lib/credits/monthly-reset.ts:55`。
- **BCI-09** [Verified Fixed]: `getOrCreateMonthlyUsage` は `onConflictDoNothing` + re-SELECT パターンを使用。`src/lib/company-info/usage.ts:90-128`。safety comment 追加済み。
- **BCI-10** [Verified Fixed]: `creditConsumptionAllowedSql` が `reserveCredits` / `consumeCredits` の WHERE 句に組み込まれ、`past_due` / `unpaid` / `paused` / `incomplete` / `incomplete_expired` + dispute billing hold を fail-closed で検査する。`src/lib/credits/shared.ts:83-106`。
- **BCI-11** [Verified Fixed]: `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` の 3 イベントに対応する webhook ハンドラ (`handleChargeRefunded`, `handleDisputeCreated`, `handleDisputeClosed`) を実装。全額返金は Free 降格 + 通知、部分返金は通知のみ、dispute 中は `billingHoldStatus = "dispute"` で credit 消費停止。`src/lib/stripe/webhook-handlers.ts:404-674`。
- **BCI-12** [Fixed]: webhook ハンドラを `src/lib/stripe/webhook-handlers.ts` に抽出し、DB mutations を単一 `db.transaction()` で囲む。旧 monolith route (876 行) は dispatch + idempotency (126 行) のみに縮小。
- **BCI-13** [Fixed]: BFF routes 8 箇所で `console.error` を `logError` に置換済み。注: `src/app/(product)/settings/page.tsx:160` に 1 箇所 `console.error` が残存（BFF route ではないが改善推奨）。

#### P3（改善推奨）

- **BCI-14** [Fixed]: `grantMonthlyCredits` の CTE で `WHERE to_char(last_reset_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') <> monthKey` を用いた CAS 化済み。`src/lib/credits/monthly-reset.ts:87-106`。`src/lib/credits/balance.ts:13` に TOCTOU safety comment 追加。
- **BCI-15** [Verified Fixed]: スケジュール取得の無料枠は SQL atomic increment で confirm する。`src/lib/credits/balance.ts:13` の TOCTOU safety comment で optimistic precheck + atomic confirm パターンを明文化。
- **BCI-16** [Fixed]: `src/app/api/cron/billing-maintenance/route.ts` が `processedStripeEvents` の TTL cleanup を実行する。succeeded: 90 日、failed: 180 日。バッチ上限: succeeded 1000 件、failed 500 件。`ctid IN (SELECT ... LIMIT)` で安全にバッチ削除。
- **BCI-17** [Fixed]: `confirmReservation` は `{ confirmed: boolean }` を返す (`src/lib/credits/reservations.ts:221-253`)。`cancelReservation` は `{ canceled: boolean, refundedAmount: number }` を返す (`src/lib/credits/reservations.ts:255-311`)。

---

## リスクマトリクス

| ID | 問題名 | カテゴリ | 影響度 | 発生確率 | スコア | 優先度 |
|----|--------|----------|--------|----------|--------|--------|
| BCI-01 | consumeCredits/reserveCredits 非トランザクション | A+D | Critical | Medium | **C×M** | **P0** |
| BCI-02 | RAG Usage Lost Update（無料枠バイパス） | A | Critical | Medium | **C×M** | **P0** |
| BCI-03 | updatePlanAllocation 絶対値上書き（クレジット不正生成） | A | High | Low | H×L | **P0** |
| BCI-04 | grantMonthlyCredits 絶対値記録（照合不能） | D | High | High | H×H | **P1** |
| BCI-05 | 予約 TTL / 自動回収機構の不在 | C | High | Medium | H×M | **P1** |
| BCI-06 | Gakuchika ES Draft confirm 失敗時 cancel 未実行 | C | High | Low | H×L | **P1** |
| BCI-07 | Webhook 内 updatePlanAllocation トランザクション外 | A+B | Medium | Medium | M×M | **P1** |
| BCI-08 | initializeCredits 二重作成（500エラー） | A+D | Medium | Medium | M×M | **P2** |
| BCI-09 | Monthly Usage get-or-create 競合（500エラー） | A | Medium | Medium | M×M | **P2** |
| BCI-10 | past_due 状態でのクレジット利用継続 | B | Medium | Medium | M×M | **P2** |
| BCI-11 | refund/chargeback Webhook 未処理 | B | Medium | Low | M×L | **P2** |
| BCI-12 | subscription.updated 非トランザクション | B | Medium | Low | M×L | **P2** |
| BCI-13 | Direct-Consume confirm 失敗サイレント | C+D | Medium | Low | M×L | **P2** |
| BCI-14 | 月次リセット二重実行（監査ログ重複） | A | Low | Medium | L×M | **P3** |
| BCI-15 | スケジュール取得無料枠 Off-by-one | A | Low | Low | L×L | **P3** |
| BCI-16 | processedStripeEvents TTL/クリーンアップ不在 | B | Low | High | L×H | **P3** |
| BCI-17 | confirm/cancel 戻り値情報不足 | C | Low | N/A | L | **P3** |

---

## 問題詳細

### P0: 即時対応（Critical / High + 高影響）

---

#### BCI-01: consumeCredits / reserveCredits が db.transaction() 外で実行

- **カテゴリ**: A (並行性) + D (残高監査)
- **影響度**: Critical
- **発生確率**: Medium（一時的 DB 接続障害時に発生）
- **根本原因**: `consumeCredits()` と `reserveCredits()` の両方で、`credits` テーブルの UPDATE と `creditTransactions` テーブルの INSERT が独立した2つの DB 呼び出しとして実行されている。`db.transaction()` で囲まれていないため、UPDATE が成功した後に INSERT が失敗すると、ユーザーの残高は減少するが監査ログは記録されない。
- **該当コード**:
  - `src/lib/credits/reservations.ts:20-27` (consumeCredits の UPDATE)
  - `src/lib/credits/reservations.ts:43-52` (consumeCredits の INSERT — トランザクション外)
  - `src/lib/credits/reservations.ts:66-73` (reserveCredits の UPDATE)
  - `src/lib/credits/reservations.ts:91-100` (reserveCredits の INSERT — トランザクション外)
- **再現シナリオ**:
  - 前提: ユーザー残高 = 50 credits
  - T=0ms: ES Review リクエスト。`reserveCredits()` の UPDATE 成功 → balance = 44
  - T=5ms: DB 接続プールが一時的に枯渇
  - T=6ms: INSERT creditTransactions が接続タイムアウトで失敗
  - 結果: `credits.balance = 44`（6 credits 減少）だが `creditTransactions` に記録なし。`[Reserved]` 行が存在しないため `cancelReservation()` も機能しない。クレジット永久消失。
- **影響**:
  - ユーザーのクレジットが不可逆的に消失（返金不能）
  - `SUM(creditTransactions.amount)` と `credits.balance` の不整合が蓄積
  - 運用チームが不整合を検知する手段がない
- **対比**: `confirmReservation()` と `cancelReservation()` は `db.transaction()` 内で実行されており、この問題は存在しない
- **修正方向性**: `consumeCredits()` と `reserveCredits()` の UPDATE + INSERT を `db.transaction()` で囲む

---

#### BCI-02: RAG Usage Lost Update（無料枠バイパス）

- **カテゴリ**: A (並行性)
- **影響度**: Critical
- **発生確率**: Medium（複数タブ / バッチ操作で発生）
- **根本原因**: `applyCompanyRagUsage()` が月間利用量カウンタをメモリ上で計算し、計算済みの絶対値で UPDATE する。SQL レベルのアトミック増加（`col = col + N`）を使用していない。
- **該当コード**:
  - `src/lib/company-info/usage.ts:276-277` (usage を SELECT でメモリに読み込み)
  - `src/lib/company-info/usage.ts:304-315` (計算済み絶対値で UPDATE — Lost Update 脆弱性)
- **再現シナリオ**:
  - 前提: Free プラン（月20ページ無料）、`ragHtmlFreeUnits = 0`
  - T=0ms: Request A が `ragHtmlFreeUnits = 0` を読み取り、5ページ取込 → `freeUnitsApplied = 5`
  - T=1ms: Request B が `ragHtmlFreeUnits = 0` を読み取り（A の UPDATE 未コミット）、3ページ取込 → `freeUnitsApplied = 3`
  - T=10ms: Request A が `SET ragHtmlFreeUnits = 0 + 5 = 5` で UPDATE
  - T=12ms: Request B が `SET ragHtmlFreeUnits = 0 + 3 = 3` で UPDATE（A の結果を上書き）
  - 結果: 実際には8ページ消費したが `ragHtmlFreeUnits = 3` のみ記録。5ページ分の無料枠が二重利用される。
- **影響**: 直接的な金銭損失。課金されるべき RAG 処理が無料で提供される。繰り返し可能。
- **修正方向性**: SQL レベルのアトミック増加に変更 — `SET ragHtmlFreeUnits = ragHtmlFreeUnits + ${freeUnitsApplied}`。併せて `consumeCredits` と usage 更新を `db.transaction()` で囲む。

---

#### BCI-03: updatePlanAllocation の絶対値上書き（クレジット不正生成）

- **カテゴリ**: A (並行性)
- **影響度**: High
- **発生確率**: Low（Webhook タイミングとユーザー操作の一致が必要だが、意図的に再現可能）
- **根本原因**: `updatePlanAllocation()` が `SET balance = {allocation}` で残高を絶対値で上書きする。進行中の reserve/cancel と競合すると、cancel による返金が absolute overwrite の後に適用され、割当量を超えるクレジットが生成される。
- **該当コード**:
  - `src/lib/credits/monthly-reset.ts:96-104` (`SET balance = allocation` — 絶対値上書き)
- **再現シナリオ**:
  - 前提: Standard プラン（350 credits）、残高 = 300
  - T=0ms: ユーザーが ES Review 開始 → `reserveCredits(6)` → balance = 294
  - T=5ms: Stripe webhook `checkout.session.completed`（Pro へアップグレード）→ `updatePlanAllocation("pro")` → `SET balance = 750`
  - T=15ms: ES Review の FastAPI 呼び出しが失敗 → `cancelReservation()` → `SET balance = balance + 6 = 756`
  - 結果: Pro プランの割当は 750 なのに balance = 756。6 credits が無から生成された。
- **影響**: 繰り返し可能な無料クレジット生成。Webhook タイミングが予測可能なら悪用可能。
- **修正方向性**: 差分ベースの更新に変更 — `SET balance = balance + (newAllocation - oldAllocation)`。または `SELECT ... FOR UPDATE` で排他制御。

---

### P1: 1週間以内に対応（High / 重要 Medium）

---

#### BCI-04: grantMonthlyCredits が絶対値を amount に記録（SUM 照合不能）

- **カテゴリ**: D (残高監査)
- **影響度**: High
- **発生確率**: High（全ユーザーの毎月のリセットで必ず発生）
- **根本原因**: `grantMonthlyCredits()` が `creditTransactions.amount = monthlyAllocation`（例: 50）を記録する。実際の残高変動は `monthlyAllocation - previousBalance`（例: 50 - 12 = 38）であるべきだが、常に absolute allocation が記録される。
- **該当コード**:
  - `src/lib/credits/monthly-reset.ts:75-83` (`amount: newBalance` — `newBalance = monthlyAllocation`)
- **影響**:
  - `SUM(creditTransactions.amount)` ≠ `credits.balance` が全ユーザーで常態化
  - SUM ベースの照合クエリが使用不能
  - 不整合の検知・修復にトランザクション単位の追跡が必要になる
- **検出**: `SELECT userId, balance, (SELECT SUM(amount) FROM creditTransactions WHERE userId = c.userId) FROM credits c` で乖離を確認可能
- **修正方向性**: `amount` を `monthlyAllocation - previousBalance`（差分）に変更。または照合を `balanceAfter` スナップショット比較方式に切り替える。

---

#### BCI-05: 予約 TTL / 自動回収機構の不在

- **カテゴリ**: C (予約ライフサイクル)
- **影響度**: High
- **発生確率**: Medium（サーバークラッシュ、OOM kill、Edge Function タイムアウトで発生）
- **根本原因**: `[Reserved]` 状態の `creditTransactions` レコードに有効期限がない。サーバープロセスが SSE ストリーム中にクラッシュした場合、`onFinally` / `onAbort` は実行されず、予約は永久に `[Reserved]` のまま残る。
- **該当コード**: `src/lib/credits/reservations.ts` 全体 — TTL / expiry の概念が存在しない
- **影響**: ユーザーの balance が不正に減少したまま回復不能。蓄積すると利用可能クレジットが徐々に減少。
- **現行 cron ジョブ**: `src/app/api/cron/` に calendar-sync, hourly-daily-summary, daily-notifications のみ。予約クリーンアップなし。
- **修正方向性**: Daily cron job で `createdAt < NOW() - INTERVAL '1 hour' AND description LIKE '%[Reserved]%'` の行を自動キャンセル。

---

#### BCI-06: Gakuchika ES Draft — confirmReservation 失敗時に cancelReservation 未実行

- **カテゴリ**: C (予約ライフサイクル)
- **影響度**: High
- **発生確率**: Low（confirmReservation の DB 障害時のみ）
- **根本原因**: `generate-es-draft/route.ts` の confirm 失敗 catch ブロックが `creditsUsed = 0` を設定するだけで、`cancelReservation()` を呼ばない。DB トランザクションは成功済みのため、予約は `[Reserved]` のまま放置される。
- **該当コード**: `src/bff/gakuchika/[id]/generate-es-draft/route.ts:377-384`
- **対比**: `motivation/[companyId]/generate-draft/route.ts:295-317` は正しいパターン（confirm 失敗 → cancel → logError）を実装済み
- **修正方向性**: catch ブロック内で `cancelReservation(reservationId)` を追加。motivation-draft の実装をパターンとして踏襲。

---

#### BCI-07: Webhook 内 updatePlanAllocation がトランザクション外

- **カテゴリ**: A (並行性) + B (Stripe Webhook)
- **影響度**: Medium
- **発生確率**: Medium（一時的 DB エラーで発生）
- **根本原因**: `checkout.session.completed` ハンドラで、subscription + userProfile の更新は `db.transaction()` 内だが、`updatePlanAllocation()` はトランザクション外で呼ばれる。失敗時、ユーザーは新プラン表示だがクレジットは旧プランのまま。
- **該当コード**:
  - `src/app/api/webhooks/stripe/route.ts:116-159` (トランザクション内)
  - `src/app/api/webhooks/stripe/route.ts:162` (トランザクション外の updatePlanAllocation)
- **緩和策**: べき等性クリーム削除 → Stripe リトライで最終的に整合
- **修正方向性**: `updatePlanAllocation()` をトランザクション内に含める。または、`customer.subscription.updated` ハンドラも同様にトランザクション化。

---

### P2: 1ヶ月以内に対応（Medium）

---

#### BCI-08: initializeCredits 二重作成（新規ユーザー 500 エラー）

- **カテゴリ**: A (並行性) + D (残高監査)
- **影響度**: Medium
- **発生確率**: Medium（新規ユーザーの初回並行リクエストで発生）
- **根本原因**: `getCreditsInfo()` が `if (!userCredits)` で credits 行の不在を検出し `initializeCredits()` を呼ぶが、2つの並行リクエストが同時に null を検出すると両方が INSERT を試み、userId の UNIQUE 制約違反で 500 エラーが発生。
- **該当コード**: `src/lib/credits/balance.ts:14-25`
- **修正方向性**: `INSERT ... ON CONFLICT (userId) DO NOTHING` に変更。

---

#### BCI-09: Monthly Usage get-or-create 競合（500 エラー）

- **カテゴリ**: A (並行性)
- **影響度**: Medium
- **発生確率**: Medium（月初の並行リクエストで発生）
- **根本原因**: `getOrCreateMonthlyUsage()` の SELECT → INSERT パターンが並行リクエストで UNIQUE 制約違反を起こす。
- **該当コード**: `src/lib/company-info/usage.ts:90-128`
- **修正方向性**: `INSERT ... ON CONFLICT (userId, monthKey) DO NOTHING` → SELECT のパターンに変更。

---

#### BCI-10: past_due 状態でのクレジット利用継続

- **カテゴリ**: B (Stripe Webhook)
- **影響度**: Medium
- **発生確率**: Medium（カード決済失敗は全決済の 3-5%）
- **根本原因**: クレジット消費ロジック（`consumeCredits` / `reserveCredits`）が `subscriptions.status` を一切確認しない。`invoice.payment_failed` で `past_due` になっても、Stripe がサブスクリプションを自動削除するまで（7-30+ 日）有料プランのクレジットを消費し続けられる。
- **該当コード**: `src/lib/credits/reservations.ts:26`（WHERE 条件に status チェックなし）
- **修正方向性**: `getCreditsInfo()` で `subscriptions.status` を確認し、`past_due` の場合は Free プラン相当に制限。または `payment_failed` 時に即座に `updatePlanAllocation("free")` を実行。

---

#### BCI-11: refund / chargeback Webhook 未処理

- **カテゴリ**: B (Stripe Webhook)
- **影響度**: Medium
- **発生確率**: Low（返金/チャージバックは運用者・顧客起点で稀）
- **根本原因**: `charge.refunded` および `charge.dispute.created` / `charge.dispute.closed` のイベントが Webhook に登録されていない。返金後もユーザーは有料プラン + クレジットを保持。
- **該当コード**: `src/lib/stripe/managed-config.json`（5 イベントのみ登録）
- **修正方向性**: `charge.refunded` → プランをフリーに戻し、クレジットを Free 枠にリセット。`charge.dispute.created` → アカウントを一時凍結。

---

#### BCI-12: customer.subscription.updated 非トランザクション

- **カテゴリ**: B (Stripe Webhook)
- **影響度**: Medium
- **発生確率**: Low（部分的 DB 障害時）
- **根本原因**: `customer.subscription.updated` ハンドラが subscriptions UPDATE → userProfiles UPDATE → updatePlanAllocation を3つの独立した DB 呼び出しで実行。中間で失敗すると subscription テーブルと userProfiles / credits の不整合が発生。
- **該当コード**: `src/app/api/webhooks/stripe/route.ts:186-205`
- **修正方向性**: 3操作を `db.transaction()` で囲む。

---

#### BCI-13: Direct-Consume confirm 失敗のサイレント処理

- **カテゴリ**: C (予約ライフサイクル) + D (残高監査)
- **影響度**: Medium
- **発生確率**: Low（一時的 DB 障害時）
- **根本原因**: Gakuchika / Motivation の会話ターンで、DB 書き込み成功後の `consumeCredits()` が失敗した場合、`console.error` のみでサイレント続行。サービスは提供されたがクレジット未消費（ユーザー有利方向の不整合）。
- **該当コード**:
  - `src/app/api/gakuchika/[id]/conversation/stream/route.ts:177-179`
  - `src/bff/motivation/stream-service.ts:181-194`
- **修正方向性**: structured logging (logError) + severity:high アラート通知。retry-once ロジックの追加を検討。

---

### P3: 改善推奨（Low）

---

#### BCI-14: 月次リセット二重実行（監査ログ重複）

- **カテゴリ**: A (並行性)
- **根本原因**: `shouldGrantMonthlyCredits()` → `grantMonthlyCredits()` のギャップ中に別リクエストが到着すると、両方がリセットを実行。balance 自体は冪等（同じ値を設定）だが、`creditTransactions` に `monthly_grant` が2行 INSERT される。
- **該当コード**: `src/lib/credits/monthly-reset.ts:59-84`（lastResetAt の WHERE ガードなし）
- **修正方向性**: UPDATE に `WHERE lastResetAt < ${currentMonthStart}` を追加して CAS 化。

---

#### BCI-15: スケジュール取得無料枠 Off-by-one

- **カテゴリ**: A (並行性)
- **根本原因**: precheck（残り枠確認）と confirm（枠消費）の間に TOCTOU ギャップがあり、境界値で無料枠を1回多く利用可能。
- **影響**: 1回分の超過のみ。金銭的影響は軽微。
- **修正方向性**: precheck で楽観的チェック後、confirm で atomic increment + 上限チェックを行う。

---

#### BCI-16: processedStripeEvents TTL / クリーンアップ不在

- **カテゴリ**: B (Stripe Webhook)
- **根本原因**: `processedStripeEvents` テーブルが無限に成長。セキュリティ上の影響はないが、長期運用でテーブルサイズが肥大化。
- **該当コード**: `src/lib/db/schema.ts:1001-1005`
- **修正方向性**: pg_cron で `DELETE WHERE processedAt < NOW() - INTERVAL '90 days'`。

---

#### BCI-17: confirmReservation / cancelReservation の戻り値情報不足

- **カテゴリ**: C (予約ライフサイクル)
- **根本原因**: 両関数が `Promise<void>` を返す。成功/no-op/エラーの区別が呼び出し元でできない。`confirmReservation` は予約が見つからない場合 silent return する。
- **該当コード**: `src/lib/credits/reservations.ts:105, 130`
- **修正方向性**: 戻り値を `{ confirmed: boolean }` / `{ cancelled: boolean, refundedAmount: number }` に変更。

---

## 安全が確認された設計

調査の結果、以下の設計は正しく機能していることを確認した:

| 設計 | 安全性の根拠 |
|------|-------------|
| `consumeCredits` / `reserveCredits` のコア消費パス | `UPDATE ... WHERE balance >= amount` が PostgreSQL 行ロックで直列化。二重消費は不可能。 |
| `cancelReservation` の CAS パターン | `WHERE description LIKE '%[Reserved]%'` が排他制御として機能。二重返金は不可能。 |
| Stripe Webhook べき等性 | `processedStripeEvents` の INSERT-before-process パターンが正しく重複排除。 |
| SSE ストリームの onFinally チェーン | `sse-proxy.ts` の `finallyInvoked` フラグ + `runFinally` で冪等性確保。ES Review / Interview の全パスで cancel がカバーされている。 |
| Stripe 署名検証 | `stripe.webhooks.constructEvent()` が HMAC + タイムスタンプ（300s tolerance）で検証。replay attack 耐性あり。 |
| Price ID によるプラン決定 | プランはクライアント metadata ではなく Stripe の authoritative `priceId` から導出。改竄不能。 |
| アカウント削除との Webhook 競合 | CASCADE 削除により subscription レコードが先に削除され、Webhook ハンドラは graceful no-op。 |

---

## 修正方向性サマリー

### Phase 1: 即時対応（P0 — 1-2日）

| ID | 修正内容 | 推定工数 | 影響範囲 |
|----|---------|---------|---------|
| BCI-01 | `consumeCredits()` / `reserveCredits()` を `db.transaction()` で囲む | 1h | `src/lib/credits/reservations.ts` |
| BCI-02 | RAG usage 更新を SQL アトミック増加に変更 + トランザクション化 | 2h | `src/lib/company-info/usage.ts` |
| BCI-03 | `updatePlanAllocation()` を差分ベース更新に変更 | 1h | `src/lib/credits/monthly-reset.ts` |

### Phase 2: 短期対応（P1 — 1週間）

| ID | 修正内容 | 推定工数 | 影響範囲 |
|----|---------|---------|---------|
| BCI-04 | `grantMonthlyCredits()` の amount を差分値に変更 + トランザクション化 | 2h | `src/lib/credits/monthly-reset.ts` |
| BCI-05 | 予約クリーンアップ cron job 追加 | 4h | 新規 cron endpoint + `reservations.ts` に cleanup 関数 |
| BCI-06 | ES Draft の confirm 失敗 catch に cancel 追加 | 30m | `src/bff/gakuchika/[id]/generate-es-draft/route.ts` |
| BCI-07 | Webhook ハンドラの `updatePlanAllocation` をトランザクション内に移動 | 2h | `src/app/api/webhooks/stripe/route.ts` |

### Phase 3: 中期対応（P2 — 1ヶ月）

| ID | 修正内容 | 推定工数 |
|----|---------|---------|
| BCI-08 | `initializeCredits` に ON CONFLICT DO NOTHING 追加 | 30m |
| BCI-09 | `getOrCreateMonthlyUsage` に ON CONFLICT DO NOTHING 追加 | 30m |
| BCI-10 | クレジット消費時に subscription status チェック追加 | 3h |
| BCI-11 | `charge.refunded` / `charge.dispute.*` Webhook ハンドラ追加 | 6h |
| BCI-12 | `subscription.updated` ハンドラのトランザクション化 | 1h |
| BCI-13 | Direct-Consume 失敗時の structured logging + alerting | 2h |

### Phase 4: 改善推奨（P3 — 適宜）

| ID | 修正内容 | 推定工数 |
|----|---------|---------|
| BCI-14 | 月次リセットの CAS 化 | 1h |
| BCI-15 | スケジュール取得無料枠の atomic increment 化 | 1h |
| BCI-16 | processedStripeEvents の TTL クリーンアップ追加 | 1h |
| BCI-17 | confirm/cancel の戻り値を情報付きに変更 | 2h |

---

## 推奨照合クエリ

`grantMonthlyCredits` の amount が絶対値である現状では、SUM ベースの照合は不可能。代わりに **最新トランザクションの `balanceAfter` スナップショット比較** を使用する:

```sql
-- 残高ドリフト検出クエリ
SELECT
  c.user_id,
  c.balance AS current_balance,
  latest_tx.balance_after AS last_recorded_snapshot,
  c.balance - latest_tx.balance_after AS drift
FROM credits c
LEFT JOIN LATERAL (
  SELECT balance_after, created_at
  FROM credit_transactions
  WHERE user_id = c.user_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
) latest_tx ON true
WHERE c.balance <> COALESCE(latest_tx.balance_after, c.balance);
```

```sql
-- 孤立予約検出クエリ
SELECT id, user_id, amount, created_at, description
FROM credit_transactions
WHERE description LIKE '%[Reserved]%'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at ASC;
```

---

## 付録: 関連ファイル一覧

| ファイル | 役割 | 関連問題 |
|----------|------|---------|
| `src/lib/credits/reservations.ts` | Reserve/Confirm/Cancel + consumeCredits | BCI-01, BCI-17 |
| `src/lib/credits/balance.ts` | 残高照会・hasEnoughCredits | BCI-08, BCI-10 |
| `src/lib/credits/monthly-reset.ts` | 月次リセット・プラン変更 | BCI-03, BCI-04, BCI-14 |
| `src/lib/credits/shared.ts` | 定数・プラン定義 | — |
| `src/lib/credits/cost.ts` | ES Review コスト計算 | — |
| `src/lib/db/schema.ts` | DB スキーマ | BCI-16 |
| `src/app/api/webhooks/stripe/route.ts` | Stripe Webhook ハンドラ | BCI-07, BCI-11, BCI-12 |
| `src/app/api/stripe/checkout/route.ts` | Checkout フロー | — |
| `src/app/api/credits/route.ts` | GET /api/credits | BCI-08 |
| `src/bff/billing/types.ts` | BillingPolicy インタフェース | — |
| `src/bff/billing/es-review-stream-policy.ts` | ES Review 課金ポリシー | — |
| `src/bff/billing/gakuchika-stream-policy.ts` | ガクチカ課金ポリシー | BCI-13 |
| `src/bff/billing/motivation-stream-policy.ts` | 志望動機課金ポリシー | BCI-13 |
| `src/bff/billing/company-fetch-policy.ts` | 企業情報取得課金ポリシー | BCI-15 |
| `src/lib/company-info/usage.ts` | 月間利用量追跡 | BCI-02, BCI-09 |
| `src/lib/company-info/pricing.ts` | 月間無料枠定義 | — |
| `src/app/api/companies/[id]/interview/start/route.ts` | 面接開始 | — |
| `src/app/api/companies/[id]/interview/stream/route.ts` | 面接ターン | — |
| `src/bff/es-review/handle-review-stream.ts` | ES Review ストリーム処理 | — |
| `src/bff/gakuchika/[id]/generate-es-draft/route.ts` | ガクチカ ES ドラフト | BCI-06 |
| `src/bff/motivation/stream-service.ts` | 志望動機ストリーム | BCI-13 |
| `src/bff/motivation/routes/[companyId]/generate-draft/route.ts` | 志望動機ドラフト（正しいパターン参考） | — |
| `src/lib/stripe/managed-config.json` | Webhook イベント登録 | BCI-11 |
| `src/app/api/settings/account/route.ts` | アカウント削除 | — |
| `src/lib/fastapi/sse-proxy.ts` | SSE プロキシ（安全確認済み） | — |
