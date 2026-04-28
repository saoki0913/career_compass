import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "scripts/harness/command-classifier.mjs");

function classify(command) {
  return JSON.parse(execFileSync("node", [scriptPath, command], { cwd: repoRoot, encoding: "utf8" }));
}

test("detects quoted and nested sensitive file reads", () => {
  assert.equal(classify('cat ".env.local"').readsSensitivePath, true);
  assert.equal(classify("bash -lc 'cat .env.local'").readsSensitivePath, true);
  assert.equal(classify("sed -n '1,20p' private/agent-pipeline/skills/grill-me.md").readsSensitivePath, false);
});

test("detects wrapped git push and force push commands", () => {
  const envPush = classify("env GIT_SSH_COMMAND=ssh git push origin develop");
  assert.equal(envPush.gitPush, true);
  assert.equal(envPush.forcePush, false);

  const nestedForce = classify("bash -lc 'git -c core.sshCommand=x push --force origin develop'");
  assert.equal(nestedForce.gitPush, true);
  assert.equal(nestedForce.forcePush, true);
});

test("detects provider and release command modes", () => {
  assert.deepEqual(classify("npx vercel deploy --prod").releaseModes, ["provider"]);
  assert.deepEqual(classify("make ops-release-check").releaseModes, ["check"]);
  assert.deepEqual(classify("make deploy-stage-all").releaseModes, ["stage-all"]);
});

test("detects unsafe recursive delete and allows safe cache targets", () => {
  const unsafe = classify("rm --recursive --force src");
  assert.equal(unsafe.destructiveDelete, true);
  assert.equal(unsafe.unsafeDelete, true);
  assert.equal(unsafe.safeDelete, false);

  const safe = classify("rm -rf .next node_modules");
  assert.equal(safe.destructiveDelete, true);
  assert.equal(safe.unsafeDelete, false);
  assert.equal(safe.safeDelete, true);

  const findExec = classify("find src -type f -exec rm -rf {} +");
  assert.equal(findExec.destructiveDelete, true);
  assert.equal(findExec.unsafeDelete, true);
});
