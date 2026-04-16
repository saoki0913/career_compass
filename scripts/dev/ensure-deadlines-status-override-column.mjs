#!/usr/bin/env node
/**
 * public.deadlines.status_override を冪等に追加する（0019 の一部相当）。
 * Next.js と同じ DATABASE_URL を使う（src/lib/db/index.ts と揃える）。
 *
 * drizzle-kit migrate が DIRECT_URL 側だけ進んでアプリ DB に列が無い場合のドリフト向け。
 *
 * Run: npm run db:repair:deadlines-status-override
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
    ALTER TABLE "deadlines"
    ADD COLUMN IF NOT EXISTS "status_override" text
  `;
  console.log("[db:repair] deadlines.status_override を確認しました（存在しなければ追加済み）。");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[db:repair] 失敗:", msg);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
