#!/usr/bin/env node
/**
 * public.interview_feedback_histories の evidence 系 jsonb 列を冪等に追加する（0024 相当）。
 * Next.js と同じ DATABASE_URL を使う（src/lib/db/index.ts と揃える）。
 *
 * drizzle-kit migrate が DIRECT_URL 側だけ進んでアプリ DB に列が無い場合のドリフト向け。
 *
 * Run: npm run db:repair:interview-feedback-evidence
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
  prepare: false,
  ssl: shouldDisableSsl ? false : "require",
});

try {
  await client`
    ALTER TABLE "interview_feedback_histories"
    ADD COLUMN IF NOT EXISTS "score_evidence_by_axis" jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS "score_rationale_by_axis" jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS "confidence_by_axis" jsonb DEFAULT '{}'::jsonb NOT NULL
  `;
  process.stdout.write("[db:repair] interview_feedback_histories evidence 列を確認しました（存在しなければ追加済み）。\n");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[db:repair] 失敗: ${msg}\n`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
