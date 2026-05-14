CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_customer_id_ux"
  ON "subscriptions" ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;
