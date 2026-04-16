#!/usr/bin/env node
/**
 * public.tasks の 0019（calendar_deadline_improvements）相当の列・FK・索引を冪等に適用する。
 * Next.js と同じ DATABASE_URL を使う（src/lib/db/index.ts と揃える）。
 *
 * Run: npm run db:repair:tasks-calendar-improvements
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
    ALTER TABLE "tasks"
    ADD COLUMN IF NOT EXISTS "depends_on_task_id" text
  `;
  await client`
    ALTER TABLE "tasks"
    ADD COLUMN IF NOT EXISTS "is_blocked" boolean NOT NULL DEFAULT false
  `;
  await client`
    ALTER TABLE "tasks"
    ADD COLUMN IF NOT EXISTS "template_key" text
  `;

  await client.unsafe(`
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_depends_on_task_id_tasks_id_fk"
    FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`);

  await client.unsafe(`
CREATE INDEX IF NOT EXISTS "tasks_depends_on_task_id_idx" ON "tasks" USING btree ("depends_on_task_id")
`);

  console.log(
    "[db:repair] tasks の depends_on_task_id / is_blocked / template_key と FK・索引を確認しました。"
  );
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[db:repair] 失敗:", msg);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
