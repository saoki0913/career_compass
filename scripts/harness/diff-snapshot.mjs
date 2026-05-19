#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import process from "node:process";
import { buildE2EFunctionalSnapshot } from "../ci/e2e-functional-snapshot.mjs";

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

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && index + 1 < process.argv.length) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function parseCsvList(source) {
  if (!source) return undefined;
  return source
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function commandHash(commandText) {
  if (!commandText) return "";
  return createHash("sha256").update(commandText).digest("hex");
}

function stagedSnapshot(project, { includeDirtyState = false } = {}) {
  const headSha = runGit(project, ["rev-parse", "HEAD"]).trim();
  const diff = runGit(project, ["diff", "--cached", "--binary", "--no-ext-diff"]);
  const numstat = runGit(project, ["diff", "--cached", "--numstat"]);
  const files = runGit(project, ["diff", "--cached", "--name-only"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const e2eFiles = runGit(project, ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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
  const e2eSnapshot = buildE2EFunctionalSnapshot({ cwd: project, files: e2eFiles });

  const snapshot = {
    mode: "staged",
    headSha,
    stagedDiffHash: hash,
    e2eFunctionalSnapshotHash: e2eSnapshot.snapshotHash,
    fileCount: files.length,
    totalLines,
    files,
  };

  if (includeDirtyState) {
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
    snapshot.unstagedFiles = unstagedFiles;
    snapshot.untrackedFiles = untrackedFiles;
    snapshot.dirtyState = {
      hasStaged: files.length > 0,
      hasUnstaged: unstagedFiles.length > 0,
      hasUntracked: untrackedFiles.length > 0,
      dirtyHash,
    };
  }

  return snapshot;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseCategories() {
  const source = argValue("--categories", "");
  if (!source) return undefined;
  const categories = {};
  let currentKey = "";
  for (const pair of source.split(",")) {
    const [key, ...rest] = pair.split("=");
    if (key && rest.length > 0) {
      currentKey = key.trim();
      categories[currentKey] = rest.join("=").trim();
      continue;
    }
    if (currentKey) {
      categories[currentKey] = `${categories[currentKey]},${pair.trim()}`;
    }
  }
  return categories;
}

const command = process.argv[2] || "current";
const project = argValue("--project", process.cwd());
const includeDirtyState = hasFlag("--include-dirty-state");

if (command === "current") {
  print(stagedSnapshot(project, { includeDirtyState }));
  process.exit(0);
}

if (command === "checkpoint") {
  const snapshot = stagedSnapshot(project, { includeDirtyState });
  const categories = parseCategories();
  const actions = parseCsvList(argValue("--actions", ""));
  const commandText = argValue("--command", "");
  const ttlSeconds = Number.parseInt(argValue("--ttl-seconds", ""), 10);
  const qgItemId = argValue("--item-id", "");
  const qgItemSeverity = argValue("--item-severity", "");
  const qgReason = argValue("--reason", "");
  const qgExpiresAt = argValue("--expires-at", "");
  const createdAt = new Date();
  const expiresAt = qgExpiresAt || (Number.isFinite(ttlSeconds) && ttlSeconds > 0
    ? new Date(createdAt.getTime() + ttlSeconds * 1000).toISOString()
    : "");
  print({
    schemaVersion: 1,
    kind: argValue("--kind", "generic"),
    decision: argValue("--decision", ""),
    issuer: argValue("--issuer", ""),
    reviewRequestId: argValue("--review-request-id", ""),
    reviewExecutionStatus: argValue("--review-execution-status", ""),
    reviewVerdict: argValue("--review-verdict", ""),
    maxSeverity: argValue("--max-severity", ""),
    releaseMode: argValue("--release-mode", ""),
    target: argValue("--target", ""),
    remote: argValue("--remote", ""),
    refspec: argValue("--refspec", ""),
    commandHash: commandHash(commandText),
    artifactHash: argValue("--artifact-hash", ""),
    status: argValue("--status", ""),
    createdAt: createdAt.toISOString(),
    ...(qgItemId ? { itemId: qgItemId } : {}),
    ...(qgItemSeverity ? { itemSeverity: qgItemSeverity } : {}),
    ...(qgReason ? { reason: qgReason } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(actions ? { actions } : {}),
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

  if (checkpoint.expiresAt) {
    const expiresAt = Date.parse(checkpoint.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      process.stderr.write("diff-snapshot: checkpoint expired.\n");
      process.exit(2);
    }
  }
  const expectedCommand = argValue("--command", "");
  if (expectedCommand && checkpoint.commandHash && checkpoint.commandHash !== commandHash(expectedCommand)) {
    process.stderr.write("diff-snapshot: command changed after checkpoint creation.\n");
    process.exit(2);
  }
  const expectedRemote = argValue("--remote", "");
  if (expectedRemote && (checkpoint.remote || "") !== expectedRemote) {
    process.stderr.write("diff-snapshot: remote changed after checkpoint creation.\n");
    process.exit(2);
  }
  const expectedRefspec = argValue("--refspec", "");
  if (expectedRefspec && (checkpoint.refspec || "") !== expectedRefspec) {
    process.stderr.write("diff-snapshot: refspec changed after checkpoint creation.\n");
    process.exit(2);
  }

  const snapshot = stagedSnapshot(project, { includeDirtyState: Boolean(checkpoint.dirtyState) });
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

function verifyCheckpointFile(file) {
  if (!file || !existsSync(file)) {
    return { file, ok: false, reason: "checkpoint_file_not_found" };
  }

  let checkpoint;
  try {
    checkpoint = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { file, ok: false, reason: "invalid_json" };
  }

  if (checkpoint.expiresAt) {
    const expiresAt = Date.parse(checkpoint.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      return { file, ok: false, reason: "checkpoint_expired" };
    }
  }
  const snapshot = stagedSnapshot(project, { includeDirtyState: Boolean(checkpoint.dirtyState) });
  if (checkpoint.headSha !== snapshot.headSha || checkpoint.stagedDiffHash !== snapshot.stagedDiffHash) {
    return {
      file,
      ok: false,
      reason: "staged_diff_changed",
      expected: {
        headSha: checkpoint.headSha,
        stagedDiffHash: checkpoint.stagedDiffHash,
      },
      actual: {
        headSha: snapshot.headSha,
        stagedDiffHash: snapshot.stagedDiffHash,
      },
    };
  }
  if (checkpoint.dirtyState) {
    const dirtyMismatch =
      Boolean(checkpoint.dirtyState.hasUnstaged) !== snapshot.dirtyState.hasUnstaged ||
      Boolean(checkpoint.dirtyState.hasUntracked) !== snapshot.dirtyState.hasUntracked ||
      String(checkpoint.dirtyState.dirtyHash || "") !== snapshot.dirtyState.dirtyHash;
    if (dirtyMismatch) {
      return { file, ok: false, reason: "dirty_tree_state_changed" };
    }
  }

  return { file, ok: true };
}

function checkpointFilesFromSession(sessionPath) {
  if (!sessionPath || !existsSync(sessionPath)) return [];
  const stat = statSync(sessionPath);
  if (stat.isFile()) return [sessionPath];
  return readdirSync(sessionPath)
    .map((entry) => `${sessionPath}/${entry}`)
    .filter((entry) => {
      try {
        return statSync(entry).isFile();
      } catch {
        return false;
      }
    });
}

if (command === "batch-verify") {
  const files = [
    ...argValues("--file"),
    ...checkpointFilesFromSession(argValue("--session", "")),
  ];
  const uniqueFiles = [...new Set(files)];
  if (uniqueFiles.length === 0) {
    print({
      ok: false,
      total: 0,
      valid: 0,
      invalid: 0,
      reason: "no_checkpoints",
    });
    process.exit(2);
  }
  const results = uniqueFiles.map(verifyCheckpointFile);
  const invalid = results.filter((result) => !result.ok);
  print({
    ok: invalid.length === 0,
    total: results.length,
    valid: results.length - invalid.length,
    invalid: invalid.length,
    results,
  });
  process.exit(invalid.length === 0 ? 0 : 2);
}

process.stderr.write(`diff-snapshot: unknown command ${command}\n`);
process.exit(1);
