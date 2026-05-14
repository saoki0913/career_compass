# 保守性・可読性改善と Clean Architecture 移行ロードマップ

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


作成日: 2026-05-04 JST

## 1. 目的

就活Pass の現状実装を、保守性・可読性・デッドコード削除・Clean Architecture 移行の観点で整理し、後続実装者が PR 単位で進められる計画に落とし込む。

本計画書は **全体ロードマップ** として Next.js App Router / BFF / DB / FastAPI / RAG / UI を扱う。ただし、最初に守るべき中核は **所有権境界、DB repository、route mutation の防御線** とする。ここを閉じずに巨大 route や dead code を削ると、guest/user 所有権、課金、FastAPI principal、RAG tenant 境界の事故が起きやすいためである。

本タスクの完了条件は計画書作成であり、コード実装・migration 作成・テスト追加は行わない。

## 2. 調査範囲

主に以下を静的に確認した。

- `docs/plan/auth-guest-ownership-api-boundary-plan.md`
- `docs/plan/security-vulnerability-hardening-plan.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/BFF_FASTAPI_CONTRACT.md`
- `docs/architecture/FASTAPI_MODULE_LAYOUT.md`
- `docs/ops/DEAD_CODE_REMOVAL.md`
- `.omm/overall-architecture/**`
- `.omm/request-lifecycle/**`
- `src/app/api/**`
- `src/bff/**`
- `src/features/**`
- `src/components/**`
- `src/hooks/**`
- `src/lib/db/schema.ts`
- `src/lib/server/**`
- `backend/app/routers/**`
- `backend/app/services/**`
- `backend/app/rag/**`
- `backend/app/utils/**`
- `backend/.importlinter`
- `eslint.config.mjs`
- `package.json`

専門サブエージェントの調査結果も統合した。

- `architect`: BFF / FastAPI / shared domain / DB / external dependency の責務境界と Clean Architecture 移行案
- `code-reviewer`: dead code、巨大ファイル、未使用 export、重複ロジック、実行時リスク
- `nextjs-developer`: App Router / BFF / hooks / client component の責務混在
- `fastapi-developer`: FastAPI router / service / LLM / SSE / credit 成功時消費境界
- `database-engineer`: Drizzle schema、owner 条件付き mutation、guest migration、repository 境界
- `rag-engineer`: RAG / search / Chroma / BM25 / adapter-usecase 分離と評価ゲート

外部情報は一次情報に限定した。

- Next.js Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- FastAPI Bigger Applications: https://fastapi.tiangolo.com/tutorial/bigger-applications/
- Clean Architecture の依存方向原則: 内側の domain/usecase が外側の framework、DB、provider に依存しないことを本計画の前提にする

## 3. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/maintainability-clean-architecture-roadmap.md` が存在する。
2. 保守性・可読性・デッドコード削除・Clean Architecture 移行の現状、主要リスク、設計判断、PR 単位タスク、受け入れ条件、検証コマンドが記録されている。
3. `Task Board` は `Status / Priority / Area / Task / Evidence / Acceptance Criteria / Verification / Updated At` を持つ Markdown table で管理されている。
4. 実装フェーズで Status を更新するルールが明記されている。
5. `P0` と `P1` のタスクは、後続実装者が追加判断なしで着手できる粒度になっている。
6. 計画書作成後に、ファイル存在確認、主要見出し検索、Markdown 差分確認、`git diff --check` が実行されている。

## 4. タスク状態更新ルール

実装フェーズでは、完了条件を満たすまで次のループを続ける。

1. `Task Board` から `Todo` の最上位 Priority を 1 件選ぶ。
2. 着手時に `Status` を `Doing` へ変え、`Progress Log` に開始理由を書く。
3. 実装または検証でブロックしたら `Blocked` にし、必要な判断または環境条件を明記する。
4. 受け入れ条件を満たしたら `Review` にし、実行したテストと差分確認結果を書く。
5. レビュー後に `Done` へ変える。
6. `Todo / Doing / Blocked / Review` が残る場合は 1 に戻る。

Status は以下だけを使う。

- `Todo`: 未着手
- `Doing`: 実装中
- `Blocked`: 判断待ちまたは環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

## 5. 現状評価

### 5.1 強い点

- `docs/architecture/BFF_FASTAPI_CONTRACT.md` に BFF と FastAPI の principal、owner check、SSE、billing policy の契約がある。
- `src/bff/identity/request-identity.ts` は Better Auth session を優先し、ゲストは HttpOnly `guest_device_token` cookie から解決する。
- `src/bff/identity/owner-access.ts` に owner check の共通化が始まっている。
- `src/lib/db/schema.ts` には `companies`, `documents`, `tasks`, `motivation_conversations` など主要 owner table に `user_id XOR guest_id` check がある。
- `eslint.config.mjs` は `features -> app/bff` と `components -> bff` の禁止を持つ。
- `backend/.importlinter` は `app.services -> app.routers` の静的 import 禁止を持つ。
- `docs/ops/DEAD_CODE_REMOVAL.md` に、Knip 結果をそのまま削除しない反証手順が定義済みである。
- `backend/app/services/motivation/` は router 分割後の基準例として使える程度に service 化が進んでいる。

### 5.2 重大な弱点

- `src/app/api` の route handler が transport adapter に留まらず、identity、owner check、plan 取得、DB mutation、課金、FastAPI proxy、response shaping を同時に持つ箇所が多い。
- owner 確認後に `where id = ...` 単独で update/delete する箇所があり、repository 境界で owner 条件付き mutation を保証できていない。
- `src/lib/auth/guest.ts` の guest migration は owner table の棚卸しに追従しておらず、interview 系 owner table の移行漏れリスクがある。
- `src/lib/db/schema.ts` は 1041 行の単一ファイルで、auth、guest、company、document、billing、calendar、AI conversation、interview が同居している。
- `backend/app/routers/es_review.py` は 1340 行で、router facade ではなく RAG、grounding、SSE、telemetry、status 判定を広く握っている。
- `backend/app/services/es_review/orchestrator.py` は `_lazy_es_review()` 参照の未定義疑いがあり、通常経路または failure path で実行時例外になる可能性がある。
- `backend/app/rag/vector_store.py` と `backend/app/rag/hybrid_search.py` は Chroma、BM25、embedding、cache、query expansion、rerank、telemetry が混在している。
- `ReviewPanel.tsx`, `CompanyDetailPageClient.tsx`, `ESEditorPageClient.tsx`, `FetchInfoButton.tsx`, `useESReview.ts` など UI 側の状態主体が巨大化している。
- `npm run deadcode` は unused export / exported type 候補を多数検出するが、URL、E2E、scripts、docs、dynamic import からの反証なしに削除できない。

## 6. Clean Architecture 方針

### 6.1 採用する形

全面 rewrite は行わない。現行構成を活かし、feature slice 型の段階移行にする。

| 層 | 役割 | 置き場 |
|---|---|---|
| Route / Transport Adapter | HTTP method、request parse、identity 解決、structured error | `src/app/api/**`, `backend/app/routers/**` |
| BFF / Application | owner check、billing policy、FastAPI principal、usecase orchestration | `src/bff/**`, `src/features/**/application`, `backend/app/services/**` |
| Domain / Policy | 状態遷移、課金成功条件、RAG query policy、validation | `src/features/**/domain`, `src/lib/**` の domain module, `backend/app/**/domain` |
| Repository / Ports | owner 条件付き DB access、FastAPI/LLM/RAG/Stripe/Calendar port | `src/lib/server/repositories/**`, `backend/app/**/ports` |
| Infrastructure / Adapters | Drizzle、Chroma、BM25、OpenAI、Stripe、Google Calendar | `src/lib/db`, `src/lib/stripe`, `src/lib/calendar`, `backend/app/**/adapters`, `backend/app/utils/**` |

### 6.2 依存方向

- `domain` は framework、DB、provider SDK、route handler に依存しない。
- `application/usecase` は `ports` に依存し、Drizzle、Chroma、OpenAI、Stripe を直接 import しない。
- `route` は薄くし、body parse、identity、usecase 呼び出し、response shaping に限定する。
- `repository` は owner 条件を SQL に含め、check-then-mutate を default にしない。
- 互換 shim は deprecation window を明記し、削除条件を Task Board に持たせる。

## 7. Dead Code 削除方針

`npm run deadcode` は候補抽出の補助であり、削除判断の正本にはしない。

削除前に必ず以下を反証する。

- App Router の file-system route として生きていないか
- Playwright / AI Live / pytest / Vitest が直接 URL または symbol を参照していないか
- `package.json`, `Makefile`, `scripts/**`, `.github/**`, `docs/**` から呼ばれていないか
- dynamic import、monkeypatch target、legacy compatibility path として残していないか
- DB migration、repair script、production drift check のために必要ではないか
- guest/user ownership、credit 成功時消費、JST reset、deadline approval に関わる防御的コードではないか

削除順序は固定する。

1. UI / component / hook / helper の未使用 entrypoint を反証して削除する。
2. 呼び出しが消えた Next API / BFF / FastAPI service を削除する。
3. 削除対象だけに紐づくテストを削除または更新する。
4. DB schema / migration は最後に扱う。
5. 既存 migration は書き換えず、新規 migration で差分を表現する。

## 8. Task Board

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Verification | Updated At |
|---|---|---|---|---|---|---|---|
| Todo | P0 | Owner Boundary | owner table inventory を schema から作り、guest migration 対象との差分を出す | `src/lib/db/schema.ts`, `src/lib/auth/guest.ts` | `userId + guestId + owner_xor` を持つ table と migration 対象の差分が文書化される。interview 系 4 table の扱いが明確になる。 | `npm run test:unit -- src/app/api/guest/migrate/route.test.ts src/lib/auth/guest.test.ts` | 2026-05-04 |
| Todo | P0 | Owner Boundary | owner 条件付き mutation helper / repository primitive を追加する | `src/bff/identity/owner-access.ts`, `src/app/api/companies/[id]/route.ts`, `src/app/api/deadlines/[id]/route.ts` | `updateOwnedX/deleteOwnedX` 相当が `id + owner` 条件または transaction 内再検証を保証する。mixed/null identity は拒否される。 | `npm run test:unit -- src/bff/identity` | 2026-05-04 |
| Todo | P0 | Owner Boundary | 主要 CRUD の check-then-mutate を owner 条件付き mutation へ置き換える | `companies/[id]`, `documents/[id]`, `applications/[id]`, `deadlines/[id]`, `tasks/[id]` | 他人 ID では DB mutation、外部 I/O、credit confirm、通知作成が 0 回。private foreign owner は 404。 | `npm run test:unit -- src/app/api/companies src/app/api/documents src/app/api/tasks` | 2026-05-04 |
| Todo | P0 | Runtime Risk | `_lazy_es_review()` 未定義疑いを調査し、ES review の failure path を固定する | `backend/app/services/es_review/orchestrator.py` | undefined reference が解消されるか、呼ばれない根拠がテストで固定される。`F821` 相当を拾う lint gate がある。 | `cd backend && pytest tests/es_review && ruff check app --select F401,F821,F841` | 2026-05-04 |
| Todo | P0 | Architecture Guard | backend service から router への late-bound 逆依存を禁止する | `backend/tests/architecture/**`, `backend/.importlinter` | service 内の `app.routers` 文字列参照、`sys.modules` facade、router module injection の新規追加が guard で落ちる。既存例外は明示される。 | `cd backend && pytest tests/architecture` | 2026-05-04 |
| Todo | P1 | Next BFF | `company-info` 系 route を BFF/usecase へ分離する | `fetch-info/route.ts`, `fetch-corporate/route.ts`, `search-pages/route.ts` | route は identity、body parse、usecase call、structured response に限定される。billing、FastAPI proxy、persistence は usecase/service に移る。 | `npm run test:unit -- src/app/api/companies && npm run lint:architecture` | 2026-05-04 |
| Todo | P1 | Next BFF | raw error response を structured error へ寄せる | `src/bff/api/error-response.ts`, `src/app/api/**`, `src/bff/**` | ownership-sensitive route は `createApiErrorResponse()` を使い、`X-Request-Id` と body `requestId` を返す。raw `{ error }` は例外リスト化される。 | `node scripts/security/check-raw-error-responses.mjs` | 2026-05-04 |
| Todo | P1 | Next BFF | production/staging の FastAPI 検索失敗 mock fallback を廃止する | `src/app/api/companies/[id]/search-pages/route.ts`, `search-corporate-pages/route.ts` | 本番相当では FastAPI failure を mock 候補に変換しない。dev/test mock は明示 flag に限定する。 | `npm run test:unit -- src/app/api/companies/[id]/search-pages` | 2026-05-04 |
| Todo | P1 | FastAPI | ES review router を transport adapter へ縮小する | `backend/app/routers/es_review.py`, `backend/app/services/es_review/**` | router は `APIRouter`, auth, rate limit, request/response translation, `StreamingResponse` に限定される。SSE lifecycle は service usecase が持つ。 | `cd backend && pytest tests/es_review tests/architecture` | 2026-05-04 |
| Todo | P1 | FastAPI | Motivation / Gakuchika の router facade と service を整理する | `backend/app/routers/gakuchika.py`, `backend/app/services/motivation/facade.py` | service 側から FastAPI transport 型を減らし、schema / prompt / LLM call / SSE / draft generation の責務境界が明確になる。 | `cd backend && pytest tests/gakuchika tests/motivation tests/architecture` | 2026-05-04 |
| Todo | P1 | RAG | RAG ports/usecases/adapters の移行設計を実装単位に割る | `backend/app/rag/vector_store.py`, `backend/app/rag/hybrid_search.py` | `VectorStorePort`, `EmbeddingPort`, `KeywordIndexPort`, `RerankerPort` の導入順が決まり、既存 public API は facade として互換維持される。 | `scripts/ci/run-backend-deterministic.sh` | 2026-05-04 |
| Todo | P1 | RAG | RAG docs drift と local embedding 記述を修正する | `docs/features/COMPANY_RAG.md`, `backend/app/utils/embeddings.py`, `backend/app/utils/bm25_store.py` | local embedding fallback と BM25 path の記述が実装に一致する。doc-only diff で product code は変えない。 | `rg -n "local|BM25|embedding" docs/features/COMPANY_RAG.md` | 2026-05-04 |
| Todo | P2 | UI | ES review UI の状態主体を分割する | `src/components/es/ReviewPanel.tsx`, `src/hooks/useESReview.ts`, `src/components/es/ESEditorPageClient.tsx` | streaming transport、review state、role options、credit UI、reflect modal が独立 hook/component に分かれる。UI 表示と mutation policy が混ざらない。 | `npm run lint:ui:guardrails && npm run test:ui:review -- /es` | 2026-05-04 |
| Todo | P2 | UI | Company detail / FetchInfo UI の責務を分割する | `CompanyDetailPageClient.tsx`, `FetchInfoButton.tsx`, `CorporateInfoSection.tsx` | fetch state machine、source compliance、billing display、deadline confirmation、RAG source UI が独立する。 | `npm run test:ui:review -- /companies/[id]` | 2026-05-04 |
| Todo | P2 | Dead Code | Knip unused export 候補を領域別に反証する | `npm run deadcode` output | 候補ごとに `delete / keep / investigate` が記録され、dynamic/docs/E2E/script 参照の確認範囲が残る。 | `npm run deadcode -- --reporter compact --no-exit-code` | 2026-05-04 |
| Todo | P2 | Dead Code | compatibility shim の deprecation window を設定する | `src/hooks/gakuchika/**`, `src/lib/motivation/adapters.ts`, `src/lib/interview/adapters.ts`, `backend/app/routers/*_service.py` | shim ごとに利用元、削除条件、削除予定 PR、代替 import path が明記される。 | `rg -n "compat|shim|legacy|re-export|sys.modules" src backend/app` | 2026-05-04 |
| Todo | P2 | DB Schema | Drizzle schema の domain split を計画し、barrel 互換を保つ | `src/lib/db/schema.ts`, `src/lib/db/relations.ts` | `auth`, `ownership`, `companies`, `documents`, `calendar`, `billing`, `ai-conversations`, `notifications` への分割方針があり、既存 import surface は維持される。 | `npm run db:generate` 後に SQL 差分なしを確認 | 2026-05-04 |
| Todo | P2 | DB Schema | migration 履歴と JSONB compat shim の削除条件を明文化する | `drizzle_pg/meta/_journal.json`, `drizzle_pg/0026_db_redesign_jsonb_columns.sql`, `src/lib/db/jsonb-compat.ts` | snapshot 欠番・時系列・compat shim の残存理由と削除条件が docs に残る。既存 migration は書き換えない。 | `git diff -- drizzle_pg src/lib/db docs` | 2026-05-04 |
| Done | P0 | Planning | 保守性・CA移行ロードマップを作成する | `docs/plan/maintainability-clean-architecture-roadmap.md` | 現状評価、設計判断、Task Board、完了条件、検証コマンド、Progress Log が記載されている。 | `test -f docs/plan/maintainability-clean-architecture-roadmap.md` | 2026-05-04 |

## 9. 実装順序

1. P0 owner inventory と guest migration coverage を先に固定する。
2. owner 条件付き repository primitive を作り、主要 CRUD の check-then-mutate を置き換える。
3. `_lazy_es_review()` と backend architecture guard を修正し、実行時事故を先に潰す。
4. `company-info` 系 Next route を BFF/usecase に分ける。
5. ES review / Gakuchika / Motivation の FastAPI router/service 境界を整理する。
6. RAG ports/usecases/adapters を導入し、retrieval quality gate を維持する。
7. UI 巨大 component / hook を状態主体ごとに分割する。
8. Knip 候補を領域別に反証して dead code を削除する。
9. schema split と migration hardening は DB integrity check 後に行う。

## 10. 検証ゲート

### 10.1 計画書作成時

```bash
test -f docs/plan/maintainability-clean-architecture-roadmap.md
rg -n "完了条件|Task Board|タスク状態更新ルール|Clean Architecture|Dead Code|Progress Log" docs/plan/maintainability-clean-architecture-roadmap.md
git diff -- docs/plan/maintainability-clean-architecture-roadmap.md
git diff --check docs/plan/maintainability-clean-architecture-roadmap.md
```

### 10.2 実装フェーズ共通

```bash
npm run lint:architecture
npm run deadcode -- --reporter compact --no-exit-code
npx tsc --noEmit
npm run test:unit
cd backend && pytest tests/architecture
```

### 10.3 領域別

```bash
npm run test:unit -- src/bff/identity src/lib/auth src/app/api/guest/migrate/route.test.ts
npm run test:unit -- src/app/api/companies src/app/api/documents src/app/api/tasks
cd backend && pytest tests/es_review tests/gakuchika tests/motivation tests/company_info
scripts/ci/run-backend-deterministic.sh
npm run lint:ui:guardrails
npm run test:ui:review -- /es
```

## 11. Progress Log

| Date | Actor | Update |
|---|---|---|
| 2026-05-04 | Codex | 現状実装、既存 docs/plan 形式、専門サブエージェント調査、Next.js / FastAPI 公式 docs 確認に基づき、保守性・CA移行ロードマップを作成した。 |
