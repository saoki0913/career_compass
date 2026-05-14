import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const source = readFileSync(path.join(repoRoot, "scripts/dev/check-prod-db-drift.mjs"), "utf8");

test("production DB drift check covers runtime interview persistence requirements", () => {
  for (const columnName of [
    "interview_turn_events",
    "active_feedback_draft",
    "current_feedback_id",
    "score_evidence_by_axis",
    "score_rationale_by_axis",
    "confidence_by_axis",
    "source_messages_snapshot",
    "coverage_checklist_snapshot",
    "deterministic_coverage_passed",
    "format_phase",
  ]) {
    assert.match(source, new RegExp(`"${columnName}"`), `${columnName} must be required`);
  }
});

test("production DB drift check covers Better Auth Admin requirements", () => {
  for (const required of [
    "role",
    "banned",
    "ban_reason",
    "ban_expires",
    "impersonated_by",
    "users_role_allowed",
  ]) {
    assert.match(source, new RegExp(required), `${required} must be checked`);
  }
  assert.match(source, /better auth admin columns/i);
});
