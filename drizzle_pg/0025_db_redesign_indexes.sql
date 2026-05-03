CREATE INDEX IF NOT EXISTS "deadlines_company_completed_due_idx"
ON "deadlines" ("company_id", "completed_at", "due_date");

CREATE INDEX IF NOT EXISTS "deadlines_company_open_due_idx"
ON "deadlines" ("company_id", "due_date")
WHERE "completed_at" IS NULL;

CREATE INDEX IF NOT EXISTS "tasks_deadline_status_idx"
ON "tasks" ("deadline_id", "status");

-- Rollback:
-- DROP INDEX IF EXISTS "tasks_deadline_status_idx";
-- DROP INDEX IF EXISTS "deadlines_company_open_due_idx";
-- DROP INDEX IF EXISTS "deadlines_company_completed_due_idx";
