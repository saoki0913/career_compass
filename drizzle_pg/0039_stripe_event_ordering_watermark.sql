ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "last_stripe_event_type" text,
  ADD COLUMN IF NOT EXISTS "last_stripe_event_rank" integer DEFAULT 0 NOT NULL;
