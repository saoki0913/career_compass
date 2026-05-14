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
import {
  detectDrizzleMetaSchema,
  readAppliedDrizzleMigrations,
} from "../ci/migration-config.mjs";

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
const requiredInterviewTables = [
  "interview_conversations",
  "interview_feedback_histories",
  "interview_turn_events",
];
const requiredSubscriptionColumns = [
  "billing_hold_status",
  "billing_hold_reason",
  "billing_hold_stripe_dispute_id",
  "billing_hold_started_at",
  "billing_hold_ended_at",
];
const requiredBetterAuthAdminColumns = {
  users: {
    role: {
      dataType: "text",
      nullable: false,
      defaultPattern: /'user'::text|'user'/,
    },
    banned: {
      dataType: "boolean",
      nullable: false,
      defaultPattern: /false/,
    },
    ban_reason: {
      dataType: "text",
      nullable: true,
    },
    ban_expires: {
      dataType: "timestamp with time zone",
      nullable: true,
    },
  },
  sessions: {
    impersonated_by: {
      dataType: "text",
      nullable: true,
    },
  },
};
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
    "active_feedback_draft",
    "current_feedback_id",
  ],
  interview_feedback_histories: [
    "consistency_risks",
    "weakest_question_type",
    "weakest_turn_id",
    "weakest_question_snapshot",
    "weakest_answer_snapshot",
    "satisfaction_score",
    "score_evidence_by_axis",
    "score_rationale_by_axis",
    "confidence_by_axis",
    "source_messages_snapshot",
  ],
  interview_turn_events: [
    "turn_id",
    "coverage_checklist_snapshot",
    "deterministic_coverage_passed",
    "format_phase",
  ],
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
      AND table_name IN ('interview_conversations', 'interview_feedback_histories', 'interview_turn_events')
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
      AND table_name IN ('interview_conversations', 'interview_feedback_histories', 'interview_turn_events')
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

  const subscriptionColumns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name IN (
        'billing_hold_status',
        'billing_hold_reason',
        'billing_hold_stripe_dispute_id',
        'billing_hold_started_at',
        'billing_hold_ended_at'
      )
  `;
  const presentSubscriptionColumns = new Set(
    subscriptionColumns.map((row) => row.column_name),
  );
  const missingSubscriptionColumns = requiredSubscriptionColumns.filter(
    (columnName) => !presentSubscriptionColumns.has(columnName),
  );
  process.stdout.write(
    `[check-prod-db-drift] subscription billing hold columns: ${
      missingSubscriptionColumns.length === 0 ? "OK" : `MISSING (${missingSubscriptionColumns.join(", ")})`
    }\n`,
  );

  const betterAuthAdminColumnRows = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'users' AND column_name IN ('role', 'banned', 'ban_reason', 'ban_expires'))
        OR (table_name = 'sessions' AND column_name = 'impersonated_by')
      )
  `;
  const presentBetterAuthAdminColumns = new Map(
    betterAuthAdminColumnRows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
  );
  const invalidBetterAuthAdminColumns = [];
  for (const [tableName, columns] of Object.entries(requiredBetterAuthAdminColumns)) {
    for (const [columnName, expected] of Object.entries(columns)) {
      const qualifiedName = `${tableName}.${columnName}`;
      const row = presentBetterAuthAdminColumns.get(qualifiedName);
      if (!row) {
        invalidBetterAuthAdminColumns.push(`${qualifiedName}:missing`);
        continue;
      }
      if (row.data_type !== expected.dataType) {
        invalidBetterAuthAdminColumns.push(`${qualifiedName}:type=${row.data_type}`);
      }
      if ((row.is_nullable === "YES") !== expected.nullable) {
        invalidBetterAuthAdminColumns.push(`${qualifiedName}:nullable=${row.is_nullable}`);
      }
      if (expected.defaultPattern && !expected.defaultPattern.test(String(row.column_default ?? ""))) {
        invalidBetterAuthAdminColumns.push(`${qualifiedName}:default`);
      }
    }
  }

  const betterAuthAdminConstraints = await sql`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname = 'users_role_allowed'
  `;
  const hasRoleConstraint = betterAuthAdminConstraints.some((row) => {
    const definition = String(row.definition ?? "");
    return /role/.test(definition) && /user/.test(definition) && /admin/.test(definition);
  });
  if (!hasRoleConstraint) {
    invalidBetterAuthAdminColumns.push("users_role_allowed:missing");
  }
  process.stdout.write(
    `[check-prod-db-drift] better auth admin columns: ${
      invalidBetterAuthAdminColumns.length === 0 ? "OK" : `MISSING (${invalidBetterAuthAdminColumns.join(", ")})`
    }\n`,
  );

  const metaSchema = await detectDrizzleMetaSchema(sql);
  if (!metaSchema) {
    console.error(
      "[check-prod-db-drift] __drizzle_migrations テーブルがありません。npm run db:migrate:prod を実行してください。"
    );
    process.exitCode = 1;
  } else {
    const appliedMigrations = await readAppliedDrizzleMigrations(sql, metaSchema);
    const applied = appliedMigrations.length;
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

  if (missingSubscriptionColumns.length > 0) {
    process.stderr.write(
      `[check-prod-db-drift] subscriptions billing hold 必須カラムが不足しています (${missingSubscriptionColumns.join(", ")})。ES添削などのクレジット消費機能は 503 になり得ます。make deploy-migrate を実行してください。\n`,
    );
    process.exitCode = 1;
  }

  if (invalidBetterAuthAdminColumns.length > 0) {
    process.stderr.write(
      `[check-prod-db-drift] Better Auth Admin 必須カラムが不足しています (${invalidBetterAuthAdminColumns.join(", ")})。Google ログインや管理セッションが 500 になり得ます。make deploy-migrate を実行してください。\n`,
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
