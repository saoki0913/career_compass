# RFC: クレジット課金の atomic 化 + 中止コスト制御

## Overview

- Title: クレジット課金の atomic 化（confirm-after-persist の課金漏れ根絶）+ stream 中止コスト制御
- Date: 2026-05-28
- Owner: architect / billing maintainers
- Status: 実装進行中（Phase 1/3/4/5 完了・本番昇格ゲート達成。Phase 6/7/8/2 進行中または残）
- Scope: docs（設計証跡）。本 RFC はコード変更を含まない。
- 出典: 承認済みプラン「課金確定の atomic 化 + 中止コスト制御（クレジット課金フロー横断・改訂版2）」（多角的レビュー2ラウンド + 高負荷設計サブエージェント5本の統合）。

本 RFC は、クレジット課金フローと SSE stream 境界の**最新設計証跡**である。`.omm` が HEAD と乖離（stale）していることが多角的レビューで指摘されたため、課金・stream 境界の正本説明をここに固定する（後述「.omm との関係」を参照）。

## Problem

`generate-draft-direct`（会話なし志望動機 ES 生成・6 クレジット）の「課金確定失敗時仕様」調査を起点に、クレジット課金フロー全体の構造的課題が判明した。

1. **売上漏れ + 不公平**: 「予約（`reserveCredits`・残高即減算）→ DB 保存 → 確定（`confirmReservation`）」の 2 段階で、生成も保存も成功したのに confirm だけが別トランザクションで失敗すると、成果物を返しつつ予約を取り消して**実質無料提供**になる。confirm 失敗を全呼び出し元が log-only で握りつぶし、「成功応答」を返している。
2. **保存済み未課金の窓**: persist と confirm が別トランザクションのため、その隙間でプロセスが落ちると「保存済みだが予約のまま」の中間状態が発生する。
3. **不統一**: 同じ confirm/cancel パターンが複数エンドポイントに散在し、契約が揃っていない。
4. **中止時の無駄コスト**: LLM 開始後の中止でクレジットは返金されるが、LLM 実コストだけが発生する。stream の cancellation token が下流（FastAPI）まで配線されておらず（ES 添削以外）、クライアント切断が FastAPI まで伝播していない。

## Decision（確定方針）

「保存できた時だけ確実に課金する（atomic）」へ統一し、売上漏れ・中間状態・不統一を解消する。中止時は LLM ストリームを即停止して無駄コストを最小化する。

1. **メカニズム**: DB 保存と課金確定を**同一トランザクション（atomic）**に統合する。新しい DB 状態カラムや新 cron ロジックは増やさない。
2. **範囲**: 全 persist-then-confirm の atomic 化 + `BillingPolicy` 契約統一。内訳は「Scope」節を参照。
3. **stream 中止コスト**: ES 添削の cancellation を共通ヘルパー化（token 配線を先行）。
4. **非 stream 中止課金**: 完成した draft は保存して課金する（App Router は切断後も処理を完走する）。
5. **進め方**: PR ではなくローカル develop で依存順フェーズごとに独立コミット。フィーチャーフラグは使わない。**本番昇格は課金漏れサイトが全て閉じてから**。
6. **cron**: Vercel Hobby の daily で billing-maintenance を登録（孤児予約返金の保険限定）。
7. **`confirmed:false` の扱い**: 全 persist-then-confirm 呼び出し元で throw → tx rollback → 返金 → 非成功応答。company-fetch のみ別扱い（後述「設計G」）。

## Scope（confirm 呼び出し元の全体像と分類）

当初の「主要 6 エンドポイント」という表現は不正確だった。実際は **A 群（非 stream 6 サイト）+ B 群（stream/inline）+ C 群（company-fetch）** に分類される。

**A. 非 stream persist-then-confirm**（`confirmReservation` 直呼び。persist tx に `confirmReservationInTx` を差し込む）

1. generate-draft-direct（`generate-draft-direct/route.ts`）
2. generate-draft（`generate-draft/route.ts`）
3. gakuchika generate-es-draft（`gakuchika/[id]/generate-es-draft/route.ts`）
4. interview-summary（`gakuchika/[id]/interview-summary/route.ts`）
5. resume-deepdive（`motivation/[companyId]/resume-deepdive/route.ts`）
6. feedback-summary（`feedback-summary/route.ts`）

**B. stream/inline**（`BillingPolicy` 経由。契約を `confirmInTx` に変更し persist tx で確定）

- ES Review stream（BFF 永続化なし → 単独 tx で `confirmInTx`、契約統一のため）
- motivation conversation stream（会話 UPDATE + `confirmInTx` を tx 統合）
- gakuchika conversation stream（同上）
- interview start/turn/continue/feedback（`*Tx` 変種 + tx 統合）

**C. company-fetch（atomic 対象外・別扱い）**: 無料枠が別テーブル、締切が承認制。`BillingPolicy` 契約は `confirmInTx` に追従するが、`confirm-false` は補償徴収方式（後述「設計G」）。

## Design

### A. クレジットプリミティブ（`src/lib/credits/reservations.ts`）

`monthly-reset.ts` の `CreditsTransaction` 型 + `*Tx`/wrapper idiom に準拠する。`CreditsTransaction` を `shared.ts` / `index.ts` から公開し、`BillingPolicy` が参照できるようにする。

```ts
export async function confirmReservationInTx(tx, reservationId): Promise<{ confirmed: boolean; balanceAfter: number | null }> {
  const [claimed] = await tx.update(creditTransactions)
    .set({ status: "confirmed",
      description: sql`replace(coalesce(${creditTransactions.description}, '[Reserved]'), '[Reserved]', '[Confirmed]')` })
    .where(and(eq(creditTransactions.id, reservationId), eq(creditTransactions.status, "reserved")))
    .returning({ id: creditTransactions.id, balanceAfter: creditTransactions.balanceAfter });
  return claimed ? { confirmed: true, balanceAfter: claimed.balanceAfter } : { confirmed: false, balanceAfter: null };
}
export async function confirmReservation(reservationId) {
  return db.transaction(async (tx) => { const { confirmed } = await confirmReservationInTx(tx, reservationId); return { confirmed }; });
}
```

**要点**:

- `select` 2 回を廃止し、単一 `UPDATE ... WHERE status='reserved' RETURNING` で atomic に claim する。
- **`balanceAfter` は予約時の値を温存する**（confirm は `credits.balance` を変えない。別 select すると competing 操作の無関係残高を載せてしまう）。
- 冪等性は `WHERE status='reserved'` で担保する（既に confirmed/canceled なら claim できず `confirmed:false`）。
- wrapper（`confirmReservation`）は既存呼び出し元の戻り型を維持し、`index.ts` に export を追加する。

### B. BillingPolicy 契約変更（必須化）

`src/bff/billing/types.ts` から `confirm()` を**削除**し、`confirmInTx(tx: CreditsTransaction, ctx, outcome, reservationId)` を**必須メソッド**にする。移行漏れの呼び出し元は型エラー（`Property 'confirm' does not exist`）で即落ちる。後方互換 wrapper は残さない（呼び出し元は社内のみ・全箇所特定済み）。

- 全 policy（es-review-stream / motivation-stream / gakuchika-stream / interview-inline / company-fetch）が `confirmInTx` を実装する。中身は `confirmReservationInTx(tx, reservationId)` 呼び出し（ガード・`logError` は維持）。
- `stream-service.ts` の `Parameters<typeof motivationStreamPolicy.confirm>[0]` 型参照を `confirmInTx` の引数 index 1 へ修正する。
- ES 添削: BFF 永続化がないため `db.transaction(tx => policy.confirmInTx(tx, ...))` の単独 tx とする（旧 confirm と挙動同値、契約統一のため）。

### C. ストリーミング中止契約（決定表）

**不変条件**: クレジット確定は、(1) `type:"complete"` 受信、(2) onComplete 処理、(3) persist 成功、(4) confirm tx commit の **4 条件すべて成立時だけ**。それ以外の全終端（切断・上流エラー・hook throw・タイムアウト・不正 payload）は**必ず返金**する。

| 終端条件 | アクション | 真実源ガード |
|---|---|---|
| complete → persist 成功 → confirm commit | 課金維持 | `creditConfirmed` / `billingOutcomeStatus="success"`（commit 後に更新） |
| 完了前のブラウザ切断 | 返金 + 上流 abort | `creditConfirmed === false` |
| 上流エラー / 接続断 | 返金 | 同上 |
| onComplete 内の tx throw / rollback | 返金 + complete を error 差替（**`cancel:true` 必須**） | フラグを立てない |
| タイムアウト | 返金 | 同上 |
| 不正な complete payload | 返金 | フラグを立てない |

**ルール**:

- **DB 操作は `await` で commit を待ち、成功確定後にフラグを更新する**（先にフラグを立てると rollback 時に「フラグ上は課金済み・DB 上は予約のまま」になり、cron が誤返金する）。
- `onFinally` / `cancel` の `success` 引数を課金判定に使わない（現行 ES 添削が正しい実装。これを不変条件として固定し、破る変更を禁止する）。`creditConfirmed` / `billingOutcomeStatus` を唯一の真実源にする。
- 二重課金 / 二重返金は ①BFF フラグ + ②`WHERE status='reserved'` 楽観ロックの 2 重防御で防ぐ。

**C-2. error 差替の `cancel:true` 規約**（多角的レビュー ラウンド2 High 指摘）

- **原因**: `sse-proxy.ts` の `if (!completeResult?.cancel) sawSuccess = true`。complete を error に差し替えても `cancel` が無いと成功扱いになり、返金がスキップされる。
- **層1（sse-proxy ガード追加）**: 差替後のイベントが `type === "error"` なら、`cancel` の有無に関わらず `sawSuccess` を立てず、上流読みも停止する（フェイルセーフ）。
- **層2（呼び出し元）**: error 差替は必ず `cancel:true` を付ける。実害のある欠陥は interview `stream-utils.ts`（`INTERVIEW_PERSISTENCE_UNAVAILABLE` 差替に `cancel` 欠落）の 1 箇所のみ。motivation / gakuchika / es-review は既に `cancel:true` で正しい。
- **テスト**: interview 保存失敗時に `onAbort`（= cancel）が呼ばれることを検証する（既存テストは文言のみ検証で欠陥を見逃していた）。

### D. interview の persist tx 化

保存関数を `*Tx` 変種化する（monthly-reset idiom。既存関数は薄い wrapper として残し、呼び出し元は無変更）:

- `saveInterviewConversationProgressTx`（`persistence.ts`）
- `saveInterviewTurnEventTx`（`persistence-turn-events.ts`。**turn event を atomic 対象に含める**）
- `saveInterviewFeedbackHistoryTx`（`persistence-feedback.ts`。insert + update + select を tx 内で行い read-your-writes 整合を取る）

atomic 化:

- turn stream（progress + turnEvent + `confirmInTx` を単一 tx、`onPersisted` 廃止 → `reservationId` 引数化）
- start / continue（同型）
- feedback（progress + feedbackHistory + `confirmInTx` を単一 tx。**sheet 生成・保存は confirm 後の tx 外**とする = 失敗しても再生成可能・返金しない）

route の `try/catch → cancel → throw`（返金経路）は残す。`interview-inline-policy` の confirm-after-success-failed ログ経路はデッドコード化する。

### E. FastAPI 中止 + 上流 abort 配線（中止コスト制御）

**(1) 上流 abort（先行）**: `reader.cancel()` だけでは上流 fetch を止められない。`fetchUpstreamSSE` に `clientSignal?: AbortSignal` + `abortUpstream(reason)` を追加する。timeout controller + client abort controller（+ `request.signal`）を `combineAbortSignals`（`AbortSignal.any()` + 古い Node 向けフォールバック）で合成する。`sse-proxy.ts` の `cancel()` で `abortUpstream("client_disconnect")` を呼ぶ（完了済みは `completedNormally` でスキップ）。`stream-pipeline.ts` は透過、各 route で `clientSignal: request.signal` を渡す。Node 20.x 環境（`.vercel/project.json`）で `AbortSignal.any`（v20.3.0+）が利用可能。`package.json` に `engines: node>=20.3.0` と `.nvmrc=20` の追加を推奨する。

**(2) token 配線（標準化より先行）**: gakuchika（`question_pipeline.py` + `gakuchika.py`）、interview（`generators.py` の `_stream_llm_json_completion` + 各 generator）、motivation（`stream_service.py` + `streaming.py` shim）。`CancelledError` / `GeneratorExit` は通常の中止扱いとし、エラーイベント化しない。

**(3) 標準化（最後）**: ES 添削の lease / heartbeat / 429 を `backend/app/utils/sse_stream.py` の `run_leased_sse_stream` に抽出する。token → LLM の下流は既に集約済みのため触らない。

### F. バックストップ cron

`vercel.json` に daily を追加する（Hobby は daily のみ・100 個まで可）: `{ "path": "/api/cron/billing-maintenance", "schedule": "0 18 * * *" }`。`cleanupExpiredReservations(30)` を日次実行する。atomic 化により孤児予約は「reserve 後〜commit 前のハードクラッシュ」という稀ケースのみになる。即時整合は必ず tx 側で担保し、**cron はあくまで保険**として扱う（主機構にしない）。

### G. company-fetch 決定表（atomic 対象外）

**atomic 対象外の根拠**:

- 無料枠が別テーブル `company_info_monthly_usage`（別 tx）。
- 締切保存が非トランザクションの多段処理（`deadline-persistence.ts`）。
- 締切は `isConfirmed=false` の未承認候補（データ確定と課金確定の意味論が分離している。Business Rule「締切は承認必須」に従う）。

**決定表（要点）**:

- **無料枠パス**（`reservationId="schedule-free-quota"`）: 成功は枠 +1 を維持（confirm は no-op）。`confirm-false` は構造上発生不能（N/A）。cancel は枠 -1（`cancelMonthlyScheduleFreeUse`）。cancel-false は `logError(high)` を追加。
- **クレジットパス**（UUID）: 成功は reserved → confirmed。**`confirm-false` は補償徴収方式**を採る。予約 status を確認し、confirmed なら冪等成功、canceled（cron が先取りで返金済み）なら `consumeCredits` で再徴収を試み、失敗は `logError(high)` で運用補償する。cancel は返金（CAS で二重返金を防止）。cancel-false は `logError` を追加。

**安全設計の決定理由**: `confirm-false` で `consumeCredits` を**自動補償としては不採用**にした（二重徴収の footgun になるため）。補償徴収は company-fetch のクレジットパスに限定し、**必ず予約 status を先に確認**する（confirmed ならスキップ）。他の policy にはこの方式を波及させない。

**保存済み締切**: `confirm-false`・中止のいずれでも**残す**。`isConfirmed=false` なので「締切は承認必須」を侵さず、再実行時は重複判定で `duplicates_only` → 返金されるため二重課金にならない。

### H. 観測性（既存基盤を再利用）

`logAiCreditCostSummary` は全 endpoint で既出力。

- **KPI**: `status=success && creditsUsed=0`（本来は課金対象）を **0 に保つ**。1 件でも Sentry アラートを発火する。
- **追加イベント**: `credit_confirm_in_tx_rollback`、cron の `reservation_cleanup`（`canceledCount` が継続発生 = 即時返金漏れのシグナル）、stream cancelled で `estJpyTotal` が高い = FastAPI break が未効。

## Implementation Phases（依存順・develop に独立コミット）

| Phase | 内容 | 依存 | 昇格ブロッカー |
|---|---|---|---|
| **0. 設計証跡** | 本課金フローを RFC（docs/rfc）に記録（= 本 RFC）。`.omm` stale の代替証跡 | なし | — |
| **1. プリミティブ** | `confirmReservationInTx`（UPDATE...RETURNING）+ wrapper + export + 単体テスト。非破壊 | なし | — |
| **2. 実 DB テスト基盤** | vitest projects（unit / integration）+ CI postgres service + 独立 2 接続 XOR テスト | 1 | — |
| **3. 非 stream + summary atomic** | A 群（draft 系 3 + summary 系 3）を tx 内 `confirmInTx` 化 + `confirmed:false` throw + デッドコード除去 + 旧挙動テスト反転（200→503） | 1,2 | **Yes** |
| **4. BillingPolicy 契約 + stream/inline atomic** | `confirm` 削除 → `confirmInTx` 必須を全 policy 一斉 + stream/inline の tx 統合 + sse-proxy 層1ガード + interview `cancel:true` 修正 | 1,2,3 | **Yes** |
| **5. company-fetch** | atomic 対象外・`confirm-false` 補償・締切残す + 契約追従 + 決定表をコメント明文化 | 4 | **Yes** |
| **6. 上流 abort 契約** | `clientSignal` / `abortUpstream` / `AbortSignal.any` 合成 + sse-proxy cancel 配線 | なし（並行可） | No（コスト） |
| **7. FastAPI token 配線** | motivation / gakuchika / interview の token 素通し + `CancelledError` 正常扱い | 6 | No（コスト） |
| **8. cron + 標準化 + 観測性** | vercel.json daily + `run_leased_sse_stream` 抽出 + 構造化イベント | 3,4,5 | No |

**本番昇格ゲート**: Phase 3,4,5（課金漏れサイト）が全て完了するまで develop→main 昇格を禁止する。staging は途中状態でも可（実ユーザーなし）。コスト制御（6,7）は課金漏れではなく無駄コスト最小化なので昇格ブロッカーではない。各 Phase の Plan 確定前・修正後に code-reviewer 3 並列レビューを行う。

**順序根拠**: プリミティブ（1）が土台、実 DB 基盤（2）で以降の競合 / rollback を実証する。非 stream（3）を先行する（ユーザーの主要関心・型結合が小さい）。契約変更（4）は型強制の big-bang（`confirm` 削除で全 policy 呼び出し元が同時に移行を強制される）。company-fetch（5）は契約（4）に追従しつつ補償方式を詰める。abort 契約（6）は token（7）が効く前提で先行。標準化 / 観測（8）は最後。

## As-Built（実装済み状態）

承認済みプランの依存順フェーズに沿って、以下が develop 上で独立コミットとして実装済み。

| Phase | コミット | 内容 |
|---|---|---|
| **1** | `02f4a206` | `feat(credits): add confirmReservationInTx for atomic persist+confirm` |
| **3**（非 stream 5 endpoints + summary） | `715ad6d4` | `feat(credits): atomic persist+confirm for 5 non-stream billing endpoints` |
| **4** | `4beba8a6` | `feat(billing): BillingPolicy.confirmInTx + atomic persist+confirm for stream/inline` |
| **5** | `cefb8bcf` | `feat(billing): company-fetch confirmInTx + remove transitional BillingPolicy.confirm` |

- **本番昇格ゲート（Phase 3 / 4 / 5）は達成済み**。課金漏れサイト（非 stream + summary + company-fetch + stream/inline）が全て atomic 化され、`BillingPolicy.confirm` の transitional 実装は Phase 5（`cefb8bcf`）で削除済み。
- **`generate-draft-direct`**: 本改修の起点ではあるが、当該エンドポイントの atomic 化は**並列作業に委譲（後回し）**。
- **進行中 / 残**:
  - Phase 6（上流 abort 配線）— 進行中 / 残
  - Phase 7（FastAPI token 配線）— 残
  - Phase 8（cron バックストップ + 標準化 + 観測性）— 残
  - Phase 2（実 DB 競合テスト基盤）— 進行中 / 残

> 注: 本「As-Built」節は設計証跡時点（2026-05-28）のスナップショット。最新の進捗は `git log` と各 Phase コミットを正とする。

## Testing Strategy

- **単体（P1）**: `reservations.test.ts` を UPDATE...RETURNING 構造に修正（select 2 段の期待を削除、`balanceAfter` は予約由来）。`index.test.ts` に export 検証を追加。
- **実 DB 競合（P2・新規基盤）**: 現状は実 DB 競合テストがゼロ（vitest モックのみ・docker-compose db コメントアウト・CI dummy URL）。`*.concurrency.test.ts` で `postgres(url, { max:1 })` の**独立 2 接続** + **バリア同期**（両接続が同一予約行を奪いに行く瞬間を作る）+ **タイムアウト**で XOR を実証する: (a) confirm vs cancel, (b) confirm vs cleanup, (c) 二重 confirm, (d) 二重 cancel（返金 1 回）, (e) persist tx 内 confirm 後 throw → reserved のまま, (f) confirm 後 cancel no-op。`Promise.allSettled` だけでは同一接続のシリアライズ / 順序実行で行ロック競合を再現できないため、独立接続 + バリアが必須。`describe.skipIf(!TEST_DATABASE_URL)` で CI ゲート、postgres service ジョブで実行する。pg-mem / PGlite は単一接続のため不採用。
- **挙動反転（意図的）**: confirm 失敗で「200 + draft 返却」を固定していた既存テスト（generate-draft-direct route.test.ts ほか、generate-draft / gakuchika es-draft の同種）を「503 + documentId なし + 返金」へ反転する。
- **interview**: turn-service（`onPersisted` 廃止）、persistence 系（tx mock）、各 route（sheet tx 外化・`cancel:true`）。
- **sse-proxy**: error 差替で `onFinally({success:false})` になる層1ガードのテスト + interview 保存失敗で `onAbort` 発火（`cancel:true` 回帰テスト）。
- **契約変更の回帰**: `confirm` 削除で型エラー化する箇所を tsc で全件捕捉する（移行漏れ検出 = フェイルファスト）。route テストの mock を `confirmInTx` ベースへ更新。
- **E2E 盲点**: `e2e-functional-features.mjs` で credits/billing はどの feature にも一致しない。本変更を含むコミットは全 AI feature を明示実行する: `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=es-review,gakuchika,motivation,interview`。

## Observability

「設計H」の通り、既存の `logAiCreditCostSummary` 基盤を再利用する。主要 KPI は **`status=success && creditsUsed=0` を 0 件に保つ**こと（本来課金対象が無料提供になった = 売上漏れの直接シグナル）。1 件でも Sentry アラートを発火する。補助シグナルとして `credit_confirm_in_tx_rollback`、cron の `reservation_cleanup`（`canceledCount` 継続発生 = 即時返金漏れ）、stream cancelled 時の高 `estJpyTotal`（FastAPI break 未効 = 中止コスト制御の失効）を監視する。

## Cron Backstop

Vercel Hobby の制約上、cron は daily のみ（最大 100 個）。`vercel.json` に `/api/cron/billing-maintenance`（`0 18 * * *`、JST 基準で日次）を登録し、`cleanupExpiredReservations(30)` を実行する。**即時整合は必ず tx 側で担保し、cron は孤児予約返金の保険に限定する**。atomic 化後の孤児予約は「reserve 後〜commit 前のハードクラッシュ」の稀ケースのみであり、cron が主機構になってはならない（多角的レビューが「daily cron を主機構にするのは不可」と指摘済み）。

## Risks And Follow-ups

- **R1 / R2 二重課金 / 返金**: `WHERE status='reserved'` 楽観ロック + BFF フラグの 2 重防御。status の一方向遷移で先勝ち・後発 no-op。実 DB テスト (a)-(f) で実証する。
- **R3 cron 競合**: 日次 cron が confirm 直前の予約を expire しても、`WHERE status='reserved'` の奪い合いで片方のみ成功する。company-fetch は補償方式で吸収する。
- **R4 stream 完了直前の中止レース**: `creditConfirmed` フラグ + 冪等 + `completedNormally` で上流 abort をスキップする。
- **R5 契約変更の波及（大）**: `confirm` 削除で全 policy 呼び出し元 + `stream-service.ts` の型参照がコンパイルエラー化する = 意図的なフェイルファスト。tsc / vitest で全件捕捉する。
- **R6 tx 長期化**: persist + confirm tx に LLM / fetch を入れない。policy 内の `confirmInTx` は渡された tx を使い、再ネストしない。
- **R7 interview sheet**: tx 外（確定後）に置く。失敗は log のみ・返金しない（冪等再生成可能）。
- **R8 company-fetch 二重徴収**: 補償方式は必ず予約 status を先に確認する（confirmed ならスキップ）。company-fetch のみに限定し、他に波及させない。
- **R9 `cancel:true` 欠落**: 実害は interview `stream-utils.ts` の 1 箇所のみ。sse-proxy 層1ガードで将来の事故も防止する。
- **R10 実 DB 基盤の新設**: vitest projects + CI postgres は新インフラ（CI 時間増。Free 2,000 分内・push 毎の軽量ジョブ）。`test:unit` は concurrency テストを除外し、非ブロッキングを維持する。
- **R11 昇格ゲート**: 課金漏れサイトが閉じる Phase 3,4,5 完了まで本番昇格を禁止する。staging は途中状態でも可。
- **R12 .omm stale**: 本 RFC（Phase 0）で課金フローを記録し、stale な `.omm` の代替証跡とする。

大規模・課金境界の変更であるため、各 Phase をコミット分割して独立 revert 可能にする。新規 API / 認証・課金 / DB スキーマ / release 周辺の追加変更が出た場合は AskUserQuestion で確認する。

## .omm との関係

本 RFC は、**クレジット課金フローと SSE stream 中止境界の最新設計証跡**である。多角的レビューにおいて `.omm` が HEAD と乖離（stale）していることが指摘されたため、Phase 0 の成果物として課金・stream 境界の正本説明をここに固定した。

- 課金 atomic 化（`confirmReservationInTx` / `BillingPolicy.confirmInTx`）、stream 中止契約の決定表、company-fetch の atomic 対象外判断、上流 abort 配線については、本 RFC を正本として参照する。
- `.omm` を全面更新する場合も、ここで確定した不変条件（特に「`onFinally`/`cancel` の success を課金判定に使わない」「DB commit 確定後にフラグ更新」「company-fetch のみ補償徴収」）と矛盾しないこと。
- 本 RFC では `.omm` ファイル自体は更新しない（不確かな stale 領域への波及を避ける）。`architecture-gate` は stale な `.omm` を根拠に `PASS` しない運用で補う。
