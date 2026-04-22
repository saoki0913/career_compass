---
topic: maintainability
plan_date: 2026-04-14
based_on_review: maintainability-architecture/2026-04-12-strict-maintainability-review-current-working-tree.md
status: 未着手
implementation_level: 手順書レベル
---

# 保守性改善 実装ガイド

## 0. このドキュメントの読み方

- **対象読者**: ジュニアエンジニア（Next.js App Router / FastAPI の基本経験あり）
- **前提知識**: TypeScript, Python, SSE (Server-Sent Events) の概念, React hooks, FastAPI router
- **用語集**: 末尾「8. 用語集」を参照
- **関連ドキュメント**:
  - レビュー根拠: `docs/review/maintainability-architecture/2026-04-12-strict-maintainability-review-current-working-tree.md`
  - 会話モデル設計: `docs/architecture/CANONICAL_CONVERSATION_MODEL.md`
  - リファクタリング契約: `docs/architecture/REFACTORING_TEST_CONTRACTS.md`
  - sse-proxy リファレンス: `src/lib/fastapi/sse-proxy.ts`
  - 実行順序: `docs/plan/EXECUTION_ORDER.md` (Phase 2)

---

## 1. 背景と目的

### なぜ必要か

2026-04-12 の保守性厳格レビューで PASS_WITH_REFACTOR 評価を受けた。Phase 0/1/2/4 は完了済みだが、以下の残件がある:

- **Phase 3 残件 (M-1)**: 4 つの AI stream route が 2 種類の SSE 実装を混在使用。gakuchika と interview が独自パース実装を持ち、バグ修正が全 feature に波及しない
- **Phase 4 残件 (M-4)**: gakuchika page.tsx が 611 行の fat page のまま。他 3 feature は thin wrapper 化済み
- **Phase 5 残件 (M-2)**: interview の context/persistence が route 配下に業務本体として残留。`src/lib/interview/` は re-export のみ
- **Phase 6 残件 (M-3)**: motivation.py (3,787行)、company_info.py (3,147行)、llm.py (2,793行) が依然巨大
- **レビュー 3-2 残件 (M-5)**: content component 内に業務 state が混在。view model 未分離

### 完了後の期待状態

- 全 AI stream route が `createSSEProxyStream` + `stream-config` 経由で統一
- 全 product page が 50 行以下の thin wrapper
- route 配下 (`src/app/api/`) に domain logic の実体がない
- `motivation.py` ≤ 800行、`company_info.py` ≤ 1,000行、`llm.py` ≤ 1,000行
- content component 内の業務 state が view model hook へ移動済み

### スコープ外

- `ReviewPanel.tsx` (1,332行)、`CompanyDetailPageClient.tsx` (1,140行) の分割 → 次回レビューで判断 (N-1, N-2)
- `interview.py` (2,171行)、`gakuchika.py` (1,616行) の domain 分割 → M-3 で方針策定のみ (N-5)
- `web_search.py` (2,303行) の分割 → 本計画外 (N-6)
- logging / telemetry の観測単位統一 → 本計画外 (N-7)

### 完了済みフェーズ（参考）

| Phase | 完了内容 |
|-------|---------|
| Phase 0 | 設計判断の明文化 (`CANONICAL_CONVERSATION_MODEL.md`, `BILLING_STATE_MACHINE.md`, `REFACTORING_TEST_CONTRACTS.md`) |
| Phase 1 | canonical conversation model の明示化 (import を `types.ts`/`adapters.ts` 経由へ移行) |
| Phase 2 | 会話 hook の state 主体分割 (controller を setup/domain/transport/playback/draft 系サブフックへ分割) |
| Phase 4 | page の thin wrapper 化 (motivation/interview/calendar は対応済み、gakuchika が残件) |

---

## 2. 事前準備チェックリスト

- [ ] ブランチ作成: `feature/maintainability-improvement` (M-* ごとに独立 PR を推奨)
- [ ] `npm run test:unit` が PASS すること（ベースライン）
- [ ] `npm run test:e2e` が PASS すること（ベースライン）
- [ ] `cd backend && python -m pytest` が PASS すること（ベースライン）
- [ ] 各タスクの対象ファイル行数が「現状の数値サマリー」と一致すること

---

## 3. タスク一覧

| ID | タスク名 | 対象ファイル | 推定工数 | 依存 | blast radius |
|----|---------|-------------|---------|------|-------------|
| M-4 | gakuchika page thin wrapper 化 | `gakuchika/[id]/page.tsx` | 0.5日 | なし | 小 (gakuchika page のみ) |
| M-1 | AI stream route 統一 | `sse-proxy.ts` + 4 stream routes | 3日 | なし | 中〜高 (全 AI stream) |
| M-2 | route support module 完全移行 | interview context/persistence → `src/lib/` | 2日 | M-1 (推奨) | 中 |
| M-3 | FastAPI 非 streaming 責務整理 | `motivation.py`, `company_info.py`, `llm.py` | 3日 | M-1 (推奨) | 高 |
| M-5 | content component の view model 分離 | 3 content components + 3 hooks | 2日 | M-4 | 中 |

---

## 4. 各タスクの詳細手順

---

### Task M-4: gakuchika page thin wrapper 化

#### 4.4.1 目的

Phase 4 で未対応の gakuchika page を thin wrapper 化し、全 product page が 50 行以下の routing + auth gate パターンに統一する。

#### 4.4.2 対象ファイル

| 操作 | ファイル | 行数 | 概要 |
|------|---------|------|------|
| 新規作成 | `src/components/gakuchika/GakuchikaPageContent.tsx` | — | UI 本体の移動先 |
| 変更 | `src/app/(product)/gakuchika/[id]/page.tsx` | 611 → 40以下 | thin wrapper 化 |

#### 4.4.3 手順

**Step 1: テンプレート確認**

motivation の thin wrapper パターンを参照する:

```
src/app/(product)/companies/[id]/motivation/page.tsx (41行)
├── "use client"
├── import { useAuth }
├── import { MotivationConversationContent }
├── import { OperationLockProvider, NavigationGuard }
├── export default function Page() {
│   ├── if (!isReady) → loading
│   ├── if (!isAuthenticated) → auth gate
│   └── return <OperationLockProvider><NavigationGuard /><Content /></OperationLockProvider>
└── }
```

**Step 2: GakuchikaPageContent.tsx を新設**

- `src/components/gakuchika/GakuchikaPageContent.tsx` を作成
- `page.tsx` から以下をそのまま移動:
  - インライン定義の `ArrowLeftIcon` (L37-41)
  - インライン定義の `LoadingSpinner` (L43-52)
  - インライン定義の `DraftReadyPanel` (L54-148)
  - メイン関数 `GakuchikaConversationContent` (L150-577)
- import 文を調整（パスの `@/` 参照は変更不要、相対パスのみ調整）

**Step 3: page.tsx を thin wrapper 化**

- `page.tsx` を 40 行以下に書き換え
- 認証ゲート (`useAuth`) + `OperationLockProvider` + `NavigationGuard` + `<GakuchikaPageContent />` のみ
- `GakuchikaConversationPage` (L579-610) のラッパーロジックを page.tsx 側に残す

**Step 4: import の整合性確認**

```bash
# GakuchikaPageContent が正しく export されているか
grep -r "GakuchikaPageContent" src/ --include="*.tsx" --include="*.ts"
# 壊れた import がないか
npx tsc --noEmit
```

#### 4.4.4 受入基準

- [ ] `src/app/(product)/gakuchika/[id]/page.tsx` が 50 行以下である
- [ ] `src/components/gakuchika/GakuchikaPageContent.tsx` が存在する
- [ ] `npx tsc --noEmit` が PASS する
- [ ] 画面遷移、会話進行、完了サマリー表示、ナビゲーションガードが動作する

#### 4.4.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| 型チェック | `npx tsc --noEmit` | エラー 0 |
| UI ガードレール | `npm run lint:ui:guardrails` | PASS |
| E2E | `npm run test:e2e` (ガクチカフロー) | 会話開始 → 質問応答 → 完了が正常動作 |
| 行数チェック | `wc -l src/app/\(product\)/gakuchika/\[id\]/page.tsx` | 50 以下 |

#### 4.4.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| インライン定義の移動で import 漏れ | 低 | 中 | `tsc --noEmit` で即座に検出 |
| `DraftReadyPanel` のイベントハンドラが page スコープに依存 | 低 | 低 | 全ハンドラが hook 経由なのでコンポーネント内で完結 |

#### 4.4.7 ロールバック手順

```bash
git revert <commit-hash>  # page.tsx + GakuchikaPageContent.tsx の変更を一括復旧
```

全変更が 2 ファイル (新規 + 変更) で完結するため、単一 revert で復旧可能。

---

### Task M-1: AI stream route 統一

#### 4.1.1 目的

4 つの AI stream route が混在使用する SSE 実装を `createSSEProxyStream` + 宣言的設定に統一し、バグ修正やテレメトリ改善が全 feature に自動波及する構造にする。

#### 4.1.2 対象ファイル

| 操作 | ファイル | 行数 | 概要 |
|------|---------|------|------|
| 新規 | `src/lib/fastapi/stream-config.ts` | — | feature 別 SSE 設定の宣言的定義 |
| 新規 | `src/lib/fastapi/stream-pipeline.ts` | — | 共通パイプライン orchestration |
| 変更 | `src/lib/fastapi/sse-proxy.ts` | 254 | config-driven コールバック受入 |
| 変更 | `src/app/api/gakuchika/[id]/conversation/stream/route.ts` | 517 → 150以下 | `createSSEProxyStream` へ移行 |
| 変更 | `src/app/api/companies/[id]/interview/stream/route.ts` | 240 → 100以下 | `createSSEProxyStream` へ移行 |
| 削除/縮小 | `src/app/api/companies/[id]/interview/stream-utils.ts` | 258 → 廃止 or 50以下 | 独自 SSE パース廃止 |
| 変更 | `src/app/api/motivation/[companyId]/conversation/stream/route.ts` | 504 → 150以下 | pipeline 化で縮小 |
| 変更 | `src/app/api/documents/_services/handle-review-stream.ts` | 607 → 200以下 | pipeline 化で縮小 |
| 新規 | `src/lib/fastapi/sse-proxy.test.ts` | — | 契約テスト |

**現状の SSE 実装方式:**

| feature | 現在の方式 | 統一後 |
|---------|-----------|--------|
| motivation | `createSSEProxyStream` (統一済み) | `stream-pipeline` + config |
| ES review | `createSSEProxyStream` (統一済み) | `stream-pipeline` + config |
| gakuchika | 独自 `iterateGakuchikaFastApiSseEvents` | `createSSEProxyStream` + config |
| interview | 独自 `createInterviewUpstreamStream` (`stream-utils.ts`) | `createSSEProxyStream` + config |

#### 4.1.3 手順

**Step 1: stream-config.ts の新設**

- `src/lib/fastapi/stream-config.ts` を新設
- feature ごとの設定差分を宣言的に定義する型を用意:
  ```
  StreamFeatureConfig {
    feature: string                    // "motivation" | "gakuchika" | "interview" | "es_review"
    timeout: number                    // ms (motivation: 120_000, interview: 60_000 等)
    fastApiEndpointPath: string        // FastAPI 側のパス
    billingPolicy: StreamBillingPolicy // 課金ポリシー (既存 gakuchika-stream-policy.ts 参照)
    onComplete: (data) => Promise<...> // complete 後の DB 保存・変換
    onError?: (data) => Promise<void>  // エラー時処理
  }
  ```
- 4 feature の config を個別に定義

**Step 2: createSSEProxyStream の拡張**

- `sse-proxy.ts` に `stream-config` からの設定注入を受け入れるオーバーロードを追加
- 現在の `SSEProxyOptions` を `StreamFeatureConfig` から自動構築できるアダプタを追加
- 既存の motivation / ES review の呼び出しは変更不要（後方互換を維持）

**Step 3: gakuchika stream route の統一**

- `route.ts` (517行) を `createSSEProxyStream` + config 経由に書き換え
- 独自の `iterateGakuchikaFastApiSseEvents` ループを廃止
- gakuchika 固有の `string_chunk` / `field_complete` のパス別状態構築は `onComplete` コールバック内に集約
- route は `identity 解決 + payload 構築 + createSSEProxyStream 呼び出し` のみに縮小

**Step 4: interview stream route の統一**

- `route.ts` (240行) + `stream-utils.ts` (258行) を `createSSEProxyStream` + config 経由に書き換え
- `stream-utils.ts` の `createInterviewUpstreamStream` / SSE パース部分を廃止
- interview 固有の `normalizeFeedback` / complete データ変換は `onComplete` 内に残す
- `createImmediateInterviewStream` (即時レスポンス) は `stream-utils.ts` に残置可

**Step 5: stream-pipeline.ts の新設**

- `src/lib/fastapi/stream-pipeline.ts` を新設
- 共通パイプライン: `identity resolution → rate limit → billing precheck → FastAPI call → SSE proxy → post-complete (DB save + billing consume)`
- 各 route が `runStreamPipeline(req, config)` の 1 行呼び出しに集約
- motivation / ES review も pipeline に移行して route を縮小

**Step 6: 契約テストの追加**

- `src/lib/fastapi/sse-proxy.test.ts` を新設
- テスト観点:
  - progress イベントがクライアントに転送されること
  - complete イベント後に `onComplete` が呼ばれること
  - error 時に billing が消費されないこと
  - `internal_telemetry` がクライアントに漏洩しないこと

#### 4.1.4 受入基準

- [ ] `createSSEProxyStream` を使わない独自 SSE パース実装が 0 件
- [ ] 各 stream route が 200 行以下
- [ ] `sse-proxy.test.ts` が PASS
- [ ] 全 4 feature の SSE フローが正常動作 (E2E)

#### 4.1.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| 型チェック | `npx tsc --noEmit` | エラー 0 |
| ユニットテスト | `npm run test:unit` | PASS (sse-proxy.test.ts 含む) |
| E2E | `npm run test:e2e` | ES 添削・志望動機・ガクチカ・面接の SSE フロー全 PASS |
| 独自 SSE 0 件 | `grep -r "iterateGakuchika\|createInterviewUpstream" src/ --include="*.ts"` | 0 件 |
| 行数チェック | 各 route.ts を `wc -l` | 全て 200 行以下 |

#### 4.1.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| SSE イベント形式が feature 間で微妙に異なる | 高 | 中 | 移行前に各 feature の SSE イベント種別を一覧化。`stream-config` で差分を吸収 |
| gakuchika の `field_complete` パス別処理が複雑 | 中 | 中 | `onComplete` 内に集約し、sse-proxy 本体は触らない |
| interview の `createImmediateInterviewStream` が pipeline に適合しない | 低 | 中 | 即時レスポンスは pipeline 外に残置。streaming のみ統一 |
| 全 AI feature に影響するため regression リスク大 | 高 | 低 | Step ごとに 1 feature ずつ移行し、各 Step で E2E 確認 |

#### 4.1.7 ロールバック手順

Step 3 (gakuchika) と Step 4 (interview) は独立しているため、feature 単位で revert 可能。

```bash
# gakuchika のみロールバック
git revert <gakuchika-commit>
# interview のみロールバック
git revert <interview-commit>
```

Step 1-2 (stream-config, sse-proxy 拡張) は純粋追加のため、revert 不要。Step 5 (pipeline 化) は motivation / ES review にも影響するため、pipeline 導入前の commit を基点にロールバック。

---

### Task M-2: route support module 完全移行

#### 4.2.1 目的

interview の context/persistence が route 配下に業務本体として残留し、`src/lib/interview/` が re-export のみの状態を解消する。ドメインロジックを `src/lib/` に正本化する。

#### 4.2.2 対象ファイル

| 操作 | ファイル | 行数 | 概要 |
|------|---------|------|------|
| 移動+分割 | `src/app/api/companies/[id]/interview/context.ts` | 546 → re-export or 削除 | 実体を lib へ |
| 移動 | `src/app/api/companies/[id]/interview/persistence.ts` | 435 → re-export or 削除 | 実体を lib へ |
| 変更 | `src/lib/interview/context-builder.ts` | 1 → 300以下 | re-export → 実体受入 |
| 新規 | `src/lib/interview/read-model.ts` | — | DB からの conversation 復元・正規化 |
| 変更 | `src/lib/interview/persistence.ts` | 9 → 300以下 | re-export → 実体受入 |
| 分割 | `src/lib/motivation/conversation.ts` | 671 → 300以下 | serialization/parse/policy 分離 |
| 新規 | `src/lib/motivation/conversation-read-model.ts` | — | 復元・parse |
| 新規 | `src/lib/motivation/conversation-serialization.ts` | — | 保存用変換 |
| 新規 | `src/lib/motivation/conversation-policy.ts` | — | stage 進行判定 |
| 変更 | 複数の route / hook (import 元変更) | — | import パス更新 |
| 新規 | `src/lib/interview/context-builder.test.ts` | — | 契約テスト |
| 新規 | `src/lib/interview/persistence.test.ts` | — | 契約テスト |
| 新規 | `src/lib/interview/read-model.test.ts` | — | 契約テスト |

#### 4.2.3 手順

**Step 1: interview domain service の実体移行**

- `src/app/api/companies/[id]/interview/context.ts` (546行) の中身を分割して移動:
  - `src/lib/interview/context-builder.ts`: `buildInterviewContext()` 本体 — seed data 構築、status 計算、serialization
  - `src/lib/interview/read-model.ts` (新規): DB からの conversation 復元、正規化、`HydratedInterviewConversation` 型定義
- `src/app/api/companies/[id]/interview/persistence.ts` (435行) の中身を移動:
  - `src/lib/interview/persistence.ts`: 8 関数 (`ensureInterviewConversation`, `saveInterviewConversationProgress`, `saveInterviewTurnEvent`, `listInterviewTurnEvents`, `saveInterviewFeedbackHistory`, `saveInterviewFeedbackSatisfaction`, `resetInterviewConversation` + 内部ヘルパー) の実体

**Step 2: route 配下の逆転**

- route 配下の `context.ts` / `persistence.ts` を以下のいずれかで処理:
  - **推奨**: 完全削除し、route の import を `@/lib/interview/` に変更
  - **代替**: `src/lib/interview/` からの re-export に逆転（一時的な後方互換）
- 影響する import 元を更新:
  - `src/app/api/companies/[id]/interview/stream/route.ts`
  - `src/app/api/companies/[id]/interview/route.ts`
  - `src/hooks/interview/useInterviewTransport.ts`

**Step 3: motivation conversation.ts の分割**

- `src/lib/motivation/conversation.ts` (671行) を責務分割:
  - `conversation-read-model.ts`: `safeParseMessages()`, `safeParseScores()`, 型の正規化、DB レコード → ドメインオブジェクト変換
  - `conversation-serialization.ts`: `serializeMessages()`, `serializeScores()`, ドメインオブジェクト → DB 保存用変換
  - `conversation-policy.ts`: stage 進行判定、`DEFAULT_CONFIRMED_FACTS`, `DEFAULT_MOTIVATION_CONTEXT`, ビジネスルール定数
- `conversation.ts` は型定義のみ残す (re-export barrel として機能)

**Step 4: 契約テストの追加**

- `src/lib/interview/context-builder.test.ts`: context 構築の入出力契約 (必須フィールドの存在、null 入力時の挙動)
- `src/lib/interview/persistence.test.ts`: 保存操作の正常系 (mock DB)
- `src/lib/interview/read-model.test.ts`: 復元 → serialize → 復元の往復整合性

#### 4.2.4 受入基準

- [ ] route 配下 (`src/app/api/`) に domain logic の実体 (serialize/deserialize/normalize/save) が残っていない
- [ ] `src/lib/interview/` 内の各ファイルが 300 行以下
- [ ] `src/lib/motivation/conversation.ts` が型定義 + re-export のみ (300 行以下)
- [ ] 契約テスト 3 ファイルが PASS
- [ ] `npx tsc --noEmit` エラー 0

#### 4.2.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| 型チェック | `npx tsc --noEmit` | エラー 0 |
| ユニットテスト | `npm run test:unit` | PASS (契約テスト含む) |
| E2E | `npm run test:e2e` | 面接・志望動機フロー正常動作 |
| domain 残留チェック | `grep -rn "serialize\|deserialize\|normalize\|saveTo" src/app/api/companies/\[id\]/interview/ --include="*.ts"` | re-export のみ or 0 件 |
| 行数チェック | `wc -l src/lib/interview/*.ts src/lib/motivation/conversation*.ts` | 各 300 行以下 |

#### 4.2.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| import パス変更の漏れ | 中 | 中 | `tsc --noEmit` で即座に検出。全 import を grep で事前特定 |
| M-1 との マージ競合 (stream route の import 変更) | 中 | 高 | M-1 完了後に着手する (推奨順序) |
| motivation conversation.ts の分割で型定義の循環参照 | 低 | 低 | 型は `conversation.ts` に残し、実装のみ分離 |

#### 4.2.7 ロールバック手順

```bash
git revert <commit-hash>  # import パス変更を含む全ファイルが復旧
```

Step 1-2 (interview) と Step 3 (motivation) は独立しているため、別コミットにすれば個別 revert 可能。

---

### Task M-3: FastAPI 非 streaming 責務整理

#### 4.3.1 目的

3 つの巨大 FastAPI ファイル (motivation.py 3,787行、company_info.py 3,147行、llm.py 2,793行) の責務を整理し、各ファイルを orchestration のみに縮小する。

#### 4.3.2 対象ファイル

| 操作 | ファイル | 行数 | 概要 |
|------|---------|------|------|
| 分割 | `backend/app/routers/motivation.py` | 3,787 → 800以下 | domain helper 抽出 |
| 新規 | `backend/app/routers/motivation_slot_engine.py` | — | slot 状態管理 |
| 新規 | `backend/app/routers/motivation_prompt_builder.py` | — | prompt 組立て |
| 新規 | `backend/app/routers/motivation_context_capture.py` | — | answer capture |
| 新規 | `backend/app/routers/motivation_progress.py` | — | progress payload |
| 分割 | `backend/app/routers/company_info.py` | 3,147 → 1,000以下 | endpoint 分離 |
| 新規 | `backend/app/routers/company_info_rag_router.py` | — | RAG endpoint 群 |
| 新規 | `backend/app/routers/company_info_schedule_router.py` | — | schedule endpoint |
| 分割 | `backend/app/utils/llm.py` | 2,793 → 1,000以下 | re-export 解消 |
| 変更 | `backend/app/utils/llm_providers.py` | 1,119 | provider 固有処理受入 |
| 変更 | 16+ ファイル | — | llm.py re-export → 直接 import へ |
| 新規 | `docs/architecture/FASTAPI_MODULE_LAYOUT.md` | — | 分割ルール文書化 |

#### 4.3.3 手順

**Step 1: motivation.py の domain 分割 (M-3-1)**

motivation.py には 121 関数定義（うち ~100 が private helper）が集中している。既に 6 サブモジュール (1,414行) が抽出済みだが、本体に ~2,370 行の domain logic が残る。

以下の 4 モジュールへ責務ごとに抽出する。各モジュールの責務定義に該当する private 関数を `grep -n "^def _\|^async def _" backend/app/routers/motivation.py` で特定し移動する:

- **`motivation_slot_engine.py`**: slot 状態管理・正規化・次ターン決定に関する責務
  - slot 状態の初期化・正規化 (`_normalize_slot_*`, `_default_slot_states`)
  - slot 分類・優先度判定 (`_classify_slot_state`, `_slot_priority`)
  - 次ターン決定ロジック (`_determine_next_turn`)
  - draft gate 計算 (`_slot_meets_draft_minimum`, `_compute_draft_gate`)

- **`motivation_prompt_builder.py`**: プロンプト組立て・企業グラウンディング構築に関する責務
  - プロンプト用フォーマッタ (`_format_*_for_prompt` 系)
  - 企業情報・プロフィール・ガクチカの整形 (`_extract_*` 系)
  - RAG クエリ構築 (`_build_adaptive_rag_query`, `_augment_rag_query_with_role`)
  - 質問メッセージ構築 (`_build_question_messages`, `_build_question_user_message`)
  - element guidance 構築 (`_build_element_guidance_for_question_prompt`)

- **`motivation_context_capture.py`**: 回答キャプチャ・因果ギャップ計算に関する責務
  - 回答のコンテキスト取り込み (`_capture_answer_into_context`)
  - 因果ギャップ計算 (`_compute_deterministic_causal_gaps`)
  - 矛盾検出 (`_answer_signals_contradiction`)
  - 確認済み事実の正規化 (`_normalize_confirmed_facts`)
  - string list 変換 (`_coerce_string_list`)

- **`motivation_progress.py`**: 進捗ペイロード構築に関する責務
  - progress payload 構築 (`_build_progress_payload`)
  - draft ready レスポンス構築 (`_build_draft_ready_response`)
  - 会話トリム (`_trim_conversation_for_evaluation`)
  - 質問バリデーション/リペア (`_validate_or_repair_question`)
  - fallback / reask / distinct 保証 (`_build_question_fallback`, `_rotate_question_focus_for_reask`, `_ensure_distinct_question`)

抽出後、`motivation.py` は endpoint 定義 + orchestration (prepare → call → post-process) のみに縮小する。

**Step 2: motivation.py の重複定数削除 (M-3-5)**

- `grep -rn "SLOT_\|STAGE_\|MAX_\|DEFAULT_" backend/app/routers/motivation*.py` で重複定数を特定
- `motivation_models.py` (155行) と `motivation_contract.py` (57行) に正本を集約
- `motivation.py` 本体から重複を削除し、正本への import に置換

**Step 3: company_info.py の endpoint 分離 (M-3-2)**

company_info.py は 13 endpoint が定義されており、12 サブモジュール (5,115行) が既に存在するが、endpoint 定義自体が親ファイルに残っている。

endpoint を責務単位の router sub-module へ移動:

- **`company_info_rag_router.py`** (新規): RAG 関連 endpoint を集約
  - `/rag/build`, `/rag/context`, `/rag/status/{company_id}`, `/rag/{company_id}` (DELETE), `/rag/{company_id}/{content_type}` (DELETE), `/rag/{company_id}/delete-by-urls`, `/rag/estimate-upload-pdf`, `/rag/upload-pdf`, `/rag/estimate-crawl-corporate`, `/rag/crawl-corporate`
  - 既存の `company_info_rag_service.py` / `company_info_ingest_service.py` / `company_info_pdf.py` を直接 import

- **`company_info_schedule_router.py`** (新規): スケジュール関連 endpoint を集約
  - `/fetch-schedule`
  - 既存の `company_info_schedule.py` / `company_info_schedule_service.py` / `company_info_schedule_links.py` を直接 import

- `company_info.py` に残す endpoint: `/search-pages`, `/search-corporate-pages`, 企業情報抽出系 + router 登録
- `backend/app/main.py` で新規 router をマウント

**Step 4: llm.py の re-export 解消 (M-3-3)**

llm.py の L27-67 に 4 サブモジュールからの re-export ブロック (約 40 シンボル) がある。16+ ファイルがこの re-export 経由で import している。

- re-export ブロック (L27-67) を削除
- 影響を受ける 16 ファイルの import を直接 import に変更:
  - `from app.utils.llm import sanitize_prompt_input` → `from app.utils.llm_prompt_safety import sanitize_prompt_input`
  - `from app.utils.llm import estimate_llm_usage_cost_usd` → `from app.utils.llm_usage_cost import estimate_llm_usage_cost_usd`
  - `from app.utils.llm import CircuitBreaker` → `from app.utils.llm_client_registry import CircuitBreaker`
  - `from app.utils.llm import get_model_config` → `from app.utils.llm_model_routing import get_model_config`
- llm.py に残す責務:
  - client init (`get_anthropic_client`, `get_openai_client`, `get_google_http_client`)
  - 統一呼び出し (`call_llm_with_error`, `call_llm_text_with_error`)
  - JSON repair (`_repair_json_with_same_model`, `_repair_json_with_openai_model`)
- provider 固有の低レベル呼び出し (`_call_google_generate_content`, `_call_openai_compatible`, `_call_openai_compatible_raw_text`) は `llm_providers.py` に移動が望ましいが、行数目標達成を優先して判断

**Step 5: 分割方針文書化 (M-3-4)**

- `docs/architecture/FASTAPI_MODULE_LAYOUT.md` を新設
- motivation の分割パターンを AI feature 共通ルールとして文書化:
  - router.py: endpoint + orchestration のみ (800 行以下)
  - *_models.py: Pydantic schema
  - *_contract.py: レスポンス構築ヘルパー
  - *_streaming.py: SSE ストリーミング処理
  - domain helper: 責務単位で分割 (slot_engine, prompt_builder 等)
- interview.py / gakuchika.py の将来分割に向けた方針を記載

#### 4.3.4 受入基準

- [ ] `motivation.py` が 800 行以下
- [ ] `company_info.py` が 1,000 行以下
- [ ] `llm.py` が 1,000 行以下
- [ ] `llm.py` の re-export ブロック (backward compatibility) が 0 行
- [ ] `cd backend && python -m pytest` 全 PASS
- [ ] 各新規モジュールに対応する pytest ファイルが存在する (既存テストの移動で可)
- [ ] `FASTAPI_MODULE_LAYOUT.md` が存在する

#### 4.3.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| pytest | `cd backend && python -m pytest` | 全 PASS |
| import 整合性 | `cd backend && python -c "from app.routers.motivation import router"` | エラー 0 |
| import 整合性 | `cd backend && python -c "from app.routers.company_info import router"` | エラー 0 |
| import 整合性 | `cd backend && python -c "from app.utils.llm import call_llm_with_error"` | エラー 0 |
| re-export チェック | `grep -c "from app.utils.llm_" backend/app/utils/llm.py` | 0 (re-export 行なし) |
| E2E | `npm run test:e2e` | 全 AI feature 正常動作 |
| 行数チェック | `wc -l backend/app/routers/motivation.py backend/app/routers/company_info.py backend/app/utils/llm.py` | 各目標値以下 |

#### 4.3.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| motivation.py の private helper 移動で import chain 破壊 | 高 | 中 | Step 1 を小刻みに (1 モジュールずつ抽出 → pytest 実行) |
| llm.py re-export 解消で 16 ファイルの import 一斉変更 | 高 | 中 | `sed` / IDE の一括置換 + `python -m pytest` で即座に検出 |
| company_info.py の endpoint 移動で `main.py` の router 登録漏れ | 中 | 低 | E2E で RAG / schedule 機能を確認 |
| motivation.py の関数間で暗黙のモジュールスコープ変数共有 | 中 | 中 | 移動前に `grep` でモジュールレベル変数の参照を確認 |

#### 4.3.7 ロールバック手順

各 Step は独立しているため、Step 単位で revert 可能:

```bash
# Step 1 (motivation 分割) のみロールバック
git revert <motivation-split-commit>
# Step 3 (company_info 分割) のみロールバック
git revert <company-info-split-commit>
# Step 4 (llm re-export 解消) のみロールバック
git revert <llm-reexport-commit>
```

**推奨**: Step ごとに独立コミットを作成し、revert 粒度を確保する。

---

### Task M-5: content component の view model 分離

#### 4.5.1 目的

Phase 4 で page から content component に移動された業務 state を view model hook に抽出し、content component を JSX レンダリングに集中させる。

#### 4.5.2 対象ファイル

| 操作 | ファイル | 行数 | 概要 |
|------|---------|------|------|
| 新規 | `src/hooks/motivation/useMotivationViewModel.ts` | — | setup 判定・表示モード・進行条件 |
| 新規 | `src/hooks/interview/useInterviewViewModel.ts` | — | 同上 (interview 版) |
| 新規 | `src/hooks/gakuchika/useGakuchikaViewModel.ts` | — | 同上 (gakuchika 版) |
| 変更 | `src/components/motivation/MotivationConversationContent.tsx` | 934 → 500以下 | view model からの派生 state 受取り |
| 変更 | `src/components/interview/InterviewPageContent.tsx` | 1,075 → 600以下 | 同上 |
| 変更 | `src/components/gakuchika/GakuchikaPageContent.tsx` | (M-4 で新設) → 縮小 | 同上 |

#### 4.5.3 手順

**Step 1: useState の分類基準を確立**

content component 内の state を以下の基準で分類:

| 分類 | 定義 | 移動先 | 例 |
|------|------|--------|---|
| **業務 state** | ビジネスルールに依存する状態。setup 完了判定、stage 進行条件、draft readiness | view model hook | `conversationMode`, `stageStatus`, `isDraftReady`, `showSetupScreen` |
| **UI state** | 表示のみに関わる状態。スクロール位置、input value、ダイアログ開閉 | content component に残す | `answer` (入力欄), scroll refs, `isTextStreaming` (表示用) |

**Step 2: motivation view model の抽出 (M-5-1)**

- `src/hooks/motivation/useMotivationViewModel.ts` を新設
- `MotivationConversationContent.tsx` から以下を移動:
  - setup 完了判定ロジック (industry / role 選択状態の評価)
  - 表示モード切替 (setup → conversation → draft)
  - 進行条件計算 (次の質問が出せるか、draft に移行できるか)
  - draft readiness 判定 (slot 充足度の評価)
  - tracker 表示条件の算出
- view model hook は controller hook (`useMotivationConversationController`) を内部で呼び、派生 state を computed property として公開
- content component は view model から受け取った state を JSX にマッピングするだけに縮小

**Step 3: interview view model の抽出 (M-5-2)**

- `src/hooks/interview/useInterviewViewModel.ts` を新設
- `InterviewPageContent.tsx` から同様のパターンで業務 state を移動
- interview 固有: feedback 表示条件、satisfaction 入力状態、会話フェーズ判定

**Step 4: gakuchika view model の抽出 (M-5-3)**

- `src/hooks/gakuchika/useGakuchikaViewModel.ts` を新設
- M-4 で新設される `GakuchikaPageContent.tsx` から業務 state を移動
- gakuchika 固有: STAR 進捗判定、draft ready 条件、restart 判定

#### 4.5.4 受入基準

- [ ] `MotivationConversationContent.tsx` が 500 行以下
- [ ] `InterviewPageContent.tsx` が 600 行以下
- [ ] content component 内に `useState` で管理する業務 state が残っていない (UI-only state は許容)
- [ ] 3 つの view model hook ファイルが存在する
- [ ] 全会話フローが正常動作 (E2E)

#### 4.5.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| 型チェック | `npx tsc --noEmit` | エラー 0 |
| ユニットテスト | `npm run test:unit` | PASS |
| E2E | `npm run test:e2e` | 全会話フロー (motivation, interview, gakuchika) 正常動作 |
| 行数チェック | `wc -l src/components/motivation/MotivationConversationContent.tsx src/components/interview/InterviewPageContent.tsx` | 各目標値以下 |
| 業務 state 残留チェック | content component 内の `useState` が UI state のみであることを目視確認 | 業務 state 0 件 |

#### 4.5.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| 業務/UI state の境界判定が曖昧 | 低 | 中 | 上記分類基準を厳守。迷った場合は content component に残す (移動は後でも可能) |
| view model hook と controller hook の責務重複 | 中 | 中 | view model は controller を wrap する。controller に新規ロジックを追加しない |
| 3 feature 同時変更で regression | 中 | 低 | feature 単位で Step 分けし、各 Step で E2E 確認 |

#### 4.5.7 ロールバック手順

各 feature (motivation / interview / gakuchika) は独立しているため、feature 単位で revert 可能:

```bash
git revert <motivation-viewmodel-commit>
git revert <interview-viewmodel-commit>
git revert <gakuchika-viewmodel-commit>
```

---

## 5. 実行順序と依存関係図

```
M-4 (gakuchika thin wrapper) ──────────────────────────────> M-5 (view model 分離)
                                                               ↑ (gakuchika 部分のみ)
M-1 (stream route 統一) ──> M-2 (route support 移行) ──> M-3 (FastAPI 整理)
```

| 順序 | ID | タスク | blast radius | 推定工数 | 依存 |
|------|-----|-------|-------------|---------|------|
| 1 | M-4 | gakuchika page thin wrapper 化 | 小 | 0.5日 | なし |
| 2 | M-1 | AI stream route 統一 | 中〜高 | 3日 | なし (M-4 と並列可) |
| 3 | M-2 | route support module 完全移行 | 中 | 2日 | M-1 完了後 (推奨) |
| 4 | M-3 | FastAPI 非 streaming 責務整理 | 高 | 3日 | M-1 完了後 (推奨)、M-2 と並列可 |
| 5 | M-5 | content component view model 分離 | 中 | 2日 | M-4 完了後 (gakuchika 分のみ) |

**並列可能な組合せ:**
- M-4 と M-1 は同時着手可
- M-2 と M-3 は並列可 (frontend / backend が独立)
- M-5 は M-4 完了後、M-1/M-2/M-3 と並列可 (gakuchika 以外の分)

**推奨 PR 構成:**
- PR 1: M-4 (独立、即マージ可)
- PR 2: M-1 (stream 統一、E2E 確認必須)
- PR 3: M-2 (M-1 マージ後)
- PR 4: M-3 (backend のみ、M-2 と並列可)
- PR 5: M-5 (M-4 マージ後)

---

## 6. 全体の完了条件

- [ ] 独自 SSE パース実装が 0 件 (全 feature が `createSSEProxyStream` + config 経由)
- [ ] route 配下 (`src/app/api/`) に domain logic の実体が残っていない
- [ ] `motivation.py` ≤ 800行、`company_info.py` ≤ 1,000行、`llm.py` ≤ 1,000行
- [ ] 全 product page が 50 行以下の thin wrapper
- [ ] content component 内の業務 state が view model hook へ移動済み
- [ ] `npm run test:unit` / `npm run test:e2e` / `cd backend && python -m pytest` 全 PASS
- [ ] `FASTAPI_MODULE_LAYOUT.md` が存在する

---

## 7. 全体リスク評価とロールバック戦略

### 全体リスク

| リスク | 影響度 | 対策 |
|-------|-------|------|
| M-1 (stream 統一) が全 AI feature に影響 | 高 | feature 単位で段階移行。各 Step で E2E 確認 |
| M-3 (FastAPI 分割) が import chain を破壊 | 高 | 1 モジュールずつ抽出 → pytest。独立コミット |
| M-1 と M-2 のマージ競合 | 中 | M-1 完了後に M-2 着手 (推奨順序) |
| 全体工数が 10.5日と大きい | 中 | M-* ごとに独立 PR。途中で中断してもマージ済み PR の成果は保持 |

### ロールバック戦略

- **全タスクが独立 PR**: M-* ごとに PR を分けるため、問題発生時は該当 PR のみ revert
- **段階的移行**: M-1 は feature 単位、M-3 は Step 単位で独立コミット
- **破壊的変更なし**: 全変更がリファクタリング (振る舞い不変) のため、revert で元の動作に即復旧

---

## 8. 用語集

| 用語 | 説明 |
|------|------|
| thin wrapper | routing + auth gate + provider のみの page コンポーネント。UI 本体は別コンポーネントに委譲 |
| SSE (Server-Sent Events) | サーバーからクライアントへの一方向ストリーミングプロトコル。AI 応答のリアルタイム表示に使用 |
| `createSSEProxyStream` | `src/lib/fastapi/sse-proxy.ts` の共通 SSE プロキシ関数。FastAPI の SSE レスポンスをパースし、コールバック付きでクライアントに転送 |
| stream-config | feature ごとの SSE 設定 (timeout, billing policy, complete handler) を宣言的に定義する設定オブジェクト |
| stream-pipeline | identity 解決 → rate limit → billing → FastAPI 呼出 → SSE proxy → post-complete の共通フロー |
| view model | UI 表示に必要な派生 state を計算する hook。controller (通信・永続化) と content component (JSX) の間に位置する |
| domain logic | ビジネスルールの実装。serialize/deserialize、状態正規化、進行判定など |
| re-export | 別モジュールの export をそのまま自モジュールからも export すること。依存の間接化 |
| orchestration | 複数の処理ステップを正しい順序で呼び出す制御フロー。endpoint の責務 |
| blast radius | 変更が影響する範囲の広さ。小 = 1 画面、中 = 1 機能、高 = 全機能 |
| contract test | モジュールの入出力の型と振る舞いが変わっていないことを検証するテスト |
| barrel export | 複数のモジュールの export を 1 ファイルにまとめて re-export するパターン |

---

## 中優先度の改善候補（本計画外、次回レビューで判断）

| # | 項目 | 対象ファイル | レビュー節 |
|---|------|------------|-----------|
| N-1 | ReviewPanel の composition root 分離 | `src/components/es/ReviewPanel.tsx` (1,332行) | 4-1 |
| N-2 | CompanyDetailPageClient の workflow 分離 | `src/components/companies/CompanyDetailPageClient.tsx` (1,140行) | 4-1 |
| N-3 | CorporateInfoSection controller の workflow 分割 | `src/components/companies/corporate-info-section/use-corporate-info-controller.ts` | 4-2 |
| N-4 | ES 添削 orchestration の stream handler 分離 | `src/app/api/documents/_services/handle-review-stream.ts` (607行), `src/hooks/useESReview.ts` (627行) | 4-3 |
| N-5 | interview.py / gakuchika.py の domain 分割 | `backend/app/routers/interview.py` (2,171行), `backend/app/routers/gakuchika.py` (1,616行) | M-3-4 で方針策定 |
| N-6 | web_search.py の分割 | `backend/app/utils/web_search.py` (2,303行) | 3-5 |
| N-7 | logging / telemetry の観測単位統一 | `llm.py`, `web_search.py`, AI 関連 Next route | 5-1 |
