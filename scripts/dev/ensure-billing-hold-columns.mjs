#!/usr/bin/env node
/**
 * public.subscriptions の billing hold 系カラムを冪等に追加する（0029 相当）。
 * Next.js と同じ DATABASE_URL を使う（src/lib/db/index.ts と揃える）。
 *
 * drizzle.__drizzle_migrations だけ進んで列が無いなどのドリフト向け。
 *
 * Run: npm run db:repair:billing-hold-columns
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  process.stderr.write("[db:repair] DATABASE_URL が未設定です。\n");
  process.exit(2);
}

const shouldDisableSsl =
  url.includes("localhost") || url.includes("127.0.0.1");

const client = postgres(url, {
  max: 1,
  onnotice: () => {},
  prepare: false,
  ssl: shouldDisableSsl ? false : "require",
});

try {
  await client`
    ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "billing_hold_status" text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS "billing_hold_reason" text,
      ADD COLUMN IF NOT EXISTS "billing_hold_stripe_dispute_id" text,
      ADD COLUMN IF NOT EXISTS "billing_hold_started_at" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "billing_hold_ended_at" timestamp with time zone
  `;
  await client`
    UPDATE "subscriptions"
    SET "billing_hold_status" = 'none'
    WHERE "billing_hold_status" IS NULL
  `;
  await client`
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
    END $$
  `;
  await client`
    CREATE INDEX IF NOT EXISTS "subscriptions_billing_hold_active_idx"
      ON "subscriptions" ("user_id")
      WHERE "billing_hold_status" <> 'none'
  `;
  process.stdout.write(
    "[db:repair] subscriptions billing hold columns を確認しました（存在しなければ追加済み）。\n",
  );
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[db:repair] 失敗: ${msg}\n`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
