import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { buildE2EFunctionalSnapshot } from "../ci/e2e-functional-snapshot.mjs";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "scripts/harness/diff-snapshot.mjs");

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}

function createRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-snapshot-"));
  run("git", ["init"], dir);
  fs.writeFileSync(path.join(dir, "README.md"), "initial\n", "utf8");
  run("git", ["add", "README.md"], dir);
  run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "init"], dir);
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test("checkpoint includes review fields and staged E2E snapshot hash", () => {
  const dir = createRepo();
  try {
    fs.writeFileSync(path.join(dir, "tracked.txt"), "tracked\n", "utf8");
    run("git", ["add", "tracked.txt"], dir);
    fs.writeFileSync(path.join(dir, "unstaged.txt"), "unstaged\n", "utf8");

    const output = run("node", [
      scriptPath,
      "checkpoint",
      "--project",
      dir,
      "--kind",
      "commit-review",
      "--decision",
      "reviewed-proceed",
      "--review-request-id",
      "post_review-test",
      "--review-execution-status",
      "SUCCESS",
      "--review-verdict",
      "APPROVE",
      "--max-severity",
      "low",
    ], repoRoot);
    const checkpoint = JSON.parse(output);

    assert.equal(checkpoint.kind, "commit-review");
    assert.equal(checkpoint.reviewRequestId, "post_review-test");
    assert.equal(checkpoint.reviewExecutionStatus, "SUCCESS");
    assert.equal(checkpoint.reviewVerdict, "APPROVE");
    assert.match(checkpoint.e2eFunctionalSnapshotHash, /^[a-f0-9]{64}$/);
    const expected = buildE2EFunctionalSnapshot({ cwd: dir, files: ["tracked.txt"] });
    assert.equal(checkpoint.e2eFunctionalSnapshotHash, expected.snapshotHash);
    assert.equal(checkpoint.dirtyState, undefined);
  } finally {
    cleanup(dir);
  }
});

test("checkpoint includes deleted staged files in E2E snapshot hash", () => {
  const dir = createRepo();
  try {
    run("git", ["rm", "README.md"], dir);

    const output = run("node", [scriptPath, "checkpoint", "--project", dir], repoRoot);
    const checkpoint = JSON.parse(output);
    const expected = buildE2EFunctionalSnapshot({ cwd: dir, files: ["README.md"] });

    assert.equal(checkpoint.fileCount, 1);
    assert.deepEqual(checkpoint.files, ["README.md"]);
    assert.equal(checkpoint.e2eFunctionalSnapshotHash, expected.snapshotHash);
  } finally {
    cleanup(dir);
  }
});


test("verify ignores unrelated dirty tree state by default", () => {
  const dir = createRepo();
  try {
    fs.writeFileSync(path.join(dir, "tracked.txt"), "tracked\n", "utf8");
    run("git", ["add", "tracked.txt"], dir);

    const checkpointPath = path.join(dir, "checkpoint.json");
    const output = run("node", [scriptPath, "checkpoint", "--project", dir], repoRoot);
    fs.writeFileSync(checkpointPath, output, "utf8");
    fs.writeFileSync(path.join(dir, "later.txt"), "later\n", "utf8");

    const result = spawnSync("node", [
      scriptPath,
      "verify",
      "--project",
      dir,
      "--file",
      checkpointPath,
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(result.status, 0);
  } finally {
    cleanup(dir);
  }
});

test("verify can include dirty tree state when explicitly requested", () => {
  const dir = createRepo();
  try {
    fs.writeFileSync(path.join(dir, "tracked.txt"), "tracked\n", "utf8");
    run("git", ["add", "tracked.txt"], dir);
    fs.writeFileSync(path.join(dir, "later.txt"), "before\n", "utf8");

    const checkpointPath = path.join(dir, "checkpoint.json");
    const output = run("node", [
      scriptPath,
      "checkpoint",
      "--project",
      dir,
      "--include-dirty-state",
    ], repoRoot);
    fs.writeFileSync(checkpointPath, output, "utf8");
    fs.writeFileSync(path.join(dir, "later.txt"), "after\n", "utf8");

    const result = spawnSync("node", [
      scriptPath,
      "verify",
      "--project",
      dir,
      "--file",
      checkpointPath,
    ], { cwd: repoRoot, encoding: "utf8" });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /dirty tree state changed/);
  } finally {
    cleanup(dir);
  }
});

test("checkpoint category parser preserves comma-separated feature lists", () => {
  const dir = createRepo();
  try {
    const output = run("node", [
      scriptPath,
      "checkpoint",
      "--project",
      dir,
      "--kind",
      "test-categories",
      "--categories",
      "e2e-functional=run:gakuchika,motivation,quality=accept:gakuchika,motivation,static=run,security=run",
    ], repoRoot);
    const checkpoint = JSON.parse(output);

    assert.equal(checkpoint.categories["e2e-functional"], "run:gakuchika,motivation");
    assert.equal(checkpoint.categories.quality, "accept:gakuchika,motivation");
    assert.equal(checkpoint.categories.static, "run");
    assert.equal(checkpoint.categories.security, "run");
  } finally {
    cleanup(dir);
  }
});
