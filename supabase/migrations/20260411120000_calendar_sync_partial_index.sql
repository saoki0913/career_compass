-- Phase 5B: Partial index for calendar_sync_jobs pending lookup
-- Must run outside a transaction (CONCURRENTLY) so placed in separate migration.
-- Supabase applies each migration file in its own transaction, but
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- If this migration fails, re-run it manually via psql.

CREATE INDEX CONCURRENTLY IF NOT EXISTS calendar_sync_jobs_pending_scheduled_idx
  ON calendar_sync_jobs(scheduled_at) WHERE status = 'pending';
