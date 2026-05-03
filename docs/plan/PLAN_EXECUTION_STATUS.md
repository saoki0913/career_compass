---
topic: plan-execution-status
status: 進行中
---

# docs/plan 実行ステータス

最終更新: 2026-05-03 JST

この文書は `docs/plan/EXECUTION_ORDER.md` を入口にした残タスク実行の進捗ログ。機械更新用の正本は `docs/plan/PLAN_EXECUTION_TASKS.json`。

## 現在の状態

- 既存変更の先行コミット: 完了 (`8bc9e81 feat(marketing): refresh landing assets and dashboard polish`)
- 未コミットとして残すファイル: `backend/.ai/verification/current.json`, `docs/ops/agent-usage.log`
- 次の作業: 本番前基盤改善 (`PRE_RELEASE_FOUNDATION_IMPROVEMENT_PLAN.md`) の release blocker を P0 → P1 → P2 で完了する

## 検証済みゲート

- `bash scripts/test-review-tracker.sh`
- `npm run lint:ui:guardrails`
- `npm run test:unit -- src/shared/contracts/fastapi src/lib/fastapi/sse-proxy.test.ts`
- `PYTHONPATH=. pytest backend/tests/contracts backend/tests/shared/test_career_principal.py -q`
- `npx playwright test e2e/functional/motivation.spec.ts --project=chromium`
- `npm run test:unit -- src/bff/es-review/architecture.test.ts src/features/es-review/architecture.test.ts src/app/api/documents/_services/handle-review-stream.test.ts src/features/es-review/hooks/transport.test.ts src/components/es`
- `PYTHONPATH=. pytest backend/tests/architecture/test_es_review_ca2_boundaries.py -q`
- `python -m compileall -q backend/app/services/es_review backend/app/routers/es_review.py backend/app/routers/es_review_models.py backend/app/routers/es_review_stream.py`
- `PYTHONPATH=. pytest backend/tests/es_review -k "validation or rag or company_rag or cancel or stream" -q`
- `npx playwright test e2e/functional/regression-bugs.spec.ts --project=chromium --grep "ES添削"`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test:unit -- src/components/landing src/components/dashboard src/components/layout src/components/skeletons src/lib/marketing src/lib/seo 'src/app/(marketing)/page.test.ts'`
- `bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical`
- `node scripts/git-hooks/check-git-hygiene.mjs --staged`
- `pytest backend/tests/rag_eval/test_reference_es_ingest.py -q`
- `python backend/scripts/ingest_reference_es.py --input backend/evals/rag/golden/reference_es_v1.jsonl --dry-run --ingest-session-id test-session`
- `python backend/evals/rag/compare_contextual_retrieval.py --input backend/evals/rag/golden/company_info_v1.jsonl --output /tmp/rag-contextual-comparison-full.json --top-k 5`
- `python backend/evals/rag/evaluate_reference_es.py --input backend/evals/rag/golden/reference_es_v1.jsonl --output /tmp/reference-es-eval.json --recall-k 10 --ndcg-k 5 --ingest --ingest-session-id reference-es-eval-20260501`
- `npm run test:unit -- src/components/es src/features/es-review/hooks/transport.test.ts src/app/api/documents/_services/handle-review-stream.test.ts src/lib/fastapi/sse-proxy.test.ts`
- `pytest backend/tests/es_review -k "validation or rag or company_rag or cancel or stream" -v`
- `npx tsc --noEmit`
- `npm run lint:ui:guardrails`
- `PYTHONPATH=. pytest backend/tests/architecture/test_motivation_ca1a_boundaries.py -q`
- `PYTHONPATH=. pytest backend/tests/motivation -q`
- `python -m compileall -q backend/app/services/motivation backend/app/routers/motivation.py backend/app/routers/motivation_models.py backend/app/routers/motivation_streaming.py`
- `npm run test:unit -- src/lib/db/index.test.ts`
- `npm run test:unit -- 'src/app/api/motivation/[companyId]/generate-draft/route.test.ts' 'src/app/api/motivation/[companyId]/generate-draft-direct/route.test.ts' 'src/app/api/motivation/[companyId]/resume-deepdive/route.test.ts' 'src/app/api/motivation/[companyId]/save-draft/route.test.ts' src/features/motivation/architecture.test.ts`
- `npm run test:unit -- src/components/motivation src/hooks/motivation src/features/motivation 'src/app/(product)/companies/[id]/motivation/loading.test.ts'`
- `npx tsc --noEmit`
- `npm run lint:ui:guardrails`
- `PYTHONPATH=. pytest backend/tests/architecture/test_gakuchika_ca3_boundaries.py -q`
- `python -m compileall -q backend/app/services/gakuchika backend/app/routers/gakuchika.py backend/app/routers/gakuchika_question_pipeline.py backend/app/routers/gakuchika_retry.py`
- `PYTHONPATH=. pytest backend/tests/gakuchika/test_gakuchika_retry.py backend/tests/gakuchika/test_gakuchika_next_question.py backend/tests/gakuchika/test_question_quality.py backend/tests/gakuchika/test_question_group_coverage.py -q`
- `npm run test:unit -- src/app/api/gakuchika src/bff/gakuchika src/features/gakuchika src/hooks/gakuchika src/components/gakuchika`
- `npx playwright test e2e/functional/gakuchika-completion-summary.spec.ts --project=chromium`
- `npx tsc --noEmit`
- `npm run lint`
- `PYTHONPATH=. pytest backend/tests/architecture/test_company_info_ca4_boundaries.py -q`
- `python -m compileall -q backend/app/services/company_info backend/app/routers/company_info.py backend/app/routers/company_info_schedule.py backend/app/routers/company_info_schedule_service.py backend/app/routers/company_info_schedule_links.py backend/app/routers/company_info_schedule_extraction.py backend/app/routers/company_info_rag_service.py backend/app/routers/company_info_ingest_service.py`
- `PYTHONPATH=. pytest backend/tests/company_info/test_schedule_search_policy.py backend/tests/company_info/test_pdf_ocr_schedule.py backend/tests/company_info/test_upload_pdf_ingestion.py backend/tests/company_info/test_vector_store_source_replacement.py -q`
- `npm run test:unit -- src/components/companies/CorporateInfoSection.test.ts src/features/company-info/architecture.test.ts`
- `npx playwright test e2e/functional/company-info-rag.spec.ts e2e/functional/company-info-search.spec.ts --project=chromium --workers=1`
- `npx playwright test e2e/functional/regression-bugs.spec.ts --project=chromium --grep "企業情報取得"`
- `npm run lint:architecture`
- `npm run test:unit -- src/bff/api src/bff/identity src/bff/billing src/features/es-review/hooks/transport.test.ts src/bff/es-review/architecture.test.ts src/features/es-review/architecture.test.ts`
- `PYTHONPATH=. pytest backend/tests/architecture -q`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:unit -- src/lib/server/deadline-loaders.test.ts src/lib/server/app-loaders.test.ts src/lib/server/deadline-status.test.ts src/lib/db/index.test.ts`
- `EXPLAIN ANALYZE SELECT * FROM deadlines WHERE company_id = ... AND completed_at IS NULL ORDER BY due_date ASC LIMIT 5` (`deadlines_company_open_due_idx` Index Scan)
- `EXPLAIN` for DB-8 owner/confirmed task aggregation (`tasks_deadline_status_idx` Index Only Scan)
- DB-5〜DB-7 JSON 妥当性検証 SQL（10列すべて invalid=0）
- `drizzle_pg/0026_db_redesign_jsonb_columns.sql` 直接適用後、`information_schema.columns` で対象 10 列すべて `jsonb`
- `npm run test:unit -- src/lib/gakuchika/conversation-state.test.ts src/lib/server/account-loaders.test.ts 'src/app/api/settings/profile/route.test.ts' 'src/app/api/notifications/route.test.ts' 'src/app/api/notifications/batch/route.test.ts' 'src/app/api/companies/[id]/applications/route.test.ts' 'src/app/api/gakuchika/route.test.ts' 'src/app/api/gakuchika/[id]/conversation/resume/route.test.ts' 'src/app/api/gakuchika/[id]/generate-es-draft/route.test.ts'`
- `npm run test:unit -- src/lib/db/jsonb-compat.test.ts 'src/app/api/applications/[id]/route.test.ts' src/app/api/settings/notifications/route.test.ts src/lib/server/deadline-loaders.test.ts`
- `npm run build`
- `npm run lint:architecture`

## Track 状態

| Track | 状態 | 次アクション |
|---|---:|---|
| 既存変更 snapshot | 完了 | なし |
| RAG Architecture | 完了 | Contextual Retrieval は ctx collection 0 件のため default-on しない判断。ctx backfill 後に再評価 |
| ES Review Roadmap P0 | 完了 | P1/P2 は次期計画として分離 |
| Maintainability CA | 完了 | CA-1〜CA-5 完了 |
| DB Redesign | 完了 | DB-1〜DB-8 完了 |
| Pre-release Foundation | 進行中 | P0 release blocker を release gate repair → deadcode → security → FastAPI/RAG/DB の順に実装中 |

## 運用ルール

- 作業開始時に対象 track を `in_progress` にする。
- 検証中は `verifying`、ブロッカー発生時は `blocked` にする。
- 完了時は対象 plan と `docs/review/TRACKER.md` を同時に更新する。
- `backend/.ai/**` と `docs/ops/*.log` は git hygiene 対象外として commit しない。
