-- These indexes are intentionally CONCURRENTLY built to avoid blocking writes on
-- production-sized list/search tables. Run this migration outside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "companies_user_list_sort_idx"
  ON "companies" ("user_id", "is_pinned" DESC, "sort_order", "created_at" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "companies_guest_list_sort_idx"
  ON "companies" ("guest_id", "is_pinned" DESC, "sort_order", "created_at" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "documents_user_type_updated_at_active_idx"
  ON "documents" ("user_id", "type", "updated_at" DESC)
  WHERE "status" != 'deleted';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "documents_guest_type_updated_at_active_idx"
  ON "documents" ("guest_id", "type", "updated_at" DESC)
  WHERE "status" != 'deleted';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "gakuchika_contents_user_sort_updated_idx"
  ON "gakuchika_contents" ("user_id", "sort_order", "updated_at" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "gakuchika_contents_guest_sort_updated_idx"
  ON "gakuchika_contents" ("guest_id", "sort_order", "updated_at" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "gakuchika_conversations_gakuchika_updated_at_idx"
  ON "gakuchika_conversations" ("gakuchika_id", "updated_at" DESC);
