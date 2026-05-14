#!/usr/bin/env node
/**
 * Validate the local app database before starting Next.js dev.
 *
 * This intentionally checks DATABASE_URL, not DIRECT_URL, because Next.js and
 * Better Auth use DATABASE_URL at runtime. A migrated DIRECT_URL with a stale
 * DATABASE_URL still breaks Google OAuth callbacks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const journalPath = path.join(repoRoot, "drizzle_pg", "meta", "_journal.json");

const requiredColumns = {
  users: {
    role: { dataType: "text", nullable: false, defaultPattern: /'user'::text|'user'/ },
    banned: { dataType: "boolean", nullable: false, defaultPattern: /false/ },
    ban_reason: { dataType: "text", nullable: true },
    ban_expires: { dataType: "timestamp with time zone", nullable: true },
  },
  sessions: {
    impersonated_by: { dataType: "text", nullable: true },
  },
};

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function expectedMigrationCount() {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return journal.entries?.length ?? 0;
}

function isLocalUrl(url) {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

function formatFailure(missing, applied, expected) {
  const migrationLine =
    applied === null
      ? "__drizzle_migrations が見つかりません。"
      : `適用済み migration: ${applied}/${expected}`;

  return [
    "",
    "Local DB drift preflight failed.",
    "Google ログインに必要な Better Auth Admin カラムが、Next.js の接続先 DB にありません。",
    migrationLine,
    `不足/不整合: ${missing.join(", ")}`,
    "",
    "次の順で復旧してください:",
    "1. npm run db:repair:better-auth-admin-columns",
    "2. npm run db:migrate:as-app",
    "3. npm run dev",
    "",
    "補足: npm run db:migrate は DIRECT_URL を優先します。今回の確認はアプリ実行時と同じ DATABASE_URL に対して行っています。",
    "",
  ].join("\n");
}

const url = clean(process.env.DATABASE_URL);
if (!url) {
  process.stdout.write("Local DB drift preflight: SKIPPED (DATABASE_URL is not set)\n");
  process.exit(0);
}

if (process.env.CAREER_COMPASS_SKIP_LOCAL_DB_DRIFT_CHECK === "1") {
  process.stdout.write("Local DB drift preflight: SKIPPED (CAREER_COMPASS_SKIP_LOCAL_DB_DRIFT_CHECK=1)\n");
  process.exit(0);
}

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  process.stderr.write("Local DB drift preflight failed: DATABASE_URL is not a valid URL.\n");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  prepare: false,
  ssl: isLocalUrl(parsedUrl.hostname) ? false : "require",
});

try {
  const columnRows = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'users' AND column_name IN ('role', 'banned', 'ban_reason', 'ban_expires'))
        OR (table_name = 'sessions' AND column_name = 'impersonated_by')
      )
  `;

  const presentColumns = new Map(
    columnRows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
  );
  const invalidColumns = [];

  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    for (const [columnName, expected] of Object.entries(columns)) {
      const qualifiedName = `${tableName}.${columnName}`;
      const row = presentColumns.get(qualifiedName);
      if (!row) {
        invalidColumns.push(`${qualifiedName}:missing`);
        continue;
      }
      if (row.data_type !== expected.dataType) {
        invalidColumns.push(`${qualifiedName}:type=${row.data_type}`);
      }
      if ((row.is_nullable === "YES") !== expected.nullable) {
        invalidColumns.push(`${qualifiedName}:nullable=${row.is_nullable}`);
      }
      if (expected.defaultPattern && !expected.defaultPattern.test(String(row.column_default ?? ""))) {
        invalidColumns.push(`${qualifiedName}:default`);
      }
    }
  }

  const roleConstraints = await sql`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname = 'users_role_allowed'
  `;
  const hasRoleConstraint = roleConstraints.some((row) => {
    const definition = String(row.definition ?? "");
    return /role/.test(definition) && /user/.test(definition) && /admin/.test(definition);
  });
  if (!hasRoleConstraint) {
    invalidColumns.push("users_role_allowed:missing");
  }

  const metaSchemas = await sql`
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = '__drizzle_migrations'
      AND table_schema IN ('drizzle', 'public')
    ORDER BY CASE table_schema WHEN 'drizzle' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const metaSchema = metaSchemas[0]?.table_schema;
  let appliedMigrations = null;
  if (metaSchema) {
    const countSql =
      metaSchema === "drizzle"
        ? sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
        : sql`SELECT count(*)::int AS count FROM public.__drizzle_migrations`;
    const [{ count }] = await countSql;
    appliedMigrations = Number(count);
  }

  if (invalidColumns.length > 0) {
    process.stderr.write(formatFailure(invalidColumns, appliedMigrations, expectedMigrationCount()));
    process.exitCode = 1;
  } else {
    process.stdout.write("Local DB drift preflight: OK\n");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    [
      "",
      "Local DB drift preflight failed: DB に接続できませんでした。",
      `理由: ${message}`,
      "Google ログインを使う場合は DATABASE_URL の接続先と起動中の DB を確認してください。",
      "一時的に DB を使わない画面だけ確認する場合は CAREER_COMPASS_SKIP_LOCAL_DB_DRIFT_CHECK=1 npm run dev でスキップできます。",
      "",
    ].join("\n"),
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
