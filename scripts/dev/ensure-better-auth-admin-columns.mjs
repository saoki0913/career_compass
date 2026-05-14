#!/usr/bin/env node
/**
 * Ensure Better Auth Admin plugin columns exist on the app DATABASE_URL.
 *
 * Use this for local drift where the app DB has auth tables but missed
 * drizzle_pg/0033_admin_identity_owner_hardening.sql.
 */
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  process.stderr.write("[db:repair] DATABASE_URL が未設定です。\n");
  process.exit(2);
}

const parsedUrl = new URL(url);
const shouldDisableSsl =
  parsedUrl.hostname.includes("localhost") || parsedUrl.hostname.includes("127.0.0.1");

const client = postgres(url, {
  max: 1,
  onnotice: () => {},
  prepare: false,
  ssl: shouldDisableSsl ? false : "require",
});

try {
  await client`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS "banned" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "ban_reason" text,
      ADD COLUMN IF NOT EXISTS "ban_expires" timestamp with time zone
  `;
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_allowed'
      ) THEN
        ALTER TABLE "users"
          ADD CONSTRAINT "users_role_allowed"
          CHECK ("role" IN ('user', 'admin'));
      END IF;
    END $$
  `;
  await client`
    ALTER TABLE "sessions"
      ADD COLUMN IF NOT EXISTS "impersonated_by" text
  `;
  process.stdout.write(
    "[db:repair] Better Auth Admin columns を確認しました（存在しなければ追加済み）。\n",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[db:repair] 失敗: ${message}\n`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
