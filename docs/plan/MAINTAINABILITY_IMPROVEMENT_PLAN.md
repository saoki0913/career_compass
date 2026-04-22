---
topic: maintainability + clean-architecture
plan_date: 2026-04-14
based_on_review: maintainability-architecture/2026-04-12-strict-maintainability-review-current-working-tree.md
status: M系/CA系 統合計画 — 全タスク未着手 (2026-04-21 現状反映)
implementation_level: 手順書レベル
last_update: 2026-04-21
---

# 保守性改善 + Clean Architecture 統合リファクタリング ガイド

## 0. このドキュメントの読み方

- **対象読者**: ジュニアエンジニア（Next.js App Router / FastAPI の基本経験あり）
- **前提知識**: TypeScript, Python, SSE (Server-Sent Events) の概念, React hooks, FastAPI router
- **用語集**: 末尾「9. 用語集」を参照
- **関連ドキュメント**:
  - レビュー根拠: `docs/review/maintainability-architecture/2026-04-12-strict-maintainability-review-current-working-tree.md`
  - 会話モデル設計: `docs/architecture/CANONICAL_CONVERSATION_MODEL.md`
  - リファクタリング契約: `docs/architecture/REFACTORING_TEST_CONTRACTS.md`
  - sse-proxy リファレンス: `src/lib/fastapi/sse-proxy.ts`
  - 実行順序: `docs/plan/EXECUTION_ORDER.md` (Phase 2)
  - 統合元 RFC: `docs/plan/CLEAN_ARCHITECTURE_REFACTORING.md` -- 2026-04-17 に本書へ吸収。**本書が canonical**、旧 CLEAN は superseded の案内文のみ残す。旧 CLEAN の Phase 0-6 は本書の CA-0 -- CA-5 に 1:1 で対応する
  - Billing 仕様: `docs/architecture/BILLING_STATE_MACHINE.md`
  - Principal 分離: `docs/architecture/TENANT_ISOLATION_AUDIT.md`

---

## 1. 背景と目的

### なぜ必要か

2026-04-12 の保守性厳格レビューで PASS_WITH_REFACTOR 評価を受けた。Phase 0/1/2 は完了済みだが、M 系 5 タスクが残件として定義された。加えて Clean Architecture 移行計画 (旧 `CLEAN_ARCHITECTURE_REFACTORING.md`) を本書に統合し、M 系完了後の CA 系タスクとして一体管理する。

**現状の数値サマリー (2026-04-21 実測)**:

| 項目 | 実測値 | 目標 | 状態 |
|------|--------|------|------|
| motivation page.tsx | 969 行 | 50 行以下 | fat page |
| interview page.tsx | 1,194 行 | 50 行以下 | fat page |
| gakuchika page.tsx | 587 行 | 50 行以下 | fat page |
| MotivationConversationContent.tsx | 不在 | 存在 | 未作成 |
| InterviewPageContent.tsx | 不在 | 存在 | 未作成 |
| GakuchikaPageContent.tsx | 不在 | 存在 | 未作成 |
| motivation.py (backend) | 696 行 (13 サブモジュール計 6,525 行) | -- | **既達** |
| company_info.py (backend) | 375 行 (17 サブモジュール計 7,158 行) | -- | **既達** |
| llm.py (backend) | 2,894 行 (67 関数, re-export L29-69) | 1,000 行以下 | 未着手 |
| gakuchika stream | 584 行, 独自 `iterateGakuchikaFastApiSseEvents` | createSSEProxyStream | 未統一 |
| interview stream | 257 行 + stream-utils 312 行, 独自 `createInterviewUpstreamStream` | createSSEProxyStream | 未統一 |
| interview context.ts (route 配下) | 596 行 (実体) | lib へ移行 | 残留 |
| interview persistence.ts (route 配下) | 474 行 (実体) | lib へ移行 | 残留 |
| `src/lib/interview/context-builder.ts` | 1 行 (re-export のみ) | 実体 | re-export |
| `src/lib/interview/persistence.ts` | 11 行 (re-export のみ) | 実体 | re-export |
| useMotivationViewModel.ts | 不在 | 存在 | 未作成 |
| useInterviewViewModel.ts | 不在 | 存在 | 未作成 |
| useGakuchikaViewModel.ts | 不在 | 存在 | 未作成 |
| stream-config.ts | 不在 | 存在 | 未作成 |
| stream-pipeline.ts | 不在 | 存在 | 未作成 |
| sse-proxy.test.ts | 不在 | 存在 | 未作成 |
| BFF_FASTAPI_CONTRACT.md | 不在 | 存在 | 未作成 |
| FASTAPI_MODULE_LAYOUT.md | 不在 | 存在 | 未作成 |

### 完了後の期待状態 (M 系 + CA 系)

**M 系完了時**:
- 全 AI stream route が `createSSEProxyStream` + `stream-config` 経由で統一
- 全 product page (motivation / interview / gakuchika) が 50 行以下の thin wrapper
- route 配下 (`src/app/api/`) に domain logic の実体がない
- `llm.py` ≤ 1,000 行、re-export ブロック 0 行
- content component 内の業務 state が view model hook へ移動済み

**CA 系完了時**:
- `BFF_FASTAPI_CONTRACT.md` が SSE event schema / Principal / Billing policy を網羅
- frontend が `src/features/` + `src/bff/` + `src/shared/` の 3 層構成
- backend が `router -> service -> domain -> adapter` の 4 層構成 (motivation pilot 完了)
- 全 slice に `import-linter` / `eslint-plugin-boundaries` が適用済み
- `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` が新構成に同期済み

### スコープ外

- `ReviewPanel.tsx` (1,332 行)、`CompanyDetailPageClient.tsx` (1,140 行) の分割 -- 次回レビューで判断 (N-1, N-2)
- `interview.py` (backend) の domain 分割 -- CA フェーズで service/domain 配置を見直す
- `gakuchika.py` (backend) の domain 分割 -- CA フェーズで service/domain 配置を見直す
- `web_search.py` (2,303 行) の分割 -- 本計画外 (N-6)
- logging / telemetry の観測単位統一 -- 本計画外 (N-7)

### 完了済みフェーズ（参考）

| Phase | 完了内容 |
|-------|---------|
| Phase 0 | 設計判断の明文化 (`CANONICAL_CONVERSATION_MODEL.md`, `BILLING_STATE_MACHINE.md`, `REFACTORING_TEST_CONTRACTS.md`) |
| Phase 1 | canonical conversation model の明示化 (import を `types.ts`/`adapters.ts` 経由へ移行) |
| Phase 2 | 会話 hook の state 主体分割 (controller を setup/domain/transport/playback/draft 系サブフックへ分割) |

**注意**: 旧計画書で Phase 4 完了としていた page の thin wrapper 化は **3 ページとも未完了** である。Phase 4 を完了済みから削除し、M-4 として本計画に包含した。

### 完了済み Backend 分割

以下は分割が十分に進んでおり、M 系の追加分割対象ではない。CA フェーズで service/domain 配置を見直す。

| ファイル | 現行行数 | サブモジュール数 | 合計行数 | 判定 |
|---------|---------|---------------|---------|------|
| `motivation.py` | 696 行 | 13 | 6,525 行 | 目標 800 以下を既達。CA-1 で service/domain 再配置 |
| `company_info.py` | 375 行 | 17 | 7,158 行 | 目標 1,000 以下を既達。CA-4 で service/domain 再配置 |

### 確定した設計判断 (grill-me 9 項目)

| # | 判断項目 | 決定 | 根拠 |
|---|---------|------|------|
| 1 | 再編深度 | 両側完全再編 (frontend + backend) | fat page 3 件 + backend 4 層未導入のため片側だけでは不完全 |
| 2 | 実行順序 | M 系先行 -- BFF 契約 -- CA 後行 | M 系は即効性あり、CA 系はそれを前提に構造化 |
| 3 | Backend 層 | 完全 4 層 (router -> service -> domain -> adapter) | FastAPI Bigger Applications を基調とし、Port 抽出は段階導入 |
| 4 | Frontend 構造 | `features/` + `bff/` + `shared/` | App Router 維持、Next.js 特有の認可・課金は `bff/` で切る |
| 5 | パイロット | motivation | 最も会話フローが複雑で、パターンが確立すれば他 3 機能に展開可 |
| 6 | Backend 移行 | 段階的抽出 (`routers/` 維持 + `services/` 新設) | 大規模 rename を避け、import path 互換レイヤで参照 |
| 7 | Lint 強制 | pilot 完了後に pilot slice のみ | Phase 6 で全体適用。早期全体適用は違反祭りのリスク |
| 8 | BFF 契約固定 | M 系と CA の間に実施 (CA-0) | SSE event schema / Principal / Billing policy を先に固める |
| 9 | CA 順序 | motivation -> es_review -> gakuchika -> company_info | 複雑度順。company_info は多機能統合のため最後 |

### 統合済み Architecture Direction（旧 CLEAN_ARCHITECTURE_REFACTORING）

2026-04-17 時点で、`CLEAN_ARCHITECTURE_REFACTORING.md` の将来設計は本書へ吸収した。旧 CLEAN の Phase 0-6 は本書の CA-0 -- CA-5 に 1:1 で対応する。以後の大規模リファクタリングは、本書の実行タスクと次の将来方針を一体で扱う。

#### 方向性 A: BFF ←→ FastAPI 契約固定を先行する

- 最優先は `Next BFF ←→ FastAPI` の境界固定であり、層の抽象化より先に契約を固める
- 対象は SSE event schema、`X-Career-Principal`、billing policy、owner check、rate limit layer
- 将来の契約正本は `docs/architecture/BFF_FASTAPI_CONTRACT.md` とし、型は `src/shared/contracts/` 相当へ寄せる

#### 方向性 B: Backend は完全 4 層を段階導入する

- `router -> service -> domain -> adapter` を基調とする
- `career_principal`、`sse_concurrency`、vector store 等の stateful adapter を明示的に許容
- Port 抽出は 2 slice (motivation + es_review) を動かしてから確定
- `motivation` を pilot、`es_review` を 2 本目、`company_info` は最後に扱う

#### 方向性 C: Frontend は App Router を維持しつつ `bff/` を明示する

- `src/app/` は thin route wrapper とし、feature logic は `features/`、横断基盤は `shared/` に寄せる
- Next.js 特有の認可・課金・proxy・identity は `shared/` に混ぜず、`bff/` 相当の境界で切る
- 本書の M-1 / M-2 / M-5 は、この将来構成へ寄せるための現実的な前段と位置付ける

#### セキュリティ境界の保全ルール (High-2)

`src/shared/` に auth/billing を安易に移さない。以下の配置を厳守する:

| ロジック | 配置先 | 理由 |
|---------|--------|------|
| `guest_device_token` cookie 優先ロジック | `src/bff/identity/` | Next.js request context 依存 |
| `X-Career-Principal` 署名ロジック | `src/bff/identity/` | HMAC + Next.js server context |
| owner check | `src/bff/identity/` | principal + DB 照合 |
| Better Auth の純粋な session 管理 | `src/shared/auth/` | framework agnostic |
| Stripe の低レベル client | `src/shared/billing/` | framework agnostic |
| billing policy (reserve/confirm/cancel) | `src/bff/billing/` | Next.js request context + Billing State Machine 依存 |

#### 統合運用ルール

- いますぐ実行する項目は本書の M-1 -- M-5 を正本とする
- CA-0 -- CA-5 は M 系完了後に順次着手する
- 将来設計としての軸 A/B/C は、CA 系タスクの判断基準として使う
- Clean Architecture の詳細設計は新規 plan を起こさず、本書へ追記して管理する

---

## 2. 事前準備チェックリスト

- [ ] ブランチ作成: `feature/maintainability-improvement` (M-* / CA-* ごとに独立 PR を推奨)
- [ ] `npm run test:unit` が PASS すること（ベースライン）
- [ ] `npm run test:e2e` が PASS すること（ベースライン）
- [ ] `cd backend && python -m pytest` が PASS すること（ベースライン）
- [ ] 各タスクの対象ファイル行数が「1. 背景と目的」の数値サマリーと一致すること

---

## 3. タスク一覧 (M 系 + CA 系)

### M 系タスク（即時着手可）

| ID | タスク名 | 対象ファイル | 推定工数 | 依存 | blast radius | agent routing |
|----|---------|-------------|---------|------|-------------|---------------|
| M-4 | 全 page thin wrapper 化 (3 ページ) | motivation/interview/gakuchika page.tsx | 1.5 日 | なし | 小 (各 page のみ) | nextjs-developer |
| M-1 | AI stream route 統一 | `sse-proxy.ts` + 4 stream routes | 3 日 | なし | 中-高 (全 AI stream) | nextjs-developer |
| M-2 | route support module 完全移行 | interview context/persistence -> `src/lib/` | 2 日 | M-1 (推奨) | 中 | nextjs-developer |
| M-3 | llm.py re-export 解消 + docs | `llm.py`, `FASTAPI_MODULE_LAYOUT.md` | 1 日 | M-1 (推奨) | 中 | prompt-engineer |
| M-5 | content component view model 分離 | 3 content components + 3 hooks | 2 日 | M-4 | 中 | nextjs-developer |

### CA 系タスク（M 系完了後に着手）

| ID | タスク名 | 対象範囲 | 推定工数 | 依存 | blast radius | agent routing |
|----|---------|---------|---------|------|-------------|---------------|
| CA-0 | BFF ←→ FastAPI 契約固定 | `BFF_FASTAPI_CONTRACT.md`, `src/shared/contracts/`, `backend/app/schemas/contracts.py` | 2 日 | M 系全完了 | 低 (ドキュメント + 型のみ) | architect |
| CA-1 | motivation pilot (frontend + backend) | `src/features/motivation/`, `src/bff/motivation/`, `backend/app/services/motivation/` | 5 日 | CA-0 | 高 (motivation 全体) | architect + nextjs-developer + fastapi-developer |
| CA-2 | es_review + lint 段階導入 | `src/features/es-review/`, `src/bff/es-review/`, `backend/app/services/es_review/` | 4 日 | CA-1 | 高 (ES 添削全体) | architect + nextjs-developer + fastapi-developer |
| CA-3 | gakuchika | `src/features/gakuchika/`, `src/bff/gakuchika/`, `backend/app/services/gakuchika/` | 3 日 | CA-2 | 中 (gakuchika 全体) | nextjs-developer + fastapi-developer |
| CA-4 | company_info 特殊扱い | `src/features/company-info/`, `backend/app/services/company_info/` | 4 日 | CA-3 | 高 (企業情報全体) | nextjs-developer + fastapi-developer |
| CA-5 | 全体 lint + docs 同期 | `import-linter`, `eslint-plugin-boundaries`, `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md` | 2 日 | CA-4 | 低 (lint + docs) | architect |

**合計推定工数**: M 系 9.5 日 + CA 系 20 日 = 29.5 日

---

## 4. M 系タスク詳細手順

---

### Task M-4: 全 page thin wrapper 化 (3 ページ)

**agent routing**: nextjs-developer (500 行超のファイル変更時は code-reviewer にもレビュー依頼)

#### 4.4.1 目的

motivation / interview / gakuchika の 3 ページを thin wrapper 化し、全 product page が 50 行以下の routing + auth gate パターンに統一する。Content component を新設し、UI 本体をそこに移動する。

#### 4.4.2 対象ファイル

| 操作 | ファイル | 現在行数 | 目標 | 概要 |
|------|---------|---------|------|------|
| 新規作成 | `src/components/motivation/MotivationConversationContent.tsx` | -- | -- | UI 本体の移動先 |
| 変更 | `src/app/(product)/companies/[id]/motivation/page.tsx` | 969 | 50 以下 | thin wrapper 化 |
| 新規作成 | `src/components/interview/InterviewPageContent.tsx` | -- | -- | UI 本体の移動先 |
| 変更 | `src/app/(product)/companies/[id]/interview/page.tsx` | 1,194 | 50 以下 | thin wrapper 化 |
| 新規作成 | `src/components/gakuchika/GakuchikaPageContent.tsx` | -- | -- | UI 本体の移動先 |
| 変更 | `src/app/(product)/gakuchika/[id]/page.tsx` | 587 | 50 以下 | thin wrapper 化 |

#### 4.4.3 手順

**Step 1: テンプレート確認**

calendar page の thin wrapper パターンを参照する（motivation は現時点で fat page のため参照不可）:

```
src/app/(product)/.../page.tsx (50行以下)
+-- "use client"
+-- import { useAuth }
+-- import { XxxPageContent }
+-- import { OperationLockProvider, NavigationGuard }
+-- export default function Page() {
|   +-- if (!isReady) -> loading
|   +-- if (!isAuthenticated) -> auth gate
|   +-- return <OperationLockProvider><NavigationGuard /><Content /></OperationLockProvider>
+-- }
```

**Step 2: motivation (969 行)**

- `src/components/motivation/MotivationConversationContent.tsx` を新設
- `page.tsx` からインライン定義のコンポーネントとメイン関数を移動
- `page.tsx` を 50 行以下に書き換え

**Step 3: interview (1,194 行)**

- `src/components/interview/InterviewPageContent.tsx` を新設
- `page.tsx` からインライン定義のコンポーネントとメイン関数を移動
- `page.tsx` を 50 行以下に書き換え

**Step 4: gakuchika (587 行)**

- `src/components/gakuchika/GakuchikaPageContent.tsx` を新設
- `page.tsx` からインライン定義のコンポーネントとメイン関数を移動
- `page.tsx` を 50 行以下に書き換え

**Step 5: import の整合性確認**

```bash
npx tsc --noEmit
npm run lint:ui:guardrails
```

#### 4.4.4 受入基準

- [ ] 3 つの page.tsx が各 50 行以下である
- [ ] 3 つの Content component が存在し、UI 本体を包含する
- [ ] `npx tsc --noEmit` が PASS する
- [ ] 各画面の遷移、会話進行、完了サマリー表示、ナビゲーションガードが動作する

#### 4.4.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| 型チェック | `npx tsc --noEmit` | エラー 0 |
| UI ガードレール | `npm run lint:ui:guardrails` | PASS |
| E2E | `npm run test:e2e` (motivation / interview / gakuchika フロー) | 全正常動作 |
| 行数チェック | `wc -l` 各 page.tsx | 全て 50 以下 |

#### 4.4.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| インライン定義の移動で import 漏れ | 低 | 中 | `tsc --noEmit` で即座に検出 |
| interview page (1,194 行) が最大で分割複雑度が高い | 中 | 中 | Step 3 を最後に実施し、motivation/gakuchika のパターンを先に確立 |
| 3 ページ同時変更で regression | 中 | 低 | 1 ページずつコミットし、各 Step で E2E 確認 |

#### 4.4.7 ロールバック手順

各 Step (motivation / interview / gakuchika) は独立しているため、別コミットにすれば個別 revert 可能:

```bash
git revert <motivation-commit>
git revert <interview-commit>
git revert <gakuchika-commit>
```

---

### Task M-1: AI stream route 統一

**agent routing**: nextjs-developer

#### 4.1.1 目的

4 つの AI stream route が混在使用する SSE 実装を `createSSEProxyStream` + 宣言的設定に統一し、バグ修正やテレメトリ改善が全 feature に自動波及する構造にする。

#### 4.1.2 対象ファイル

| 操作 | ファイル | 現在行数 | 目標 | 概要 |
|------|---------|---------|------|------|
| 新規 | `src/lib/fastapi/stream-config.ts` | -- | -- | feature 別 SSE 設定の宣言的定義 |
| 新規 | `src/lib/fastapi/stream-pipeline.ts` | -- | -- | 共通パイプライン orchestration |
| 変更 | `src/lib/fastapi/sse-proxy.ts` | 254 | -- | config-driven コールバック受入 |
| 変更 | `src/app/api/gakuchika/[id]/conversation/stream/route.ts` | 584 | 150 以下 | `createSSEProxyStream` へ移行 |
| 変更 | `src/app/api/companies/[id]/interview/stream/route.ts` | 257 | 100 以下 | `createSSEProxyStream` へ移行 |
| 削除/縮小 | `src/app/api/companies/[id]/interview/stream-utils.ts` | 312 | 廃止 or 50 以下 | 独自 SSE パース廃止 |
| 変更 | `src/app/api/motivation/[companyId]/conversation/stream/route.ts` | 530 | 150 以下 | pipeline 化で縮小 |
| 変更 | `src/app/api/documents/_services/handle-review-stream.ts` | 623 | 200 以下 | pipeline 化で縮小 |
| 新規 | `src/lib/fastapi/sse-proxy.test.ts` | -- | -- | 契約テスト |

**現状の SSE 実装方式:**

| feature | 現在の方式 | 統一後 |
|---------|-----------|--------|
| motivation | `createSSEProxyStream` (統一済み) | `stream-pipeline` + config |
| ES review | `createSSEProxyStream` (統一済み) | `stream-pipeline` + config |
| gakuchika | 独自 `iterateGakuchikaFastApiSseEvents` (`src/app/api/gakuchika/fastapi-stream.ts` L29) | `createSSEProxyStream` + config |
| interview | 独自 `createInterviewUpstreamStream` (`stream-utils.ts` L150) | `createSSEProxyStream` + config |

#### 4.1.3 手順

**Step 1: stream-config.ts の新設**

- `src/lib/fastapi/stream-config.ts` を新設
- feature ごとの設定差分を宣言的に定義する型を用意:
  ```
  StreamFeatureConfig {
    feature: string                    // "motivation" | "gakuchika" | "interview" | "es_review"
    timeout: number                    // ms (motivation: 120_000, interview: 60_000 等)
    fastApiEndpointPath: string        // FastAPI 側のパス
    billingPolicy: StreamBillingPolicy // 課金ポリシー (下記 DoD 参照)
    onComplete: (data) => Promise<...> // complete 後の DB 保存・変換
    onError?: (data) => Promise<void>  // エラー時処理
  }
  ```
- 4 feature の config を個別に定義

**stream-pipeline の billing DoD (High-3)**:

各 feature の billing policy は以下で固定。stream-pipeline はこの差分を config から読み取り、適切なタイミングで billing 呼び出しを行う:

| feature | billing 方式 | 詳細 |
|---------|-------------|------|
| ES review | 3-phase (reserve -> SSE -> confirm/cancel) | stream 開始前に reserve、成功で confirm、失敗で cancel |
| motivation | post-success | SSE 成功後に消費 |
| gakuchika | post-success | SSE 成功後に消費 |
| interview | なし (billing-free) | 現時点で無料 |

ゲスト可否は feature ごとに不変。principal 付き FastAPI call が必要な route:
- motivation stream: `X-Career-Principal` 必須
- ES review stream: `X-Career-Principal` 必須
- gakuchika stream: `X-Career-Principal` 必須
- interview stream/start/continue/feedback: `X-Career-Principal` 必須

**Step 2: createSSEProxyStream の拡張**

- `sse-proxy.ts` (254 行) に `stream-config` からの設定注入を受け入れるオーバーロードを追加
- 現在の `SSEProxyOptions` を `StreamFeatureConfig` から自動構築できるアダプタを追加
- 既存の motivation / ES review の呼び出しは変更不要（後方互換を維持）

**Step 3: gakuchika stream route の統一**

- `route.ts` (584 行) を `createSSEProxyStream` + config 経由に書き換え
- 独自の `iterateGakuchikaFastApiSseEvents` ループを廃止
- gakuchika 固有の `string_chunk` / `field_complete` のパス別状態構築は `onComplete` コールバック内に集約
- route は `identity 解決 + payload 構築 + createSSEProxyStream 呼び出し` のみに縮小

**Step 4: interview stream route の統一**

- `route.ts` (257 行) + `stream-utils.ts` (312 行) を `createSSEProxyStream` + config 経由に書き換え
- `stream-utils.ts` の `createInterviewUpstreamStream` / SSE パース部分を廃止
- interview 固有の `normalizeFeedback` / complete データ変換は `onComplete` 内に残す
- `createImmediateInterviewStream` (即時レスポンス) は `stream-utils.ts` に残置可

**Step 5: stream-pipeline.ts の新設**

- `src/lib/fastapi/stream-pipeline.ts` を新設
- 共通パイプライン: `identity resolution -> rate limit -> billing precheck -> FastAPI call -> SSE proxy -> post-complete (DB save + billing consume)`
- 各 route が `runStreamPipeline(req, config)` の 1 行呼び出しに集約
- motivation / ES review も pipeline に移行して route を縮小

**Step 6: 契約テストの追加**

- `src/lib/fastapi/sse-proxy.test.ts` を新設
- テスト観点:
  - progress イベントがクライアントに転送されること
  - complete イベント後に `onComplete` が呼ばれること
  - error 時に billing が消費されないこと (ES review: cancel が呼ばれること)
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
| 独自 SSE 0 件 | `grep -r "iterateGakuchika\|createInterviewUpstream" src/ --include="*.ts"` | 0 件 (テストファイルの mock 除く) |
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

**agent routing**: nextjs-developer

#### 4.2.1 目的

interview の context/persistence が route 配下に業務本体として残留し、`src/lib/interview/` が re-export のみの状態を解消する。ドメインロジックを `src/lib/` に正本化する。

#### 4.2.2 対象ファイル

| 操作 | ファイル | 現在行数 | 目標 | 概要 |
|------|---------|---------|------|------|
| 移動+分割 | `src/app/api/companies/[id]/interview/context.ts` | 596 | re-export or 削除 | 実体を lib へ |
| 移動 | `src/app/api/companies/[id]/interview/persistence.ts` | 474 | re-export or 削除 | 実体を lib へ |
| 変更 | `src/lib/interview/context-builder.ts` | 1 (re-export のみ) | 300 以下 | re-export -> 実体受入 |
| 新規 | `src/lib/interview/read-model.ts` | -- | -- | DB からの conversation 復元・正規化 |
| 変更 | `src/lib/interview/persistence.ts` | 11 (re-export のみ) | 300 以下 | re-export -> 実体受入 |
| 分割 | `src/lib/motivation/conversation.ts` | 671 | 300 以下 | serialization/parse/policy 分離 |
| 新規 | `src/lib/motivation/conversation-read-model.ts` | -- | -- | 復元・parse |
| 新規 | `src/lib/motivation/conversation-serialization.ts` | -- | -- | 保存用変換 |
| 新規 | `src/lib/motivation/conversation-policy.ts` | -- | -- | stage 進行判定 |
| 変更 | 複数の route / hook (import 元変更) | -- | -- | import パス更新 |
| 新規 | `src/lib/interview/context-builder.test.ts` | -- | -- | 契約テスト |
| 新規 | `src/lib/interview/persistence.test.ts` | -- | -- | 契約テスト |
| 新規 | `src/lib/interview/read-model.test.ts` | -- | -- | 契約テスト |

#### 4.2.3 手順

**Step 1: interview domain service の実体移行**

- `src/app/api/companies/[id]/interview/context.ts` (596 行) の中身を分割して移動:
  - `src/lib/interview/context-builder.ts`: `buildInterviewContext()` 本体 -- seed data 構築、status 計算、serialization
  - `src/lib/interview/read-model.ts` (新規): DB からの conversation 復元、正規化、`HydratedInterviewConversation` 型定義
- `src/app/api/companies/[id]/interview/persistence.ts` (474 行) の中身を移動:
  - `src/lib/interview/persistence.ts`: 全関数 (`ensureInterviewConversation`, `saveInterviewConversationProgress`, `saveInterviewTurnEvent`, `listInterviewTurnEvents`, `saveInterviewFeedbackHistory`, `saveInterviewFeedbackSatisfaction`, `resetInterviewConversation` + 内部ヘルパー) の実体

**Step 2: route 配下の逆転**

- route 配下の `context.ts` / `persistence.ts` を以下のいずれかで処理:
  - **推奨**: 完全削除し、route の import を `@/lib/interview/` に変更
  - **代替**: `src/lib/interview/` からの re-export に逆転（一時的な後方互換）
- 影響する import 元を更新:
  - `src/app/api/companies/[id]/interview/stream/route.ts`
  - `src/app/api/companies/[id]/interview/route.ts`
  - `src/app/api/companies/[id]/interview/start/route.ts`
  - `src/app/api/companies/[id]/interview/continue/route.ts`
  - `src/app/api/companies/[id]/interview/feedback/route.ts`
  - `src/hooks/interview/useInterviewTransport.ts`

**Step 3: motivation conversation.ts の分割**

- `src/lib/motivation/conversation.ts` (671 行) を責務分割:
  - `conversation-read-model.ts`: `safeParseMessages()`, `safeParseScores()`, 型の正規化、DB レコード -> ドメインオブジェクト変換
  - `conversation-serialization.ts`: `serializeMessages()`, `serializeScores()`, ドメインオブジェクト -> DB 保存用変換
  - `conversation-policy.ts`: stage 進行判定、`DEFAULT_CONFIRMED_FACTS`, `DEFAULT_MOTIVATION_CONTEXT`, ビジネスルール定数
- `conversation.ts` は型定義のみ残す (re-export barrel として機能)

**Step 4: 契約テストの追加**

- `src/lib/interview/context-builder.test.ts`: context 構築の入出力契約 (必須フィールドの存在、null 入力時の挙動)
- `src/lib/interview/persistence.test.ts`: 保存操作の正常系 (mock DB)
- `src/lib/interview/read-model.test.ts`: 復元 -> serialize -> 復元の往復整合性

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
| domain 残留チェック | `grep -rn "serialize\|deserialize\|normalize\|saveTo" src/app/api/companies/[id]/interview/ --include="*.ts"` | re-export のみ or 0 件 |
| 行数チェック | `wc -l src/lib/interview/*.ts src/lib/motivation/conversation*.ts` | 各 300 行以下 |

#### 4.2.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| import パス変更の漏れ | 中 | 中 | `tsc --noEmit` で即座に検出。全 import を grep で事前特定 |
| M-1 とのマージ競合 (stream route の import 変更) | 中 | 高 | M-1 完了後に着手する (推奨順序) |
| motivation conversation.ts の分割で型定義の循環参照 | 低 | 低 | 型は `conversation.ts` に残し、実装のみ分離 |

#### 4.2.7 ロールバック手順

```bash
git revert <commit-hash>  # import パス変更を含む全ファイルが復旧
```

Step 1-2 (interview) と Step 3 (motivation) は独立しているため、別コミットにすれば個別 revert 可能。

---

### Task M-3: llm.py re-export 解消 + FASTAPI_MODULE_LAYOUT.md

**agent routing**: prompt-engineer (llm.py 作業)、architect (FASTAPI_MODULE_LAYOUT.md)

**重要**: motivation.py (696 行) と company_info.py (375 行) は既に目標行数以下に分割済みのため、M-3 の対象外とする。これらは CA フェーズで service/domain 配置を見直す。M-3 は llm.py re-export 解消と FASTAPI_MODULE_LAYOUT.md 作成のみをスコープとする。

#### 4.3.1 目的

`llm.py` (2,894 行) の re-export ブロック (L29-69: 4 サブモジュールから 40+ シンボルを re-export) を解消し、24 ファイルが直接 import するように変更する。合わせて FastAPI モジュール分割ルールを文書化する。

#### 4.3.2 対象ファイル

| 操作 | ファイル | 現在行数 | 目標 | 概要 |
|------|---------|---------|------|------|
| 変更 | `backend/app/utils/llm.py` | 2,894 | 1,000 以下 | re-export 解消 |
| 変更 | 24 ファイル | -- | -- | llm.py re-export -> 直接 import へ |
| 新規 | `docs/architecture/FASTAPI_MODULE_LAYOUT.md` | -- | -- | 分割ルール文書化 |

**llm.py の re-export 構造 (L29-69)**:

| re-export 元 | 行数 | 主なシンボル |
|-------------|------|------------|
| `llm_prompt_safety` | 262 | `sanitize_prompt_input`, `check_prompt_injection` 等 |
| `llm_usage_cost` | 326 | `estimate_llm_usage_cost_usd` 等 |
| `llm_client_registry` | 164 | `get_circuit_breaker`, `CircuitBreaker` |
| `llm_model_routing` | 211 | `get_model_config`, `ModelConfig` 等 |

**llm.py に残す責務** (re-export 解消後):
- client init (`get_anthropic_client`, `get_openai_client`, `get_google_http_client`)
- 統一呼び出し (`call_llm_with_error`, `call_llm_text_with_error`)
- JSON repair (`_repair_json_with_same_model`, `_repair_json_with_openai_model`)

**llm.py サブモジュール一覧 (参考)**:

| ファイル | 行数 | 責務 |
|---------|------|------|
| `llm_client_registry.py` | 164 | circuit breaker, client cache |
| `llm_model_routing.py` | 211 | model config, routing |
| `llm_prompt_safety.py` | 262 | prompt sanitization, injection check |
| `llm_providers.py` | 1,119 | provider 固有の低レベル呼び出し |
| `llm_responses.py` | 533 | response parsing |
| `llm_streaming.py` | 448 | streaming helpers |
| `llm_usage_cost.py` | 326 | cost estimation |

#### 4.3.3 手順

**Step 1: llm.py の re-export 解消**

- re-export ブロック (L29-69) を削除
- 影響を受ける 24 ファイルの import を直接 import に変更:
  - `from app.utils.llm import sanitize_prompt_input` -> `from app.utils.llm_prompt_safety import sanitize_prompt_input`
  - `from app.utils.llm import estimate_llm_usage_cost_usd` -> `from app.utils.llm_usage_cost import estimate_llm_usage_cost_usd`
  - `from app.utils.llm import CircuitBreaker` -> `from app.utils.llm_client_registry import CircuitBreaker`
  - `from app.utils.llm import get_model_config` -> `from app.utils.llm_model_routing import get_model_config`
- provider 固有の低レベル呼び出し (`_call_google_generate_content`, `_call_openai_compatible`, `_call_openai_compatible_raw_text`) は `llm_providers.py` に移動が望ましいが、行数目標 1,000 以下の達成を優先して判断

**Step 2: 分割方針文書化**

- `docs/architecture/FASTAPI_MODULE_LAYOUT.md` を新設
- motivation / company_info の分割パターンを AI feature 共通ルールとして文書化:
  - `router.py`: endpoint + orchestration のみ (800 行以下)
  - `*_models.py`: Pydantic schema
  - `*_contract.py`: レスポンス構築ヘルパー
  - `*_streaming.py`: SSE ストリーミング処理
  - domain helper: 責務単位で分割 (slot_engine, prompt_builder 等)
- interview.py / gakuchika.py の将来分割に向けた方針を記載
- 記載内容: motivation (696 行 + 13 サブモジュール), company_info (375 行 + 17 サブモジュール) の実績を正本として

#### 4.3.4 受入基準

- [ ] `llm.py` が 1,000 行以下
- [ ] `llm.py` の re-export ブロック (backward compatibility) が 0 行
- [ ] `cd backend && python -m pytest` 全 PASS
- [ ] `FASTAPI_MODULE_LAYOUT.md` が存在する

#### 4.3.5 テスト仕様

| 種別 | コマンド | 期待結果 |
|------|---------|---------|
| pytest | `cd backend && python -m pytest` | 全 PASS |
| import 整合性 | `cd backend && python -c "from app.utils.llm import call_llm_with_error"` | エラー 0 |
| re-export チェック | `grep -c "from app.utils.llm_" backend/app/utils/llm.py` | 0 (re-export 行なし) |
| E2E | `npm run test:e2e` | 全 AI feature 正常動作 |
| 行数チェック | `wc -l backend/app/utils/llm.py` | 1,000 以下 |

#### 4.3.6 リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|-------|-------|---------|------|
| llm.py re-export 解消で 24 ファイルの import 一斉変更 | 高 | 中 | IDE の一括置換 + `python -m pytest` で即座に検出 |
| provider 関数移動時に暗黙のモジュールスコープ変数共有 | 中 | 中 | 移動前に `grep` でモジュールレベル変数の参照を確認 |

#### 4.3.7 ロールバック手順

```bash
# re-export 解消のみロールバック
git revert <llm-reexport-commit>
```

Step ごとに独立コミットを作成し、revert 粒度を確保する。

---

### Task M-5: content component の view model 分離

**agent routing**: nextjs-developer (500 行超のファイル変更時は code-reviewer にもレビュー依頼)

**前提**: M-4 完了後に着手する。M-4 で 3 つの Content component が新設されていることが必須。

#### 4.5.1 目的

M-4 で page から content component に移動された業務 state を view model hook に抽出し、content component を JSX レンダリングに集中させる。

#### 4.5.2 対象ファイル

| 操作 | ファイル | 概要 |
|------|---------|------|
| 新規 | `src/hooks/motivation/useMotivationViewModel.ts` | setup 判定・表示モード・進行条件 |
| 新規 | `src/hooks/interview/useInterviewViewModel.ts` | 同上 (interview 版) |
| 新規 | `src/hooks/gakuchika/useGakuchikaViewModel.ts` | 同上 (gakuchika 版) |
| 変更 | `src/components/motivation/MotivationConversationContent.tsx` | (M-4 で新設) -> 500 以下 |
| 変更 | `src/components/interview/InterviewPageContent.tsx` | (M-4 で新設) -> 600 以下 |
| 変更 | `src/components/gakuchika/GakuchikaPageContent.tsx` | (M-4 で新設) -> 縮小 |

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
  - 表示モード切替 (setup -> conversation -> draft)
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
| 行数チェック | `wc -l` 各 Content component | 各目標値以下 |
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

## 5. CA 系タスク詳細手順

---

### Task CA-0: BFF ←→ FastAPI 契約固定

**agent routing**: architect

旧 `CLEAN_ARCHITECTURE_REFACTORING.md` Phase 0 に対応。

#### 5.0.1 目的

M 系完了後、CA 系に着手する前に、Next BFF と FastAPI の境界契約を文書化・型定義する。以後の CA 系タスクはこの契約に基づいて構造変更を行う。

#### 5.0.2 成果物

| 成果物 | 概要 |
|--------|------|
| `docs/architecture/BFF_FASTAPI_CONTRACT.md` | SSE event schema / `X-Career-Principal` / billing policy / owner check / rate limit layer の正本 |
| `src/shared/contracts/` | Zod schema (TypeScript 型) |
| `backend/app/schemas/contracts.py` | Pydantic mirror |
| 契約テスト (最小) | motivation / es_review の SSE event order snapshot、principal token の round-trip test |

#### 5.0.3 domain 層の定義

CA 系全体を通じて、domain 層は以下の 5 原則に従う:

1. 純粋な業務ルール・値オブジェクト・状態遷移のみを配置する
2. HTTP / DB / LLM / Next.js / FastAPI への依存を禁止する
3. 外部依存の Port は `typing.Protocol` で定義する
4. entity は Pydantic `BaseModel` を許容する (Rich Domain Model は不採用)
5. テストは fake adapter のみで完結すること

#### 5.0.4 受入基準

- [ ] `BFF_FASTAPI_CONTRACT.md` が存在し、全 4 feature の SSE event schema を列挙
- [ ] `src/shared/contracts/` に Zod schema が存在
- [ ] `backend/app/schemas/contracts.py` に Pydantic mirror が存在
- [ ] 契約テスト (motivation + es_review) が PASS
- [ ] 既存の Playwright / pytest / Vitest がグリーン

---

### Task CA-1: motivation pilot (frontend + backend)

**agent routing**: architect (設計判断) + nextjs-developer (frontend) + fastapi-developer (backend)

旧 `CLEAN_ARCHITECTURE_REFACTORING.md` Phase 1 に対応。

#### 5.1.1 目的

motivation を pilot として、frontend は `features/` + `bff/` 構成に、backend は `router -> service -> domain -> adapter` の 4 層構成に移行する。

#### 5.1.2 Backend 作業

- `backend/app/services/motivation/` を新設
- `routers/motivation.py` (696 行) + 13 サブモジュールから会話 turn / slot-fill / draft generation を service 層に抽出
- `routers/motivation.py` を thin router 化 (< 200 行を目標)
- 既存 `prompts/motivation_prompts.py` は import path 互換レイヤで参照（大規模 rename を避ける）
- domain 層に motivation 固有の値オブジェクト・状態遷移を配置 (5.0.3 の 5 原則に従う)

#### 5.1.3 Frontend 作業

- `src/features/motivation/` を新設
  - `hooks/`: 既存の `src/hooks/useMotivationConversationController.ts` + `useMotivationTransport.ts` を分割移設
  - `application/`: conversation management
  - `domain/`: 型定義・ビジネスルール
- `src/bff/motivation/` を新設
  - Next API route handler を委譲
- `src/shared/` の配置はセキュリティ境界ルール (High-2) に従う:
  - `src/shared/auth/`: Better Auth の純粋な session 管理のみ
  - `src/shared/billing/`: Stripe の低レベル client のみ
  - `src/bff/identity/`: guest_device_token / X-Career-Principal / owner check
  - `src/bff/billing/`: billing policy (reserve/confirm/cancel)

#### 5.1.4 受入基準

- [ ] `backend/app/services/motivation/` が存在し、service 層にビジネスロジックが配置されている
- [ ] `routers/motivation.py` が 200 行以下
- [ ] `src/features/motivation/` が存在
- [ ] `src/bff/motivation/` が存在
- [ ] CA-0 の契約テストが PASS
- [ ] Playwright の motivation フロー（guest / logged-in / draft 成功・失敗）が全 PASS

---

### Task CA-2: es_review + lint 段階導入

**agent routing**: architect (設計判断) + nextjs-developer (frontend) + fastapi-developer (backend)

旧 `CLEAN_ARCHITECTURE_REFACTORING.md` Phase 2 に対応。

#### 5.2.1 目的

es_review を 2 番目の slice として移行し、motivation と同じ 4 層構成を適用する。加えて、motivation + es_review の 2 slice に lint 契約を段階導入する。

#### 5.2.2 handle-review-stream.ts の段階的分解 (Medium-6)

`src/app/api/documents/_services/handle-review-stream.ts` (623 行) は単純移設ではなく、CA-2 で以下を段階的に分離する:

- DB 読み取り -> `src/bff/es-review/` のデータ取得層
- owner check -> `src/bff/identity/` (CA-1 で確立済みのパターンを再利用)
- billing policy -> `src/bff/billing/` (ES review は 3-phase: reserve -> SSE -> confirm/cancel)
- stream use case -> `src/features/es-review/` の application 層

#### 5.2.3 lint 段階導入

- `import-linter` (backend): motivation + es_review の 2 slice 配下で `services -> domain/entities`, `routers -> services`, `adapters -> domain/repositories` を強制
- `eslint-plugin-boundaries` (frontend): `features/motivation` と `features/es-review` の相互参照禁止、`features/*` から `bff/*` への直接 import 禁止

#### 5.2.4 受入基準

- [ ] `backend/app/services/es_review/` が存在
- [ ] `src/features/es-review/` が存在
- [ ] `handle-review-stream.ts` が bff 層に分離され、200 行以下
- [ ] lint (import-linter + eslint-plugin-boundaries) が motivation + es_review 配下で PASS
- [ ] Playwright の ES 添削フローが全 PASS

---

### Task CA-3: gakuchika

**agent routing**: nextjs-developer (frontend) + fastapi-developer (backend)

旧 `CLEAN_ARCHITECTURE_REFACTORING.md` Phase 4 に対応 (旧 Phase 3 の LlmPort 抽出は CA-1/CA-2 の実績から判断し、CA-3 以降に段階統合)。

#### 5.3.1 目的

gakuchika を 3 番目の slice として、CA-1/CA-2 で確立したパターンと同じ型で移行する。

#### 5.3.2 作業概要

- Backend: `backend/app/services/gakuchika/` を新設、`routers/gakuchika.py` を thin router 化
- Frontend: `src/features/gakuchika/` + `src/bff/gakuchika/` を新設
- lint 契約を `features/gakuchika` と `services/gakuchika/` に拡張
- ゲート: Playwright gakuchika フロー

#### 5.3.3 受入基準

- [ ] `backend/app/services/gakuchika/` が存在
- [ ] `src/features/gakuchika/` が存在
- [ ] lint が gakuchika 配下で PASS
- [ ] Playwright gakuchika フローが全 PASS

---

### Task CA-4: company_info 特殊扱い

**agent routing**: nextjs-developer (frontend) + fastapi-developer (backend)

旧 `CLEAN_ARCHITECTURE_REFACTORING.md` Phase 5 に対応。

#### 5.4.1 目的

company_info は他 slice と違い、Web 検索 + スクレイピング + PDF OCR + RAG 構築 + 締切抽出 + ユーザー承認フローの多機能統合であるため、一気に分解しない。

#### 5.4.2 サブタスク

| ID | 作業 | 対象 |
|----|------|------|
| CA-4a | `services/company_info/fetch_schedule.py` を切り出し | `company_info_schedule.py` (366) + `company_info_schedule_service.py` (378) + `company_info_schedule_links.py` (442) |
| CA-4b | `services/company_info/build_rag_source.py` (RAG 構築、vector_store adapter 経由) | `company_info_rag_service.py` (381) + `company_info_ingest_service.py` (546) |
| CA-4c | `services/company_info/extract_deadlines.py` (締切承認フローは domain の `PendingDeadline` で表現) | `company_info_schedule_extraction.py` (168) |

- Frontend: `src/features/company-info/` は既存 `components/companies/corporate-info-section/*` の移設で済む（軽い）
- ゲート: Playwright 企業情報取得 + 締切承認フロー

#### 5.4.3 受入基準

- [ ] `backend/app/services/company_info/` が存在し、3 サブタスク (CA-4a/b/c) が完了
- [ ] `src/features/company-info/` が存在
- [ ] Playwright 企業情報取得 + 締切承認フローが全 PASS

---

### Task CA-5: 全体 lint + docs 同期

**agent routing**: architect

旧 `CLEAN_ARCHITECTURE_REFACTORING.md` Phase 6 に対応。

#### 5.5.1 目的

全 slice の lint 契約をリポジトリ全体に拡大し、ドキュメントを新構成に同期する。

#### 5.5.2 作業概要

- `import-linter` と `eslint-plugin-boundaries` をリポジトリ全体に拡大
- `docs/architecture/ARCHITECTURE.md` を更新
- `CLAUDE.md` / `AGENTS.md` の「Core Architecture Notes」を新構成に同期
- 旧 `src/lib/api-route/`, `src/app/api/_shared/`, `src/hooks/es-review/` の残骸コードを削除

#### 5.5.3 受入基準

- [ ] lint (import-linter + eslint-plugin-boundaries) がリポジトリ全体で PASS
- [ ] `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` が新構成を反映
- [ ] 旧ディレクトリの残骸コードが削除済み

---

## 6. 実行順序と依存関係図

```
                     M系 (即時着手可)
                     =================

M-4 (全 page thin wrapper) ────────────────────────> M-5 (view model 分離)
                                                       ^
M-1 (stream route 統一) ──> M-2 (route support 移行)    |
                        \                               |
                         \──> M-3 (llm.py re-export)    |
                                                        |
                     CA系 (M系全完了後)                   |
                     ==================                  |
                                                        |
CA-0 (BFF 契約固定) ──> CA-1 (motivation pilot) ──> CA-2 (es_review + lint)
                                                        |
                           CA-3 (gakuchika) <───────────+
                                |
                           CA-4 (company_info)
                                |
                           CA-5 (全体 lint + docs)
```

### M 系の推奨実行順序

| 順序 | ID | タスク | blast radius | 推定工数 | 依存 |
|------|-----|-------|-------------|---------|------|
| 1 | M-4 | 全 page thin wrapper 化 (3 ページ) | 小 | 1.5 日 | なし |
| 2 | M-1 | AI stream route 統一 | 中-高 | 3 日 | なし (M-4 と並列可) |
| 3 | M-2 | route support module 完全移行 | 中 | 2 日 | M-1 完了後 (推奨) |
| 4 | M-3 | llm.py re-export 解消 + docs | 中 | 1 日 | M-1 完了後 (推奨)、M-2 と並列可 |
| 5 | M-5 | content component view model 分離 | 中 | 2 日 | M-4 完了後 |

### CA 系の推奨実行順序

| 順序 | ID | タスク | blast radius | 推定工数 | 依存 |
|------|-----|-------|-------------|---------|------|
| 6 | CA-0 | BFF 契約固定 | 低 | 2 日 | M 系全完了 |
| 7 | CA-1 | motivation pilot | 高 | 5 日 | CA-0 |
| 8 | CA-2 | es_review + lint | 高 | 4 日 | CA-1 |
| 9 | CA-3 | gakuchika | 中 | 3 日 | CA-2 |
| 10 | CA-4 | company_info | 高 | 4 日 | CA-3 |
| 11 | CA-5 | 全体 lint + docs | 低 | 2 日 | CA-4 |

**並列可能な組合せ (M 系)**:
- M-4 と M-1 は同時着手可
- M-2 と M-3 は並列可 (frontend / backend が独立)
- M-5 は M-4 完了後、M-1/M-2/M-3 と並列可

**推奨 PR 構成 (M 系)**:
- PR 1: M-4 (独立、即マージ可)
- PR 2: M-1 (stream 統一、E2E 確認必須)
- PR 3: M-2 (M-1 マージ後)
- PR 4: M-3 (backend のみ、M-2 と並列可)
- PR 5: M-5 (M-4 マージ後)

**推奨 PR 構成 (CA 系)**:
- PR 6: CA-0 (ドキュメント + 型のみ)
- PR 7: CA-1 (motivation pilot、最大の PR)
- PR 8: CA-2 (es_review + lint)
- PR 9: CA-3 (gakuchika)
- PR 10-12: CA-4a/4b/4c (company_info サブタスク)
- PR 13: CA-5 (lint + docs)

---

## 7. 全体完了条件 (M 系 + CA 系)

### M 系完了条件

- [ ] 独自 SSE パース実装が 0 件 (全 feature が `createSSEProxyStream` + config 経由)
- [ ] route 配下 (`src/app/api/`) に domain logic の実体が残っていない
- [ ] `llm.py` <= 1,000 行、re-export ブロック 0 行
- [ ] 全 product page (motivation / interview / gakuchika) が 50 行以下の thin wrapper
- [ ] 3 つの Content component (MotivationConversationContent / InterviewPageContent / GakuchikaPageContent) が存在する
- [ ] content component 内の業務 state が view model hook へ移動済み
- [ ] `FASTAPI_MODULE_LAYOUT.md` が存在する
- [ ] `npm run test:unit` / `npm run test:e2e` / `cd backend && python -m pytest` 全 PASS

### CA 系完了条件

- [ ] `BFF_FASTAPI_CONTRACT.md` が存在し、全 4 feature の SSE event schema を網羅
- [ ] `src/shared/contracts/` に Zod schema、`backend/app/schemas/contracts.py` に Pydantic mirror が存在
- [ ] frontend が `src/features/` + `src/bff/` + `src/shared/` の 3 層構成で 4 feature 全て移行済み
- [ ] backend が `router -> service -> domain -> adapter` の 4 層構成で motivation pilot 完了
- [ ] `import-linter` と `eslint-plugin-boundaries` がリポジトリ全体で PASS
- [ ] `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` が新構成に同期済み
- [ ] 旧ディレクトリの残骸コードが削除済み
- [ ] 全テスト (Playwright / pytest / Vitest) がグリーン

---

## 8. リスク評価とロールバック戦略

### 全体リスク (M 系)

| リスク | 影響度 | 対策 |
|-------|-------|------|
| M-1 (stream 統一) が全 AI feature に影響 | 高 | feature 単位で段階移行。各 Step で E2E 確認 |
| M-3 (llm.py re-export 解消) で 24 ファイルの import 一斉変更 | 高 | IDE の一括置換 + `python -m pytest` で即座に検出 |
| M-1 と M-2 のマージ競合 | 中 | M-1 完了後に M-2 着手 (推奨順序) |
| M 系合計工数 9.5 日と大きい | 中 | M-* ごとに独立 PR。途中で中断してもマージ済み PR の成果は保持 |

### 全体リスク (CA 系)

| リスク | 影響度 | 対策 |
|-------|-------|------|
| motivation pilot で BFF ←→ FastAPI の契約が不足と判明 | 高 | CA-1 内で契約を拡張し、CA-0 文書を更新。es_review 着手前にゲートを置く |
| LlmPort / VectorStorePort の抽出が早すぎる抽象化になる | 中 | 2 slice (motivation + es_review) 実装で共通点が出るまで抽出しない |
| company_info (CA-4) で締切承認フローが壊れる | 高 | フィーチャーフラグで新旧両経路を並走、Playwright で承認フローを検証 |
| 依存 lint を全体適用して既存コードが違反祭りになる | 中 | CA-2 から slice 単位で段階導入。CA-5 で contract を拡大 |
| CA 系合計工数 20 日と大きい | 高 | CA-* ごとに独立 PR。各 Phase の DoD を厳守し、前 Phase の成果が壊れない保証を持って次に進む |

### ロールバック戦略

- **全タスクが独立 PR**: M-* / CA-* ごとに PR を分けるため、問題発生時は該当 PR のみ revert
- **段階的移行**: M-1 は feature 単位、M-3 は Step 単位で独立コミット
- **破壊的変更なし**: 全変更がリファクタリング (振る舞い不変) のため、revert で元の動作に即復旧
- **CA 系のゲート**: 各 Phase 完了時に全テストグリーンをゲートとし、次 Phase に着手する条件とする

---

## 9. 用語集

| 用語 | 説明 |
|------|------|
| thin wrapper | routing + auth gate + provider のみの page コンポーネント。UI 本体は別コンポーネントに委譲 |
| SSE (Server-Sent Events) | サーバーからクライアントへの一方向ストリーミングプロトコル。AI 応答のリアルタイム表示に使用 |
| `createSSEProxyStream` | `src/lib/fastapi/sse-proxy.ts` の共通 SSE プロキシ関数。FastAPI の SSE レスポンスをパースし、コールバック付きでクライアントに転送 |
| stream-config | feature ごとの SSE 設定 (timeout, billing policy, complete handler) を宣言的に定義する設定オブジェクト |
| stream-pipeline | identity 解決 -> rate limit -> billing -> FastAPI 呼出 -> SSE proxy -> post-complete の共通フロー |
| view model | UI 表示に必要な派生 state を計算する hook。controller (通信・永続化) と content component (JSX) の間に位置する |
| domain logic | ビジネスルールの実装。serialize/deserialize、状態正規化、進行判定など |
| domain 層 | 純粋な業務ルール・値オブジェクト・状態遷移のみ。HTTP / DB / LLM への依存を禁止 |
| service 層 | domain 層のルールを組み合わせてユースケースを実現する層。adapter 経由で外部依存を利用 |
| adapter 層 | DB / LLM / Web API 等の外部依存を domain の Port (Protocol) に適合させる層 |
| re-export | 別モジュールの export をそのまま自モジュールからも export すること。依存の間接化 |
| orchestration | 複数の処理ステップを正しい順序で呼び出す制御フロー。endpoint の責務 |
| blast radius | 変更が影響する範囲の広さ。小 = 1 画面、中 = 1 機能、高 = 全機能 |
| contract test | モジュールの入出力の型と振る舞いが変わっていないことを検証するテスト |
| barrel export | 複数のモジュールの export を 1 ファイルにまとめて re-export するパターン |
| BFF (Backend for Frontend) | フロントエンド専用のバックエンド層。Next.js の API route が担う |
| Port | 外部依存を抽象化するインターフェース (`typing.Protocol`)。domain 層に定義し、adapter が実装する |
| slice | feature 単位の垂直分割。1 つの機能に関する全層 (router/service/domain/adapter) をまとめる |
| features/ | 機能ごとのビジネスロジック・UI を配置するディレクトリ (frontend) |
| bff/ | Next.js 特有の認可・課金・proxy・identity を配置するディレクトリ (frontend) |
| shared/ | framework agnostic な横断基盤 (auth session, DB client, UI component) を配置するディレクトリ |

---

## 10. 将来の改善候補（本計画外、次回レビューで判断）

| # | 項目 | 対象ファイル | レビュー節 |
|---|------|------------|-----------|
| N-1 | ReviewPanel の composition root 分離 | `src/components/es/ReviewPanel.tsx` (1,332 行) | 4-1 |
| N-2 | CompanyDetailPageClient の workflow 分離 | `src/components/companies/CompanyDetailPageClient.tsx` (1,140 行) | 4-1 |
| N-3 | CorporateInfoSection controller の workflow 分割 | `src/components/companies/corporate-info-section/use-corporate-info-controller.ts` | 4-2 |
| N-4 | ES 添削 orchestration の stream handler 分離 | `src/app/api/documents/_services/handle-review-stream.ts` (623 行), `src/hooks/useESReview.ts` (627 行) | 4-3 |
| N-5 | interview.py / gakuchika.py の domain 分割 | `backend/app/routers/interview.py`, `backend/app/routers/gakuchika.py` | CA フェーズで対応 |
| N-6 | web_search.py の分割 | `backend/app/utils/web_search.py` (2,303 行) | 3-5 |
| N-7 | logging / telemetry の観測単位統一 | `llm.py`, `web_search.py`, AI 関連 Next route | 5-1 |
| N-8 | LlmPort / VectorStorePort / Bm25Port の共通抽象 | `backend/app/utils/llm.py` + retrieval 関連 | CA-1/CA-2 の実績から判断 |
