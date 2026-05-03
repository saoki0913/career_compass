import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const source = readFileSync(
  path.join(repoRoot, "scripts/dev/ensure-interview-feedback-evidence-columns.mjs"),
  "utf8",
);

test("interview feedback evidence repair uses the app database and all evidence columns", () => {
  assert.match(source, /process\.env\.DATABASE_URL/);
  for (const columnName of [
    "score_evidence_by_axis",
    "score_rationale_by_axis",
    "confidence_by_axis",
  ]) {
    assert.match(source, new RegExp(`"${columnName}"`), `${columnName} must be repaired`);
  }
});
