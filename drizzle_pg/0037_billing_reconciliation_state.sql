ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "last_stripe_event_id" text,
  ADD COLUMN IF NOT EXISTS "last_stripe_event_created_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_entitlement_synced_at" timestamp with time zone;

ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS "idempotency_key" text,
  ADD COLUMN IF NOT EXISTS "operation_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_event_id" text;

-- SAFE: backfill status column from description text for existing rows; idempotent via WHERE clause
UPDATE "credit_transactions"
SET "status" = CASE
  WHEN "description" LIKE '%[Reserved]%' THEN 'reserved'
  WHEN "description" LIKE '%[Confirmed]%' THEN 'confirmed'
  WHEN "description" LIKE '%[Cancelling]%' THEN 'canceling'
  WHEN "description" LIKE '%[Cancelled/Refunded]%' THEN 'canceled'
  ELSE COALESCE(NULLIF("status", ''), 'applied')
END
WHERE "status" IS NULL
   OR "status" = 'applied'
   OR "description" LIKE '%[Reserved]%'
   OR "description" LIKE '%[Confirmed]%'
   OR "description" LIKE '%[Cancelling]%'
   OR "description" LIKE '%[Cancelled/Refunded]%';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "source_event_id" text;

-- SAFE: conditional constraint additions guarded by IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_status_check"
      CHECK ("status" IS NULL OR "status" IN (
        'active',
        'trialing',
        'past_due',
        'unpaid',
        'paused',
        'incomplete',
        'incomplete_expired',
        'canceled',
        'refunded',
        'dispute_lost',
        'free'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_transactions_status_check'
  ) THEN
    ALTER TABLE "credit_transactions"
      ADD CONSTRAINT "credit_transactions_status_check"
      CHECK ("status" IN ('applied', 'reserved', 'confirmed', 'canceling', 'canceled'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_idempotency_key_ux"
  ON "credit_transactions" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "credit_transactions_operation_id_idx"
  ON "credit_transactions" ("operation_id");

CREATE INDEX IF NOT EXISTS "credit_transactions_stripe_event_id_idx"
  ON "credit_transactions" ("stripe_event_id");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "notifications_billing_source_event_user_ux"
  ON "notifications" ("user_id", "source_event_id")
  WHERE "type" = 'billing_status'
    AND "user_id" IS NOT NULL
    AND "source_event_id" IS NOT NULL;
