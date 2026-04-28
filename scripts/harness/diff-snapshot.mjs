#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function runGit(project, args) {
  const result = spawnSync("git", ["-C", project, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout;
}

function stagedSnapshot(project) {
  const headSha = runGit(project, ["rev-parse", "HEAD"]).trim();
  const diff = runGit(project, ["diff", "--cached", "--binary", "--no-ext-diff"]);
  const numstat = runGit(project, ["diff", "--cached", "--numstat"]);
  const files = runGit(project, ["diff", "--cached", "--name-only"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const unstagedFiles = runGit(project, ["diff", "--name-only"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const untrackedFiles = runGit(project, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const unstagedDiff = runGit(project, ["diff", "--binary", "--no-ext-diff"]);
  const untrackedHash = createHash("sha256");
  for (const file of untrackedFiles) {
    untrackedHash.update(file);
    untrackedHash.update("\0");
    try {
      untrackedHash.update(readFileSync(`${project}/${file}`));
    } catch {
      untrackedHash.update("<unreadable>");
    }
    untrackedHash.update("\0");
  }
  const dirtyHash = createHash("sha256")
    .update(unstagedDiff)
    .update("\0")
    .update(untrackedHash.digest("hex"))
    .digest("hex");

  let totalLines = 0;
  for (const line of numstat.split("\n")) {
    const [added, deleted] = line.split(/\s+/);
    const addCount = Number.parseInt(added, 10);
    const deleteCount = Number.parseInt(deleted, 10);
    if (Number.isFinite(addCount)) totalLines += addCount;
    if (Number.isFinite(deleteCount)) totalLines += deleteCount;
  }

  const hash = createHash("sha256")
    .update(headSha)
    .update("\0")
    .update(diff)
    .digest("hex");

  return {
    mode: "staged",
    headSha,
    stagedDiffHash: hash,
    fileCount: files.length,
    totalLines,
    files,
    unstagedFiles,
    untrackedFiles,
    dirtyState: {
      hasStaged: files.length > 0,
      hasUnstaged: unstagedFiles.length > 0,
      hasUntracked: untrackedFiles.length > 0,
      dirtyHash,
    },
  };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseCategories() {
  const source = argValue("--categories", "");
  if (!source) return undefined;
  const categories = {};
  for (const pair of source.split(",")) {
    const [key, ...rest] = pair.split("=");
    if (!key || rest.length === 0) continue;
    categories[key.trim()] = rest.join("=").trim();
  }
  return categories;
}

const command = process.argv[2] || "current";
const project = argValue("--project", process.cwd());

if (command === "current") {
  print(stagedSnapshot(project));
  process.exit(0);
}

if (command === "checkpoint") {
  const snapshot = stagedSnapshot(project);
  const categories = parseCategories();
  print({
    schemaVersion: 1,
    kind: argValue("--kind", "generic"),
    decision: argValue("--decision", ""),
    reviewRequestId: argValue("--review-request-id", ""),
    reviewExecutionStatus: argValue("--review-execution-status", ""),
    reviewVerdict: argValue("--review-verdict", ""),
    maxSeverity: argValue("--max-severity", ""),
    releaseMode: argValue("--release-mode", ""),
    status: argValue("--status", ""),
    createdAt: new Date().toISOString(),
    ...(categories ? { categories } : {}),
    ...snapshot,
  });
  process.exit(0);
}

if (command === "verify") {
  const file = argValue("--file");
  if (!file || !existsSync(file)) {
    process.stderr.write("diff-snapshot: checkpoint file not found.\n");
    process.exit(2);
  }

  let checkpoint;
  try {
    checkpoint = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    process.stderr.write("diff-snapshot: checkpoint is not valid JSON.\n");
    process.exit(2);
  }

  const snapshot = stagedSnapshot(project);
  if (checkpoint.headSha !== snapshot.headSha || checkpoint.stagedDiffHash !== snapshot.stagedDiffHash) {
    process.stderr.write("diff-snapshot: staged diff changed after checkpoint creation.\n");
    process.exit(2);
  }
  if (checkpoint.dirtyState) {
    const dirtyMismatch =
      Boolean(checkpoint.dirtyState.hasUnstaged) !== snapshot.dirtyState.hasUnstaged ||
      Boolean(checkpoint.dirtyState.hasUntracked) !== snapshot.dirtyState.hasUntracked ||
      String(checkpoint.dirtyState.dirtyHash || "") !== snapshot.dirtyState.dirtyHash;
    if (dirtyMismatch) {
      process.stderr.write("diff-snapshot: dirty tree state changed after checkpoint creation.\n");
      process.exit(2);
    }
  }

  print({ ok: true, ...snapshot });
  process.exit(0);
}

process.stderr.write(`diff-snapshot: unknown command ${command}\n`);
process.exit(1);
