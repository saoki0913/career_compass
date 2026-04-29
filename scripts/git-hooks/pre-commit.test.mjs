import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hookSource = readFileSync(join(process.cwd(), ".githooks/pre-commit"), "utf8");

test("pre-commit runs git hygiene before E2E and security checks", () => {
  assert.match(hookSource, /node scripts\/git-hooks\/check-git-hygiene\.mjs --staged/);
  assert.ok(
    hookSource.indexOf("check-git-hygiene.mjs --staged") <
      hookSource.indexOf("enforce-local-ai-e2e.mjs"),
  );
});

test("pre-commit blocks security scanner errors fail-closed", () => {
  assert.match(hookSource, /scan_exit.*-eq 2/s);
  assert.match(hookSource, /Security scanner failed\. Commit blocked fail-closed\./);
});

test("pre-commit blocks unexpected nonzero security scan exits", () => {
  assert.match(hookSource, /scan_exit.*-ne 0/s);
  assert.match(hookSource, /unexpected status \$scan_exit\. Commit blocked\./);
});
