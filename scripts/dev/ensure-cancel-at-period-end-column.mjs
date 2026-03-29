#!/usr/bin/env node
/**
 * public.subscriptions.cancel_at_period_end を冪等に追加する（0014 相当）。
 * Next.js と同じ DATABASE_URL を使う（src/lib/db/index.ts と揃える）。
 *
 * drizzle.__drizzle_migrations だけ進んで列が無いなどのドリフト向け。
 *
 * Run: npm run db:repair:subscription-cancel-column
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("[db:repair] DATABASE_URL が未設定です。");
  process.exit(2);
}

const shouldDisableSsl =
  url.includes("localhost") || url.includes("127.0.0.1");

const client = postgres(url, {
  max: 1,
  prepare: false,
  ssl: shouldDisableSsl ? false : "require",
});

try {
  await client`
    ALTER TABLE "subscriptions"
    ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean DEFAULT false NOT NULL
  `;
  console.log("[db:repair] subscriptions.cancel_at_period_end を確認しました（存在しなければ追加済み）。");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[db:repair] 失敗:", msg);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
