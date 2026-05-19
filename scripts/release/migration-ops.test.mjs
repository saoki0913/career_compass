import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { classifySql, stripSqlForScanning } from "../ci/check-migration-safety.mjs";
import { extractPgTableNames } from "../ci/check-schema-drift.mjs";
import { migrationRequiresNonTransactionalApply, splitPostgresStatements } from "./run-migrations.mjs";

test("migration classifier ignores comments and string literals", () => {
  const result = classifySql(`
    -- DROP TABLE public.users;
    /* DELETE FROM users; */
    SELECT 'ALTER TABLE users DROP COLUMN role';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nickname" text;
  `);

  assert.equal(result.classification, "expand-auto");
  assert.equal(result.findings.filter((finding) => finding.severity === "error").length, 0);
});

test("migration classifier detects destructive operations", () => {
  const result = classifySql('DROP TABLE IF EXISTS "daily_free_usage";');

  assert.equal(result.classification, "manual-contract");
  assert.equal(result.findings[0].rule, "drop-table");
});

test("migration classifier treats function and trigger changes as manual-risky", () => {
  const result = classifySql(`
    CREATE OR REPLACE FUNCTION shupass_enforce_owner_integrity()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS tasks_owner_integrity_trg ON tasks;
    CREATE TRIGGER tasks_owner_integrity_trg BEFORE INSERT OR UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION shupass_enforce_owner_integrity();
  `);

  assert.equal(result.classification, "manual-risky");
  assert.ok(result.findings.some((finding) => finding.rule === "create-function"));
  assert.ok(result.findings.some((finding) => finding.rule === "safe-recreate"));
});

test("migration classifier detects ADD COLUMN NOT NULL without DEFAULT", () => {
  const unsafe = classifySql('ALTER TABLE users ADD COLUMN role text NOT NULL;');
  const safe = classifySql("ALTER TABLE users ADD COLUMN role text DEFAULT 'user' NOT NULL;");

  assert.equal(unsafe.classification, "manual-contract");
  assert.equal(safe.classification, "expand-auto");
});

test("sql stripper preserves statement shape around dollar quoted blocks", () => {
  const stripped = stripSqlForScanning(`
    DO $$
    BEGIN
      DELETE FROM users;
    END $$;
  `);

  assert.match(stripped, /\bDO\b/);
  assert.doesNotMatch(stripped, /DELETE FROM/);
});

test("schema drift helper extracts pgTable names with TypeScript AST", () => {
  const names = extractPgTableNames(`
    export const users = pgTable("users", { id: text("id") });
    export const sessions = pgTable(
      "sessions",
      { id: text("id") },
    );
  `);

  assert.deepEqual(names, ["sessions", "users"]);
});

test("migration runner rejects transaction pooler URLs before DB access", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/release/run-migrations.mjs", "--env", "local", "--dry-run"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DIRECT_URL: "postgresql://user:pass@example.supabase.co:6543/postgres",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Transaction Pooler/);
});

test("migration runner detects CREATE INDEX CONCURRENTLY for non-transactional apply", () => {
  assert.equal(
    migrationRequiresNonTransactionalApply([
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "documents_user_idx" ON "documents" ("user_id")',
    ]),
    true,
  );
  assert.equal(
    migrationRequiresNonTransactionalApply([
      'CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_idx" ON "notifications" ("source_event_id")',
    ]),
    false,
  );
});

test("migration runner splits PostgreSQL statements without breaking dollar quoted blocks", () => {
  const statements = splitPostgresStatements([
    `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1) THEN
          RAISE NOTICE 'still one statement';
        END IF;
      END $$;

      CREATE INDEX CONCURRENTLY IF NOT EXISTS "documents_user_idx"
        ON "documents" ("user_id");
    `,
  ]);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /^DO \$\$/);
  assert.match(statements[1], /^CREATE INDEX CONCURRENTLY/);
  assert.equal(migrationRequiresNonTransactionalApply(statements), true);
});

test("migration runner splits real concurrent-index Drizzle files before apply", () => {
  const migrationFiles = readMigrationFiles({ migrationsFolder: "drizzle_pg" });
  const concurrentMigrations = migrationFiles.filter((migration) =>
    migration.sql.some((statement) => /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(statement)),
  );

  assert.ok(concurrentMigrations.length >= 2);
  for (const migration of concurrentMigrations) {
    const statements = splitPostgresStatements(migration.sql);
    const concurrentStatements = statements.filter((statement) =>
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(statement),
    );
    assert.ok(concurrentStatements.length > 0, `expected ${migration.folderMillis} to have concurrent index statements`);
    assert.ok(
      concurrentStatements.every((statement) =>
        (statement.match(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/gi) ?? []).length === 1,
      ),
      `expected ${migration.folderMillis} concurrent index statements to be separated`,
    );
  }
});
