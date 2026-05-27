import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/plan/sync-plan-tasks.mjs");

function makeProject() {
  const project = mkdtempSync(path.join(os.tmpdir(), "plan-sync-"));
  mkdirSync(path.join(project, "docs/plan/completed"), { recursive: true });
  writeFileSync(
    path.join(project, "docs/plan/sample.md"),
    [
      "# Sample",
      "",
      "| Status | Priority | Area | Task | Acceptance Criteria | Evidence |",
      "|---|---|---|---|---|---|",
      "| Todo | P1 | General | Sample task | Acceptance | Evidence |",
      "",
    ].join("\n"),
  );
  return project;
}

function readTasks(project) {
  return JSON.parse(readFileSync(path.join(project, "docs/plan/plan-tasks.json"), "utf8"));
}

function runSync(project, args = []) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: project,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runSyncFailure(project, args = []) {
  assert.throws(
    () =>
      execFileSync(process.execPath, [script, ...args], {
        cwd: project,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    /out of sync|Command failed/,
  );
}

test("--check does not write and ignores volatile fields", () => {
  const project = makeProject();
  try {
    runSync(project, ["--write"]);
    const before = readTasks(project);
    before.generatedAt = "2000-01-01T00:00:00.000Z";
    before.lastUpdated = "2000-01-01";
    writeFileSync(path.join(project, "docs/plan/plan-tasks.json"), `${JSON.stringify(before, null, 2)}\n`);

    runSync(project, ["--check"]);
    const after = readTasks(project);
    assert.equal(after.generatedAt, "2000-01-01T00:00:00.000Z");
    assert.equal(after.lastUpdated, "2000-01-01");
    assert.equal(after.tasks.length, before.tasks.length);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--write preserves JSON-only tasks and existing metadata", () => {
  const project = makeProject();
  try {
    runSync(project, ["--write"]);
    const data = readTasks(project);
    const generatedTask = data.tasks.find((task) => task.sourcePlan === "sample.md");
    generatedTask.executionPhase = 4;
    generatedTask.releaseBlocking = true;
    generatedTask.externalServiceRequirements = [
      {
        service: "Cloudflare WAF",
        requirementLevel: "optional-evaluation",
        rationale: "fixture",
      },
    ];
    generatedTask.lastUpdatedBy = "test";
    data.tasks.push({
      id: "plan-sync:json-only",
      rawId: null,
      aliases: [],
      sourcePlan: "sample.md",
      status: "Done",
      originalStatus: "Todo",
      priority: "P0",
      area: "Plan Sync",
      task: "JSON-only task",
      ownerAgent: "orchestrator",
      acceptanceCriteria: ["Acceptance"],
      verificationCommands: ["node scripts/plan/validate-plan-tasks.mjs"],
      dependencies: [],
      evidence: ["Implementation: fixture"],
      updatedAt: "2026-05-27",
      notes: "must be preserved",
      lastUpdatedBy: "test",
      executionPhase: 0,
      releaseBlocking: false,
      externalServiceRequirements: [],
    });
    writeFileSync(path.join(project, "docs/plan/plan-tasks.json"), `${JSON.stringify(data, null, 2)}\n`);

    runSync(project, ["--write"]);
    const after = readTasks(project);
    assert(after.tasks.some((task) => task.id === "plan-sync:json-only"));
    const afterGeneratedTask = after.tasks.find((task) => task.id === generatedTask.id);
    assert.equal(afterGeneratedTask.executionPhase, 4);
    assert.equal(afterGeneratedTask.releaseBlocking, true);
    assert.equal(afterGeneratedTask.externalServiceRequirements[0].service, "Cloudflare WAF");
    assert.deepEqual(afterGeneratedTask.acceptanceCriteria, generatedTask.acceptanceCriteria);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--write recomputes generated metadata when task has no manual update marker", () => {
  const project = makeProject();
  try {
    runSync(project, ["--write"]);
    const data = readTasks(project);
    const generatedTask = data.tasks.find((task) => task.sourcePlan === "sample.md");
    generatedTask.executionPhase = 6;
    generatedTask.releaseBlocking = false;
    writeFileSync(path.join(project, "docs/plan/plan-tasks.json"), `${JSON.stringify(data, null, 2)}\n`);

    runSync(project, ["--write"]);
    const after = readTasks(project);
    const afterGeneratedTask = after.tasks.find((task) => task.id === generatedTask.id);
    assert.equal(afterGeneratedTask.executionPhase, 2);
    assert.equal(afterGeneratedTask.releaseBlocking, false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--fresh --write requires explicit destructive confirmation", () => {
  const project = makeProject();
  try {
    assert.throws(() => runSync(project, ["--fresh", "--write"]), /--fresh is destructive/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("--check fails when markdown source changes", () => {
  const project = makeProject();
  try {
    runSync(project, ["--write"]);
    writeFileSync(
      path.join(project, "docs/plan/sample.md"),
      [
        "# Sample",
        "",
        "| Status | Priority | Area | Task | Acceptance Criteria | Evidence |",
        "|---|---|---|---|---|---|",
        "| Todo | P1 | General | Changed sample task | Acceptance | Evidence |",
        "",
      ].join("\n"),
    );
    runSyncFailure(project, ["--check"]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
