import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inferExecutionPhase, inferReleaseBlocking } from "./lib/plan-task-store.mjs";
import { validatePlanTasks } from "./validate-plan-tasks.mjs";

function makeProject() {
  const project = mkdtempSync(path.join(os.tmpdir(), "plan-validate-"));
  mkdirSync(path.join(project, "docs/plan"), { recursive: true });
  writeFileSync(path.join(project, "docs/plan/sample.md"), "# Sample\n");
  return project;
}

function baseTask(overrides = {}) {
  return {
    id: "task-a",
    rawId: null,
    aliases: [],
    sourcePlan: "sample.md",
    status: "Todo",
    originalStatus: "Todo",
    priority: "P1",
    area: "General",
    task: "Sample task",
    ownerAgent: "orchestrator",
    acceptanceCriteria: ["Acceptance"],
    verificationCommands: [],
    dependencies: [],
    evidence: [],
    updatedAt: "2026-05-27",
    executionPhase: 2,
    releaseBlocking: false,
    externalServiceRequirements: [],
    ...overrides,
  };
}

function baseData(tasks) {
  return {
    schemaVersion: 1,
    documents: ["sample.md"],
    tasks,
  };
}

function validate(tasks) {
  const project = makeProject();
  try {
    return validatePlanTasks(baseData(tasks), { project });
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

test("Done tasks require evidence or verificationCommands", () => {
  const errors = validate([baseTask({ status: "Done" })]);
  assert(errors.some((error) => error.includes("Done tasks must have non-empty evidence")));
});

test("Done tasks accept non-placeholder evidence", () => {
  const errors = validate([baseTask({ status: "Done", evidence: ["Implementation: completed"] })]);
  assert.deepEqual(errors, []);
});

test("Done tasks cannot depend on unfinished tasks", () => {
  const errors = validate([
    baseTask({ id: "task-a", status: "Done", evidence: ["Implementation: completed"], dependencies: ["task-b"] }),
    baseTask({ id: "task-b", status: "Todo" }),
  ]);
  assert(errors.some((error) => error.includes("cannot be Done while dependency task-b is Todo")));
});

test("Done tasks can depend on superseded tasks", () => {
  const errors = validate([
    baseTask({ id: "task-a", status: "Done", evidence: ["Implementation: completed"], dependencies: ["task-b"] }),
    baseTask({ id: "task-b", status: "Superseded" }),
  ]);
  assert.deepEqual(errors, []);
});

test("self dependency and dependency cycles fail", () => {
  const selfErrors = validate([baseTask({ dependencies: ["task-a"] })]);
  assert(selfErrors.some((error) => error.includes("cannot depend on itself")));

  const cycleErrors = validate([
    baseTask({ id: "task-a", dependencies: ["task-b"] }),
    baseTask({ id: "task-b", dependencies: ["task-a"] }),
  ]);
  assert(cycleErrors.some((error) => error.includes("dependency cycle detected")));
});

test("executionPhase and releaseBlocking are typed", () => {
  const errors = validate([baseTask({ executionPhase: 7, releaseBlocking: "true" })]);
  assert(errors.some((error) => error.includes("executionPhase must be an integer from 0 to 6")));
  assert(errors.some((error) => error.includes("releaseBlocking must be boolean")));
});

test("Qdrant and Cloudflare feature mentions require structured service metadata", () => {
  const qdrantErrors = validate([baseTask({ task: "Qdrant 移行を検討する" })]);
  assert(qdrantErrors.some((error) => error.includes("Qdrant mention requires externalServiceRequirements entry")));

  const wafErrors = validate([baseTask({ task: "Cloudflare WAF を評価する" })]);
  assert(wafErrors.some((error) => error.includes("Cloudflare WAF mention requires externalServiceRequirements entry")));
});

test("structured service metadata satisfies external service checks", () => {
  const errors = validate([
    baseTask({
      task: "Qdrant は長期検討に限定する",
      externalServiceRequirements: [
        {
          service: "Qdrant",
          requirementLevel: "not-required",
          rationale: "長期検討のみ",
        },
      ],
    }),
  ]);
  assert.deepEqual(errors, []);
});

test("release-blocking banned external service metadata fails even without body mention", () => {
  const errors = validate([
    baseTask({
      externalServiceRequirements: [
        {
          service: "Slack",
          requirementLevel: "release-blocking",
          rationale: "fixture",
        },
      ],
    }),
  ]);
  assert(errors.some((error) => error.includes("cannot mark Slack as release-blocking")));
});

test("verificationCommands are included in external service checks", () => {
  const errors = validate([baseTask({ verificationCommands: ["curl https://hooks.slack.com/services/test"] })]);
  assert(errors.some((error) => error.includes("Slack")));
});

test("extra docs/plan json files fail validation", () => {
  const project = makeProject();
  try {
    writeFileSync(path.join(project, "docs/plan/extra.json"), "{}\n");
    const errors = validatePlanTasks(baseData([baseTask()]), { project });
    assert(errors.some((error) => error.includes("unexpected docs/plan JSON file")));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("ChromaDB HTTPServer task that excludes Qdrant stays in company phase", () => {
  const task = baseTask({
    sourcePlan: "company-info-deadline-extraction-improvement-plan.md",
    priority: "High",
    task: "T-32: ChromaDB HTTPServer 分離準備と共有サーバー運用化",
    notes: "公開前必須ではなく中期タスク。",
    acceptanceCriteria: [
      "PersistentClient と ChromaDB HTTP client を切替可能にする。Qdrant は実装対象外とし、長期検討条件だけ文書化する。",
    ],
  });
  const phase = inferExecutionPhase(task);
  assert.equal(phase, 3);
  assert.equal(inferReleaseBlocking({ ...task, executionPhase: phase }), false);
});
