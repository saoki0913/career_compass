#!/usr/bin/env node
/**
 * Local static gate for db-high-load-readiness-p0.
 *
 * This intentionally does not read .env files or connect to any database. It
 * verifies the repository artifacts that must be reviewed before production DB
 * migration: Drizzle journal entries, custom SQL, snapshots, and schema.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.join(__dirname, "..", "..");

export const REQUIRED_INDEXES = [
  {
    name: "deadlines_company_completed_due_idx",
    table: "deadlines",
    columns: ["company_id", "completed_at", "due_date"],
    schemaColumns: ["companyId", "completedAt", "dueDate"],
  },
  {
    name: "deadlines_company_open_due_idx",
    table: "deadlines",
    columns: ["company_id", "due_date"],
    schemaColumns: ["companyId", "dueDate"],
    whereSql: '"completed_at" IS NULL',
    snapshotWhere: '"deadlines"."completed_at" is null',
    schemaWhere: "completedAt",
  },
  {
    name: "tasks_deadline_status_idx",
    table: "tasks",
    columns: ["deadline_id", "status"],
    schemaColumns: ["deadlineId", "status"],
  },
];

export const REQUIRED_JSONB_COLUMNS = [
  { table: "companies", column: "corporate_info_urls" },
  { table: "applications", column: "phase" },
  { table: "notifications", column: "data" },
  { table: "user_profiles", column: "target_industries" },
  { table: "user_profiles", column: "target_job_types" },
  { table: "notification_settings", column: "reminder_timing" },
  { table: "notification_settings", column: "deadline_reminder_overrides" },
  { table: "deadlines", column: "auto_completed_task_ids" },
  { table: "gakuchika_conversations", column: "star_scores" },
  { table: "ai_messages", column: "metadata" },
];

const REQUIRED_JOURNAL_TAGS = [
  "0025_db_redesign_indexes",
  "0026_db_redesign_jsonb_columns",
];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function addFailure(failures, id, message) {
  failures.push({ id, message });
}

function tableSnapshot(snapshot, tableName) {
  const tables = snapshot.tables ?? {};
  return Object.values(tables).find((table) => table.name === tableName);
}

function assertJournal({ repoRoot, failures }) {
  const journalPath = path.join(repoRoot, "drizzle_pg", "meta", "_journal.json");
  const journal = readJson(journalPath);
  const tags = new Set((journal.entries ?? []).map((entry) => entry.tag));

  for (const tag of REQUIRED_JOURNAL_TAGS) {
    if (!tags.has(tag)) {
      addFailure(failures, `journal:${tag}`, `drizzle_pg/meta/_journal.json is missing ${tag}`);
    }

    const sqlPath = path.join(repoRoot, "drizzle_pg", `${tag}.sql`);
    if (!fs.existsSync(sqlPath)) {
      addFailure(failures, `migration:${tag}`, `missing migration SQL: drizzle_pg/${tag}.sql`);
    }

    const snapshotPath = path.join(repoRoot, "drizzle_pg", "meta", `${tag.split("_")[0]}_snapshot.json`);
    if (!fs.existsSync(snapshotPath)) {
      addFailure(
        failures,
        `snapshot:${tag}`,
        `missing migration snapshot: drizzle_pg/meta/${tag.split("_")[0]}_snapshot.json`,
      );
    }
  }
}

function assertIndexReadiness({ repoRoot, schemaText, failures }) {
  const migrationSql = readText(path.join(repoRoot, "drizzle_pg", "0025_db_redesign_indexes.sql"));
  const normalizedSql = normalizeSql(migrationSql);
  const snapshot = readJson(path.join(repoRoot, "drizzle_pg", "meta", "0026_snapshot.json"));

  if (!/--\s*rollback:/i.test(migrationSql)) {
    addFailure(failures, "0025:rollback", "0025 migration is missing rollback SQL comments");
  }

  for (const required of REQUIRED_INDEXES) {
    const quotedColumns = required.columns.map((column) => `"${column}"`).join(", ");
    const createPattern = normalizeSql(
      `CREATE INDEX IF NOT EXISTS "${required.name}" ON "${required.table}" (${quotedColumns})`,
    );
    if (!normalizedSql.includes(createPattern)) {
      addFailure(
        failures,
        `0025:index:${required.name}`,
        `0025 migration is missing ${required.name} on ${required.table}(${required.columns.join(", ")})`,
      );
    }

    if (required.whereSql && !normalizedSql.includes(normalizeSql(`WHERE ${required.whereSql}`))) {
      addFailure(
        failures,
        `0025:index:${required.name}:where`,
        `0025 migration is missing WHERE ${required.whereSql} for ${required.name}`,
      );
    }

    const schemaIndexStart = schemaText.indexOf(`index("${required.name}")`);
    if (schemaIndexStart === -1) {
      addFailure(failures, `schema:index:${required.name}`, `schema.ts is missing index ${required.name}`);
    } else {
      const schemaIndexBlock = schemaText.slice(schemaIndexStart, schemaIndexStart + 280);
      for (const column of required.schemaColumns) {
        if (!schemaIndexBlock.includes(`t.${column}`)) {
          addFailure(
            failures,
            `schema:index:${required.name}:${column}`,
            `schema.ts index ${required.name} is missing t.${column}`,
          );
        }
      }
      if (required.schemaWhere && !schemaIndexBlock.includes(required.schemaWhere)) {
        addFailure(
          failures,
          `schema:index:${required.name}:where`,
          `schema.ts index ${required.name} is missing partial index predicate`,
        );
      }
    }

    const table = tableSnapshot(snapshot, required.table);
    const snapshotIndex = table?.indexes?.[required.name];
    if (!snapshotIndex) {
      addFailure(failures, `snapshot:index:${required.name}`, `0026 snapshot is missing ${required.name}`);
      continue;
    }
    const snapshotColumns = (snapshotIndex.columns ?? []).map((column) => column.expression);
    if (snapshotColumns.join(",") !== required.columns.join(",")) {
      addFailure(
        failures,
        `snapshot:index:${required.name}:columns`,
        `0026 snapshot ${required.name} columns are ${snapshotColumns.join(", ") || "(none)"}`,
      );
    }
    if (required.snapshotWhere && snapshotIndex.where !== required.snapshotWhere) {
      addFailure(
        failures,
        `snapshot:index:${required.name}:where`,
        `0026 snapshot ${required.name} where predicate is ${snapshotIndex.where ?? "(missing)"}`,
      );
    }
  }
}

function assertJsonbReadiness({ repoRoot, schemaText, failures }) {
  const migrationSql = readText(path.join(repoRoot, "drizzle_pg", "0026_db_redesign_jsonb_columns.sql"));
  const normalizedSql = normalizeSql(migrationSql);
  const snapshot = readJson(path.join(repoRoot, "drizzle_pg", "meta", "0026_snapshot.json"));

  if (!normalizedSql.includes("create or replace function pg_temp.is_valid_jsonb")) {
    addFailure(failures, "0026:preflight:function", "0026 migration is missing pg_temp.is_valid_jsonb preflight");
  }
  if (!/--\s*rollback:/i.test(migrationSql)) {
    addFailure(failures, "0026:rollback", "0026 migration is missing rollback SQL comments");
  }
  if (!/Deployment order:/i.test(migrationSql)) {
    addFailure(failures, "0026:deployment-order", "0026 migration is missing app/DB deployment order notes");
  }

  for (const required of REQUIRED_JSONB_COLUMNS) {
    const qualified = `${required.table}.${required.column}`;
    const table = tableSnapshot(snapshot, required.table);
    const column = table?.columns?.[required.column];
    if (column?.type !== "jsonb") {
      addFailure(
        failures,
        `snapshot:jsonb:${qualified}`,
        `0026 snapshot expected ${qualified} to be jsonb, got ${column?.type ?? "(missing)"}`,
      );
    }

    if (!schemaText.includes(`jsonb("${required.column}")`)) {
      addFailure(failures, `schema:jsonb:${qualified}`, `schema.ts is missing jsonb("${required.column}")`);
    }

    const preflightPattern = normalizeSql(
      `SELECT 1 FROM "${required.table}" WHERE "${required.column}" IS NOT NULL AND NOT pg_temp.is_valid_jsonb("${required.column}")`,
    );
    const hasSpecialCompaniesPreflight =
      qualified === "companies.corporate_info_urls" &&
      normalizedSql.includes(normalizeSql(`FROM "companies" WHERE "corporate_info_urls" IS NOT NULL`)) &&
      normalizedSql.includes(normalizeSql(`NOT pg_temp.is_valid_jsonb("corporate_info_urls")`));
    if (!normalizedSql.includes(preflightPattern) && !hasSpecialCompaniesPreflight) {
      addFailure(
        failures,
        `0026:preflight:${qualified}`,
        `0026 migration is missing invalid JSON preflight for ${qualified}`,
      );
    }

    const alterPattern = normalizeSql(
      `ALTER COLUMN "${required.column}" TYPE jsonb USING CASE WHEN "${required.column}" IS NULL THEN NULL ELSE "${required.column}"::jsonb END`,
    );
    const hasSpecialCompaniesAlter =
      qualified === "companies.corporate_info_urls" &&
      normalizedSql.includes(normalizeSql(`ALTER COLUMN "corporate_info_urls" TYPE jsonb`)) &&
      normalizedSql.includes(normalizeSql(`ELSE "corporate_info_urls"::jsonb`));
    if (!normalizedSql.includes(alterPattern) && !hasSpecialCompaniesAlter) {
      addFailure(
        failures,
        `0026:alter:${qualified}`,
        `0026 migration is missing jsonb ALTER COLUMN conversion for ${qualified}`,
      );
    }
  }
}

export function checkDbHighLoadReadiness({ repoRoot = defaultRepoRoot } = {}) {
  const failures = [];
  const schemaText = readText(path.join(repoRoot, "src", "lib", "db", "schema.ts"));

  assertJournal({ repoRoot, failures });
  assertIndexReadiness({ repoRoot, schemaText, failures });
  assertJsonbReadiness({ repoRoot, schemaText, failures });

  return {
    ok: failures.length === 0,
    failures,
    checked: {
      journalTags: REQUIRED_JOURNAL_TAGS,
      indexes: REQUIRED_INDEXES.map((index) => index.name),
      jsonbColumns: REQUIRED_JSONB_COLUMNS.map((column) => `${column.table}.${column.column}`),
    },
  };
}

function writeLine(stream, line) {
  stream.write(`${line}\n`);
}

function main() {
  const result = checkDbHighLoadReadiness();
  if (result.ok) {
    writeLine(process.stdout, "[check-db-high-load-readiness] OK");
    writeLine(
      process.stdout,
      `[check-db-high-load-readiness] checked ${result.checked.indexes.length} indexes, ${result.checked.jsonbColumns.length} jsonb columns, ${result.checked.journalTags.length} journal tags`,
    );
    return;
  }

  writeLine(process.stderr, "[check-db-high-load-readiness] FAILED");
  for (const failure of result.failures) {
    writeLine(process.stderr, `- ${failure.id}: ${failure.message}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
