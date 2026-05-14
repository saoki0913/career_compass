# Performance / Cost Guardrails

This document records the default guardrails for high-cost paths. Feature docs may add stricter limits, but should not loosen these without an explicit review.

## Database and Payloads

- List loaders must select only fields needed by the list UI. Large text/json fields such as document content must be opt-in and loaded by detail endpoints.
- List and dashboard queries must be bounded by a plan limit, page limit, cursor, or an explicit product cap. If the product intentionally allows unlimited rows, the query must still use narrow projection and supporting indexes.
- Latest-child lookups must be batched in SQL, for example with `row_number() over (...)`, `distinct on`, or equivalent. Per-row follow-up queries are treated as N+1 regressions.
- Query shape and indexes must stay aligned. When a loader filters by owner and sorts by `updated_at`, `created_at`, pin state, or type, `src/lib/db/schema.ts` and `drizzle_pg/` must include matching non-destructive indexes.

## Rate Limits and Retries

- Public unauthenticated endpoints must have an anonymous/IP limiter before expensive work. Authenticated or guest-scoped work should add a user/device layer after identity is known.
- Client retry policies must not retry `401`, `403`, `404`, or `429`. `Retry-After` must be respected when present.
- Provider/API retries need a hard cap and should distinguish retryable transport/provider failures from validation or parse failures.

## LLM and RAG

- LLM features should keep a per-request call budget covering primary calls, parse repair, validation, fallback, and quality retry.
- Conversation prompts should use structured state/summary plus a bounded recent window, not unbounded full history.
- RAG retrieval should run cheap retrieval first and only invoke LLM assists such as query expansion or HyDE when the initial retrieval confidence is weak. Expansion and HyDE should not both run by default unless a feature-specific quality gate justifies the cost.
- Circuit breakers must be checked before provider calls and updated after provider success/failure so outages do not fan out into repeated high-cost attempts.

## Verification

- Add focused unit tests for query count or query shape when removing N+1 risks.
- Add rate-limit tests that assert `429`, `Retry-After`, and no upstream call.
- Add LLM/RAG budget tests with stubbed providers so the maximum call count is enforced without live model calls.
