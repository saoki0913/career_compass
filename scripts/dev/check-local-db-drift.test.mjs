import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const source = readFileSync(path.join(repoRoot, "scripts/dev/check-local-db-drift.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));

test("local DB drift check validates Better Auth Admin runtime columns", () => {
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
  assert.match(source, /DATABASE_URL/);
  assert.match(source, /db:repair:better-auth-admin-columns/);
  assert.match(source, /db:migrate:as-app/);
});

test("local dev runs DB drift preflight before Next.js", () => {
  assert.match(packageJson.scripts.dev, /check-next-env\.mjs/);
  assert.match(packageJson.scripts.dev, /check-local-db-drift\.mjs/);
  assert.match(packageJson.scripts.dev, /next dev/);
});

test("package exposes Better Auth Admin repair command", () => {
  assert.equal(
    packageJson.scripts["db:repair:better-auth-admin-columns"],
    "node scripts/dev/ensure-better-auth-admin-columns.mjs",
  );
});
