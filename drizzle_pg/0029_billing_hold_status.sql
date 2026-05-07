ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_hold_status" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "billing_hold_reason" text,
  ADD COLUMN IF NOT EXISTS "billing_hold_stripe_dispute_id" text,
  ADD COLUMN IF NOT EXISTS "billing_hold_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "billing_hold_ended_at" timestamp with time zone;

UPDATE "subscriptions"
SET "billing_hold_status" = 'none'
WHERE "billing_hold_status" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_billing_hold_status_check'
  ) THEN
    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_billing_hold_status_check"
      CHECK ("billing_hold_status" IN ('none', 'dispute'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "subscriptions_billing_hold_active_idx"
  ON "subscriptions" ("user_id")
  WHERE "billing_hold_status" <> 'none';
