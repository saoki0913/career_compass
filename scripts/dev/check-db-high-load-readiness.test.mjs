import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDbHighLoadReadiness } from "./check-db-high-load-readiness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function copyReadinessFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "db-readiness-"));
  const paths = [
    "drizzle_pg/0025_db_redesign_indexes.sql",
    "drizzle_pg/0026_db_redesign_jsonb_columns.sql",
    "drizzle_pg/meta/_journal.json",
    "drizzle_pg/meta/0025_snapshot.json",
    "drizzle_pg/meta/0026_snapshot.json",
    "src/lib/db/schema.ts",
  ];

  for (const relativePath of paths) {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  return tempRoot;
}

function overwriteRelative(root, relativePath, transform) {
  const target = path.join(root, relativePath);
  fs.writeFileSync(target, transform(fs.readFileSync(target, "utf8")));
}

test("current repository passes DB high-load readiness static gate", () => {
  const result = checkDbHighLoadReadiness({ repoRoot });
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.equal(result.checked.indexes.length, 3);
  assert.equal(result.checked.jsonbColumns.length, 10);
});

test("readiness gate detects missing required index migration SQL", () => {
  const tempRoot = copyReadinessFixture();
  overwriteRelative(tempRoot, "drizzle_pg/0025_db_redesign_indexes.sql", (sql) =>
    sql.replace(/CREATE INDEX IF NOT EXISTS "tasks_deadline_status_idx"[\s\S]*?;\n/, ""),
  );

  const result = checkDbHighLoadReadiness({ repoRoot: tempRoot });
  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.id === "0025:index:tasks_deadline_status_idx"));
});

test("readiness gate detects missing JSONB schema and snapshot type", () => {
  const tempRoot = copyReadinessFixture();
  overwriteRelative(tempRoot, "src/lib/db/schema.ts", (schema) =>
    schema.replace('corporateInfoUrls: jsonb("corporate_info_urls")', 'corporateInfoUrls: text("corporate_info_urls")'),
  );
  overwriteRelative(tempRoot, "drizzle_pg/meta/0026_snapshot.json", (snapshotText) => {
    const snapshot = JSON.parse(snapshotText);
    snapshot.tables["public.companies"].columns.corporate_info_urls.type = "text";
    return JSON.stringify(snapshot, null, 2);
  });

  const result = checkDbHighLoadReadiness({ repoRoot: tempRoot });
  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.id === "schema:jsonb:companies.corporate_info_urls"));
  assert(result.failures.some((failure) => failure.id === "snapshot:jsonb:companies.corporate_info_urls"));
});

test("readiness gate detects missing migration journal entry", () => {
  const tempRoot = copyReadinessFixture();
  overwriteRelative(tempRoot, "drizzle_pg/meta/_journal.json", (journalText) => {
    const journal = JSON.parse(journalText);
    journal.entries = journal.entries.filter((entry) => entry.tag !== "0026_db_redesign_jsonb_columns");
    return JSON.stringify(journal, null, 2);
  });

  const result = checkDbHighLoadReadiness({ repoRoot: tempRoot });
  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.id === "journal:0026_db_redesign_jsonb_columns"));
});
