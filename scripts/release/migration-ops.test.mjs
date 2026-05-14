import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { classifySql, stripSqlForScanning } from "../ci/check-migration-safety.mjs";
import { extractPgTableNames } from "../ci/check-schema-drift.mjs";

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
