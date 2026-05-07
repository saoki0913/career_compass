ALTER TABLE "processed_stripe_events"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  ALTER COLUMN "processed_at" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_error" text,
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "stripe_created" timestamp with time zone;

UPDATE "processed_stripe_events"
SET "status" = 'succeeded',
    "started_at" = COALESCE("processed_at", now()),
    "attempt_count" = GREATEST("attempt_count", 1)
WHERE "status" IS NULL OR "status" <> 'succeeded';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'processed_stripe_events_status_check'
  ) THEN
    ALTER TABLE "processed_stripe_events"
      ADD CONSTRAINT "processed_stripe_events_status_check"
      CHECK ("status" IN ('processing', 'succeeded', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "processed_stripe_events_status_started_idx"
  ON "processed_stripe_events" ("status", "started_at");
