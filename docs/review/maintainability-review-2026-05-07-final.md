# Maintainability Review Final Rerun

- Review target: current dirty workspace at `/Users/saoki/work/career_compass`
- Review date: 2026-05-07
- Scope: re-check previous High maintainability findings against current source and boundary tests
- Result: High=0

## High Findings

No High-level maintainability blockers remain in the current dirty workspace.

Residual large files still exist, but they are no longer High by this pass because the latest changes either moved the critical responsibility boundary into focused modules or added boundary/regression tests that guard the former failure mode. The remaining concerns should be tracked as Medium refactor debt, not release-blocking High findings.

## Evidence

### ES Review Backend

- `backend/app/routers/es_review.py` remains large at 1,290 lines, and `backend/app/services/es_review/orchestrator.py` remains large at 1,425 lines.
- The router now delegates `review_section_with_template` through the service layer: `backend/app/routers/es_review.py:216`, `backend/app/routers/es_review.py:663`, `backend/app/routers/es_review.py:681`.
- Stage ownership is in the service orchestrator: `backend/app/services/es_review/orchestrator.py:138`, `backend/app/services/es_review/orchestrator.py:339`, `backend/app/services/es_review/orchestrator.py:712`, `backend/app/services/es_review/orchestrator.py:1064`, `backend/app/services/es_review/orchestrator.py:1169`.
- Boundary tests guard that ES services do not import router modules, the router does not own stage wiring, and router helper files stay compatibility shims: `backend/tests/architecture/test_es_review_ca2_boundaries.py:28`, `backend/tests/architecture/test_es_review_ca2_boundaries.py:77`, `backend/tests/architecture/test_es_review_ca2_boundaries.py:88`, `backend/tests/architecture/test_es_review_ca2_boundaries.py:108`.
- Orchestrator stage order is regression-tested: `backend/tests/es_review/test_es_review_orchestrator_regression.py:51`.

Verdict: Medium residual debt, not High.

### RAG Vector Store

- `backend/app/rag/vector_store.py` remains large at 1,594 lines.
- BM25 refresh, enhanced retrieval, and deletion helper responsibilities are now extracted: `backend/app/rag/bm25_refresh.py:15`, `backend/app/rag/retrieval.py:111`, `backend/app/rag/retrieval.py:184`, `backend/app/rag/vector_store_deletion.py:6`.
- `backend/app/rag/hybrid_search.py:624` imports BM25 refresh from `app.rag.bm25_refresh`, not from `vector_store`.
- Boundary tests guard the former coupling and compatibility wrappers: `backend/tests/rag_eval/test_vector_store_boundaries.py:7`, `backend/tests/rag_eval/test_vector_store_boundaries.py:13`, `backend/tests/rag_eval/test_vector_store_boundaries.py:20`, `backend/tests/rag_eval/test_vector_store_boundaries.py:33`.

Verdict: Medium residual debt, not High.

### ES Review UI

- `src/components/es/ReviewPanel.tsx` remains large at 1,310 lines.
- Template, role, credit, model-copy, and request parameter decisions now have a controller module: `src/components/es/review-panel-controller.ts:97`, `src/components/es/review-panel-controller.ts:151`, `src/components/es/review-panel-controller.ts:285`, `src/components/es/review-panel-controller.ts:315`, `src/components/es/review-panel-controller.ts:393`.
- The controller has focused unit coverage: `src/components/es/review-panel-controller.test.ts:57`.
- Transport/SSE parsing remains separated in `src/features/es-review/hooks/transport.ts`, while request orchestration remains in `src/hooks/useESReview.ts`.

Verdict: Medium residual UI decomposition debt, not High.

### Success-Only Billing

- Interview routes now use the shared billing policy instead of direct route-local credit lifecycle imports: `src/app/api/companies/[id]/interview/start/route.ts:4`, `src/app/api/companies/[id]/interview/stream/route.ts:4`, `src/app/api/companies/[id]/interview/continue/route.ts:4`, `src/app/api/companies/[id]/interview/feedback/route.ts:4`.
- The policy centralizes reserve/confirm/cancel behavior: `src/bff/billing/interview-inline-policy.ts:33`, `src/bff/billing/interview-inline-policy.ts:42`, `src/bff/billing/interview-inline-policy.ts:62`, `src/bff/billing/interview-inline-policy.ts:75`.
- The policy has focused tests for reservation failure, success-only confirm, and cancel behavior: `src/bff/billing/interview-inline-policy.test.ts:72`, `src/bff/billing/interview-inline-policy.test.ts:105`.

Verdict: High resolved.

### Deadline Status State

- Both deadline mutation routes now use `planDeadlineStatusTransition`: `src/app/api/deadlines/[id]/route.ts:25`, `src/app/api/deadlines/[id]/route.ts:232`, `src/app/api/deadlines/[id]/status/route.ts:17`, `src/app/api/deadlines/[id]/status/route.ts:91`.
- Task side effects are owner-scoped in both routes: `src/app/api/deadlines/[id]/route.ts:244`, `src/app/api/deadlines/[id]/route.ts:266`, `src/app/api/deadlines/[id]/route.ts:280`, `src/app/api/deadlines/[id]/status/route.ts:102`, `src/app/api/deadlines/[id]/status/route.ts:115`, `src/app/api/deadlines/[id]/status/route.ts:128`.
- The transition planner has focused tests for completed, reopened, override-completed, and clearing override flows: `src/lib/server/deadline-status.test.ts:126`.

Verdict: High resolved.

### FastAPI Router / Service Boundaries

- Motivation router compatibility is slim and delegates through an isolated shim: `backend/app/routers/motivation.py:1`, `backend/app/routers/motivation.py:10`, `backend/app/services/motivation/router_shim.py:9`.
- Motivation boundary tests guard slim router size, no service imports from routers, and sys.modules isolation: `backend/tests/architecture/test_motivation_ca1a_boundaries.py:12`, `backend/tests/architecture/test_motivation_ca1a_boundaries.py:18`, `backend/tests/architecture/test_motivation_ca1a_boundaries.py:42`, `backend/tests/architecture/test_motivation_ca1a_boundaries.py:69`.
- Company info boundary tests guard no service imports from router modules and no router module injection into services: `backend/tests/architecture/test_company_info_ca4_boundaries.py:30`, `backend/tests/architecture/test_company_info_ca4_boundaries.py:51`, `backend/tests/architecture/test_company_info_ca4_boundaries.py:68`, `backend/tests/architecture/test_company_info_ca4_boundaries.py:96`.

Verdict: Medium residual shim debt, not High.

### Motivation Retry Service Boundaries

- `backend/app/services/motivation/retry.py` now imports ES review retry/validation helpers from service modules, not router compatibility modules: `backend/app/services/motivation/retry.py:9`, `backend/app/services/motivation/retry.py:10`, `backend/app/services/motivation/retry.py:15`.
- The motivation retry router remains a compatibility shim and delegates through the shared shim installer: `backend/app/routers/motivation_retry.py:5`, `backend/app/routers/motivation_retry.py:7`, `backend/app/routers/motivation_retry.py:10`, `backend/app/services/motivation/router_shim.py:10`.
- Boundary tests explicitly guard services from importing router modules and isolate `sys.modules` facade behavior to the shim helper: `backend/tests/architecture/test_motivation_ca1a_boundaries.py:21`, `backend/tests/architecture/test_motivation_ca1a_boundaries.py:42`, `backend/tests/architecture/test_motivation_ca1a_boundaries.py:72`.
- Retry taxonomy and draft-quality helper behavior remain covered through the legacy import path for compatibility: `backend/tests/motivation/test_motivation_retry.py:5`, `backend/tests/motivation/test_motivation_retry.py:43`, `backend/tests/motivation/test_motivation_retry.py:75`.

Verdict: High resolved; remaining shim compatibility is Medium cleanup debt.

### Stripe Billing Allocation Idempotency

- Stripe webhook event processing has a processed-event claim path and skips succeeded duplicates: `src/app/api/webhooks/stripe/route.ts:102`, `src/app/api/webhooks/stripe/route.ts:135`, `src/app/api/webhooks/stripe/route.ts:150`.
- `customer.subscription.updated` now updates the subscription/profile read model before ensuring credit allocation through the shared helper: `src/app/api/webhooks/stripe/route.ts:626`, `src/app/api/webhooks/stripe/route.ts:637`, `src/app/api/webhooks/stripe/route.ts:646`.
- `updatePlanAllocation()` delegates to an idempotent allocation helper that returns without a transaction when the current monthly allocation already matches the target plan, and locks the credit row for actual deltas: `src/lib/credits/monthly-reset.ts:100`, `src/lib/credits/monthly-reset.ts:104`, `src/lib/credits/monthly-reset.ts:118`, `src/lib/credits/monthly-reset.ts:125`.
- Focused tests cover renewal allocation through the helper, update-before-allocation order, no-op allocation skips, downgrade deltas, and concurrent initialization fallback: `src/app/api/webhooks/stripe/route.test.ts:115`, `src/app/api/webhooks/stripe/route.test.ts:248`, `src/lib/credits/monthly-reset.test.ts:63`, `src/lib/credits/monthly-reset.test.ts:80`, `src/lib/credits/monthly-reset.test.ts:101`.

Verdict: High resolved; extracting Stripe webhook sub-handlers remains Medium readability debt.

## Verification

Passed:

```bash
pytest backend/tests/architecture/test_es_review_ca2_boundaries.py backend/tests/architecture/test_company_info_ca4_boundaries.py backend/tests/architecture/test_motivation_ca1a_boundaries.py backend/tests/rag_eval/test_vector_store_boundaries.py
```

Result: 19 passed.

Passed:

```bash
npm run test:unit -- src/bff/billing/interview-inline-policy.test.ts src/lib/server/deadline-status.test.ts src/components/es/review-panel-controller.test.ts
```

Result: 3 test files passed, 22 tests passed.

Passed:

```bash
pytest backend/tests/architecture/test_motivation_ca1a_boundaries.py backend/tests/motivation/test_motivation_retry.py
```

Result: 11 passed.

Passed:

```bash
npm run test:unit -- src/app/api/webhooks/stripe/route.test.ts src/lib/credits/monthly-reset.test.ts
```

Result: 2 test files passed, 24 tests passed.

## Remaining Medium Debt

- Continue decomposing `backend/app/services/es_review/orchestrator.py` into stage modules once the current behavior is stable.
- Continue shrinking `backend/app/rag/vector_store.py` toward a Chroma repository plus compatibility wrappers.
- Split `src/components/es/ReviewPanel.tsx` into smaller presentational pieces after the controller contract settles.
- Remove compatibility shims after downstream imports have migrated.
- Split `src/app/api/webhooks/stripe/route.ts` into event-specific handlers once the release-blocking idempotency path is stable.
