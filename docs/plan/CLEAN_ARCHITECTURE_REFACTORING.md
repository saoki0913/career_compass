# Clean Architecture リファクタリング計画

> **superseded (2026-04-17, 2026-04-21 改訂統合)**: 本書の将来設計は [`MAINTAINABILITY_IMPROVEMENT_PLAN.md`](MAINTAINABILITY_IMPROVEMENT_PLAN.md) に吸収済み。
> 2026-04-21 の全面改訂で、本書の Phase 0-6 は CA-0〜CA-5 として正式に統合された。
> canonical は maintainability plan であり、本書は履歴参照用の案内文のみを残す。

## 参照先

- 正本: [`MAINTAINABILITY_IMPROVEMENT_PLAN.md`](MAINTAINABILITY_IMPROVEMENT_PLAN.md) (2026-04-21 改訂版)
- 統合済み章: `統合済み Architecture Direction（旧 CLEAN_ARCHITECTURE_REFACTORING）`
- CA 系タスク: 正本のセクション 5 (CA-0〜CA-5)
- 実行順: [`EXECUTION_ORDER.md`](EXECUTION_ORDER.md)

## 何が移管されたか

- `BFF ↔ FastAPI` 契約固定を先行する方針 → CA-0
- backend を `router -> service -> domain -> adapter` の完全 4 層に再整理する方針 → CA-1〜CA-4
- frontend で `features/` / `bff/` / `shared/` を明示する構成 → CA-1〜CA-4
- `motivation` を pilot、`es_review` → `gakuchika` → `company_info` の順で移行 → CA-1〜CA-4
- 全体 lint 契約 + docs 同期 → CA-5

## Phase 対応表

| 旧本書 | 正本 (改訂版) |
|--------|-------------|
| Phase 0 (BFF ↔ FastAPI 契約) | CA-0 |
| Phase 1 (motivation pilot) | CA-1 |
| Phase 2 (es_review + lint) | CA-2 |
| Phase 3 (Port 抽出) | CA-1 domain 層として統合 |
| Phase 4 (gakuchika) | CA-3 |
| Phase 5 (company_info) | CA-4 |
| Phase 6 (全体 lint + docs) | CA-5 |

以後の更新は本書ではなく `MAINTAINABILITY_IMPROVEMENT_PLAN.md` に追記する。

### Phase 0 — BFF ↔ FastAPI 契約の固定（lint なし）

- `docs/architecture/BFF_FASTAPI_CONTRACT.md` を新設し、SSE event / X-Career-Principal / BillingPolicy / Owner check / Rate limit layer を列挙
- `src/shared/contracts/` を新設、Zod schema を置く
- `backend/app/schemas/contracts.py` を新設、Pydantic mirror を置く
- 契約テスト（最小）: motivation と es_review の SSE event order の snapshot、principal token の round-trip test
- ゲート: 既存の Playwright / pytest / Vitest グリーン
- **lint 契約は導入しない**（Phase 2 で motivation/es_review slice に限定して導入）

### Phase 1 — motivation pilot（両側同時）

- backend:
  - `backend/app/services/motivation/` を新設、`routers/motivation.py` 3,487 行から会話 turn / slot-fill / draft generation を抽出
  - `routers/motivation.py` を thin router 化（< 200 行を目標、達成できなければ Phase 2 で継続）
  - 既存 `prompts/motivation_prompts.py` はそのまま `adapters/prompts/motivation/` 直下に物理移動せず **import path 互換レイヤで参照**（大規模 rename を避ける）
- frontend:
  - `src/features/motivation/` を新設、`src/hooks/useMotivationConversationController.ts` 1,010 / `useMotivationTransport.ts` 561 を `features/motivation/hooks/` へ分割
  - `src/bff/motivation/` を新設、Next API route handler を委譲
- 契約テスト: Phase 0 の schema を実際に使う
- ゲート: Playwright の motivation フロー（guest / logged-in / draft 成功・失敗）

### Phase 2 — es_review slice 移行 + lint 段階導入

- backend: `services/es_review/` と `routers/es_review_router.py`（thin）。`handle-review-stream.ts` 613 行を `src/bff/es-review/` へ移設し、review stream use case に委譲
- frontend: `src/features/es-review/` を motivation と同じ型で構築。`ReviewPanel.tsx` 1,332 行の `parts/` 分解は段階的に
- **lint 契約の段階導入**:
  - `import-linter`: motivation + es_review の 2 slice 配下で `services → domain/entities`、`routers → services`、`adapters → domain/repositories` を強制
  - `eslint-plugin-boundaries`: `features/motivation` と `features/es-review` の相互参照禁止、`features/*` から `bff/*` への直接 import 禁止
- 契約テスト: es_review の SSE event（`rewrite → sources → complete`）の order + payload

### Phase 3 — LlmPort / VectorStorePort の共通抽象確定

- 2 slice を動かして分かる「本当に欲しい Port」を確定
- `backend/app/domain/repositories/llm.py`, `vector_store.py`, `bm25.py` を書き、既存 `utils/llm.py` 3,392 / `utils/vector_store.py` / `utils/bm25_store.py` / `utils/hybrid_search.py` を `adapters/llm/*` `adapters/retrieval/*` に分割
- 再配置後、motivation / es_review の service が Port 経由に移行
- ゲート: Live LLM テスト（`backend/tests/es_review/integration/test_live_es_review_provider_report.py`）+ 新規 pytest での fake adapter ユニットテスト

### Phase 4 — gakuchika slice 移行

- 同じ型で `services/gakuchika/` + `src/features/gakuchika/` + `src/bff/gakuchika/`
- lint 契約を `features/gakuchika` と `services/gakuchika/` に拡張
- ゲート: Playwright gakuchika フロー

### Phase 5 — company_info 特殊扱い

- 他 slice と違い `routers/company_info.py` 5,424 行は **Web 検索 + スクレイピング + PDF OCR + RAG 構築 + 締切抽出 + ユーザー承認フロー**の多機能統合。一気に分解しない
- サブタスク:
  - 5a. `services/company_info/fetch_schedule.py` を先に切り出す（すでに frontend 側の `corporate-info-section/*` 分割と整合）
  - 5b. `services/company_info/build_rag_source.py`（RAG 構築、vector_store adapter 経由）
  - 5c. `services/company_info/extract_deadlines.py`（締切承認フローは `domain/entities/company_info.py` の `PendingDeadline` で表現）
- frontend: `src/features/company-info/` は既存 `components/companies/corporate-info-section/*` の移設で済む（軽い）
- ゲート: Playwright 企業情報取得 + 締切承認フロー

### Phase 6 — 全体 lint 契約 + ドキュメント同期

- `import-linter` と `eslint-plugin-boundaries` をリポジトリ全体に拡大
- `docs/architecture/ARCHITECTURE.md` / `CLAUDE.md` / `AGENTS.md` を更新
- 旧 `src/lib/api-route/`, `src/app/api/_shared/`, `src/hooks/es-review/` の **残骸コードを削除**

---

## 4. 進捗チェックボックス

- [ ] Phase 0. BFF ↔ FastAPI 契約固定（文書 + Zod/Pydantic mirror + 最小契約テスト）
- [ ] Phase 1. motivation pilot（両側同時、lint 無し）
- [ ] Phase 2. es_review 移行 + motivation/es_review だけ lint 導入
- [ ] Phase 3. LlmPort / VectorStorePort / Bm25Port 抽出（2 slice の実利用から確定）
- [ ] Phase 4. gakuchika 移行 + lint 拡張
- [ ] Phase 5a. company_info: fetch_schedule 分割
- [ ] Phase 5b. company_info: build_rag_source 分割
- [ ] Phase 5c. company_info: extract_deadlines + 承認フロー
- [ ] Phase 6. 全体 lint 契約 + docs 同期 + 残骸削除

---

## 5. 修正対象ファイル対応表（更新版）

### Backend（実在行数で記載）

| 現行 | 行数 | 移行先 Phase | 移行先 |
|---|---|---|---|
| `backend/app/routers/motivation.py` | 3,487 | Phase 1 | `routers/motivation_router.py`（thin） + `services/motivation/*.py` + `domain/entities/motivation.py` |
| `backend/app/routers/es_review.py` | 4,802 | Phase 2 | `routers/es_review_router.py` + `services/es_review/*.py` + `domain/entities/es_review.py` |
| `backend/app/utils/llm.py` | 3,392 | Phase 3 | `adapters/llm/*` + `domain/repositories/llm.py` |
| `backend/app/utils/llm_streaming.py` / `llm_providers.py` / `llm_model_routing.py` / `llm_client_registry.py` / `llm_usage_cost.py` | — | Phase 3 | `adapters/llm/*` |
| `backend/app/utils/vector_store.py` / `bm25_store.py` / `hybrid_search.py` / `reranker.py` / `embeddings.py` / `text_chunker.py` / `content_classifier.py` / `japanese_tokenizer.py` | — | Phase 3 | `adapters/retrieval/*` |
| `backend/app/utils/web_search.py` | — | Phase 3 | `adapters/web/*` |
| `backend/app/prompts/**` | — | Phase 3 | `adapters/prompts/**`（ファイル構造維持） |
| `backend/app/routers/gakuchika.py` | — | Phase 4 | `routers/gakuchika_router.py` + `services/gakuchika/*` |
| `backend/app/routers/company_info.py` | 5,424 | Phase 5a/b/c | `routers/company_info_router.py` + `services/company_info/{fetch_schedule,build_rag_source,extract_deadlines}.py` |
| `backend/app/security/career_principal.py` / `sse_concurrency.py` / `internal_service.py` | — | 維持 | そのまま `security/` |

### Frontend（実在行数で記載）

| 現行 | 行数 | 移行先 Phase | 移行先 |
|---|---|---|---|
| `src/hooks/useMotivationConversationController.ts` | 1,010 | Phase 1 | `src/features/motivation/hooks/useMotivationConversation.ts` + 分割 |
| `src/hooks/useMotivationTransport.ts` | 561 | Phase 1 | `src/features/motivation/hooks/useMotivationTransport.ts` |
| `src/lib/motivation/conversation.ts` | 671 | Phase 1 | `src/features/motivation/{application,domain}/` |
| `src/app/api/documents/_services/handle-review-stream.ts` | 613 | Phase 2 | `src/bff/es-review/handleReviewStream.ts`（thin 化 + service 呼び出し） |
| `src/components/es/ReviewPanel.tsx` | 1,332 | Phase 2 | `src/features/es-review/ui/ReviewPanel.tsx` + `parts/` 段階分解 |
| `src/hooks/useESReview.ts` | 627 | Phase 2 | `src/features/es-review/hooks/useEsReview.ts`（既存 `src/hooks/es-review/*` を取り込む） |
| `src/hooks/es-review/{transport,playback,sse-steps,types,template-meta}.ts` | — | Phase 2 | `src/features/es-review/hooks/` に同名で移設 |
| `src/lib/api-route/billing/**` | — | Phase 0-2 | `src/bff/billing/` |
| `src/app/api/_shared/{request-identity,owner-access,llm-cost-guard}.ts` | — | Phase 0-2 | `src/bff/identity/` |
| `src/lib/rate-limit*.ts` | — | Phase 0-2 | `src/bff/rate-limit/` |
| `src/lib/fastapi/**` | — | Phase 0-2 | `src/bff/fastapi/` |
| `src/lib/auth/**` | — | Phase 1 | `src/shared/auth/**` |
| `src/lib/db/**` | — | Phase 1 | `src/shared/db/**` |
| `src/lib/credits/**` / `src/lib/stripe/**` | — | Phase 1 | `src/shared/billing/**` |
| `src/components/ui/**`（shadcn） | — | Phase 1 | `src/shared/ui/**` |
| `src/components/companies/corporate-info-section/**` | 分割済 596 + 子 | Phase 5 | `src/features/company-info/ui/**`（軽量移設） |

---

## 6. 検証計画

1. **契約テスト（Phase 0 から）**
   - `tests/contracts/sse-motivation.spec.ts`: motivation SSE event の payload 順序
   - `backend/tests/contracts/test_career_principal_roundtrip.py`: BFF→FastAPI の HMAC round-trip
   - `backend/tests/contracts/test_billing_state.py`: precheck/reserve/confirm/cancel の state machine
2. **既存テスト維持**
   - `npm run test:unit` / `npm run test:e2e` / `cd backend && pytest`
   - `backend/tests/es_review/integration/test_live_es_review_provider_report.py`
3. **段階 lint**
   - Phase 2 から pilot slice 配下のみ `import-linter` / `eslint-plugin-boundaries`
   - Phase 6 で全体適用
4. **UI Change Workflow** を各 Phase で遵守
   - `npm run ui:preflight -- <route> --surface=product --auth=guest`
   - `npm run lint:ui:guardrails`
   - `npm run test:ui:review -- <route>`
5. **性能退行**
   - pilot route（motivation stream）の Server-Timing を Phase 前後で比較
6. **ドキュメント同期**
   - 各 Phase 完了時に `docs/architecture/ARCHITECTURE.md` + `docs/architecture/BFF_FASTAPI_CONTRACT.md` を更新
   - `CLAUDE.md` と `AGENTS.md` の「Core Architecture Notes」を同期

---

## 7. リスクと対応

| リスク | 対応 |
|---|---|
| motivation pilot で BFF ↔ FastAPI の契約が不足と判明 | Phase 1 内で契約を拡張し、Phase 0 文書を更新。**es_review 着手前にゲート**を置く |
| `routers/motivation.py` 3,487 行の分解で動的 import / 循環参照が出る | 既存の `motivation_context` / `motivation_planner` / `motivation_contract` は維持したまま service 層を上に追加（in-place refactor） |
| Phase 3 の LlmPort 抽出が早すぎる抽象化になる | 2 slice 実装で共通点が出るまで抽出しない（抽出条件を Phase 3 の DoD に記載） |
| company_info（Phase 5）で締切承認フローが壊れる | フィーチャーフラグで新旧両経路を並走、Playwright でユーザー承認フローを検証 |
| 依存 lint を全体適用して既存コードが違反祭りになる | Phase 2 から slice 単位で段階導入。Phase 6 で contract を拡大 |

---

## 8. 採用しない / 先送りにしたもの

- canonical な 5 層 Clean Architecture の厳密適用（`interfaces/` 層など）— 過剰抽象のため **`routers/` + `routers/schemas/`** に圧縮
- Rich Domain Model（frozen dataclass / Aggregate / VO）— Pydantic BaseModel に留める（qai-generator 方針踏襲）
- `Injector` ライブラリ — FastAPI `Depends()` で代替
- FSD の `pages` / `widgets` / `entities` 層 — Next.js App Router では省略可（公式準拠）
- Phase 0 全体 lint — pilot で十分性を確認してから拡大

---

## 9. 参考文献

- **FastAPI Bigger Applications** — https://fastapi.tiangolo.com/tutorial/bigger-applications/
- **Next.js App Router project structure** — https://nextjs.org/docs/app/getting-started/project-structure
- **Feature-Sliced Design overview & layers** — https://feature-sliced.design/docs/get-started/overview（pages/widgets/entities は省略可、との明記あり）
- Robert C. Martin, *Clean Architecture*（2017）
- Alistair Cockburn, *Hexagonal Architecture*（2005）
- Jeffrey Palermo, *The Onion Architecture*（2008）
- qai-generator-backend（`/Users/saoki/work/qai-generator-backend`）
- qai-generator-frontend（`/Users/saoki/work/qai-generator-frontend`）

---

## 関連ドキュメント

- [`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) — システム全体構成（Phase 完了ごとに更新）
- [`docs/architecture/BILLING_STATE_MACHINE.md`](../architecture/BILLING_STATE_MACHINE.md) — Billing policy の既存仕様
- [`docs/architecture/TENANT_ISOLATION_AUDIT.md`](../architecture/TENANT_ISOLATION_AUDIT.md) — Principal 分離の既存監査
- [`docs/ops/AI_DEVELOPMENT_PRINCIPLES.md`](../ops/AI_DEVELOPMENT_PRINCIPLES.md) — 高リスク変更の運用ルール
- [`docs/plan/MAINTAINABILITY_IMPROVEMENT_PLAN.md`](./MAINTAINABILITY_IMPROVEMENT_PLAN.md) — 保守性改善計画との整合を取る
