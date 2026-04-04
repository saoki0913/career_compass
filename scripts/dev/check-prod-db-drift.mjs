#!/usr/bin/env node
/**
 * Compare production Postgres (DIRECT_URL in .env.production) with repo Drizzle journal.
 * Run: npm run check:prod-db-drift
 *
 * Exit: 0 OK | 1 schema/journal drift | 2 DB error | 3 invalid/missing env
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const journalPath = path.join(repoRoot, "drizzle_pg", "meta", "_journal.json");

function placeholderUrl(url) {
  if (!url || typeof url !== "string") return true;
  return (
    url.includes("<project-ref>") ||
    url.includes("<password>") ||
    url.includes("<host>") ||
    url.includes("<PASSWORD>") ||
    url.includes("<REF>")
  );
}

const url = process.env.DIRECT_URL?.trim();
if (placeholderUrl(url)) {
  console.error(
    "[check-prod-db-drift] DIRECT_URL が未設定かプレースホルダです。.env.production に本番の Direct(5432) URL を設定してください。"
  );
  process.exit(3);
}

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const expectedMigrations = journal.entries?.length ?? 0;
const requiredInterviewTables = ["interview_conversations", "interview_feedback_histories"];
const requiredInterviewColumns = {
  interview_conversations: [
    "role_track",
    "interview_format",
    "selection_type",
    "interview_stage",
    "interviewer_type",
    "strictness_mode",
    "interview_plan_json",
    "turn_state_json",
    "turn_meta_json",
  ],
  interview_feedback_histories: ["consistency_risks", "weakest_question_type"],
};

const sql = postgres(url, { max: 1, ssl: "require" });

try {
  const col = await sql`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'es_category'
    LIMIT 1
  `;
  const hasEsCategory = col.length > 0;
  console.log("[check-prod-db-drift] documents.es_category:", hasEsCategory ? "OK" : "MISSING");

  const interviewTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('interview_conversations', 'interview_feedback_histories')
  `;
  const presentInterviewTables = new Set(interviewTables.map((row) => row.table_name));
  const missingInterviewTables = requiredInterviewTables.filter(
    (tableName) => !presentInterviewTables.has(tableName),
  );
  console.log(
    "[check-prod-db-drift] interview persistence tables:",
    missingInterviewTables.length === 0 ? "OK" : `MISSING (${missingInterviewTables.join(", ")})`
  );

  const interviewColumns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'interview_conversations' AND column_name IN (
          'role_track',
          'interview_format',
          'selection_type',
          'interview_stage',
          'interviewer_type',
          'strictness_mode',
          'interview_plan_json',
          'turn_state_json',
          'turn_meta_json'
        ))
        OR
        (table_name = 'interview_feedback_histories' AND column_name IN (
          'consistency_risks',
          'weakest_question_type'
        ))
      )
  `;
  const presentInterviewColumns = new Set(
    interviewColumns.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const missingInterviewColumns = Object.entries(requiredInterviewColumns).flatMap(
    ([tableName, columns]) =>
      columns
        .map((columnName) => `${tableName}.${columnName}`)
        .filter((qualifiedName) => !presentInterviewColumns.has(qualifiedName)),
  );
  console.log(
    "[check-prod-db-drift] interview v2 columns:",
    missingInterviewColumns.length === 0 ? "OK" : `MISSING (${missingInterviewColumns.join(", ")})`
  );

  const metaSchemas = await sql`
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = '__drizzle_migrations'
      AND table_schema IN ('drizzle', 'public')
    ORDER BY CASE table_schema WHEN 'drizzle' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const metaSchema = metaSchemas[0]?.table_schema;
  if (!metaSchema) {
    console.error(
      "[check-prod-db-drift] __drizzle_migrations テーブルがありません。npm run db:migrate:prod を実行してください。"
    );
    process.exitCode = 1;
  } else {
    const countSql =
      metaSchema === "drizzle"
        ? sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
        : sql`SELECT count(*)::int AS count FROM public.__drizzle_migrations`;
    const [{ count: appliedRaw }] = await countSql;
    const applied = Number(appliedRaw);
    console.log(
      "[check-prod-db-drift] __drizzle_migrations applied:",
      applied,
      "expected (journal):",
      expectedMigrations,
      `(schema: ${metaSchema})`
    );

    if (applied < expectedMigrations) {
      console.error(
        "[check-prod-db-drift] 本番の Drizzle 適用がリポジトリより少ない可能性があります。make deploy-migrate を実行してください。"
      );
      process.exitCode = 1;
    }
  }

  if (!hasEsCategory) {
    console.error(
      "[check-prod-db-drift] es_category がありません。アプリコードと DB が不整合です（企業詳細などで 500 になり得ます）。make deploy-migrate を実行してください。"
    );
    process.exitCode = 1;
  }

  if (missingInterviewTables.length > 0) {
    console.error(
      `[check-prod-db-drift] interview session tables がありません (${missingInterviewTables.join(", ")})。面接対策は 500 / 503 になり得ます。make deploy-migrate を実行してください。`
    );
    process.exitCode = 1;
  }

  if (missingInterviewColumns.length > 0) {
    console.error(
      `[check-prod-db-drift] interview v2 必須カラムが不足しています (${missingInterviewColumns.join(", ")})。面接対策は 503 になり得ます。make deploy-migrate を実行してください。`
    );
    process.exitCode = 1;
  }

  if (process.exitCode === 1) {
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  console.log("[check-prod-db-drift] OK");
  await sql.end({ timeout: 5 });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[check-prod-db-drift] DB error:", msg);
  if (/ENOTFOUND|getaddrinfo/i.test(msg) && /db\.[^.]+\.supabase\.co/i.test(url)) {
    console.error(
      "[check-prod-db-drift] ヒント: db.<ref>.supabase.co は IPv6 のみのことがあり、IPv4 環境で ENOTFOUND になります。" +
        " Supabase Dashboard の Connection string で Session pooler（5432・ホスト aws-*.pooler.supabase.com）の URI を DIRECT_URL に使ってください。"
    );
  }
  try {
    await sql.end({ timeout: 2 });
  } catch {
    /* ignore */
  }
  process.exit(2);
}
