import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const PLAN_TASKS_PATH = "docs/plan/plan-tasks.json";

export const STATUS_VALUES = new Set(["Todo", "Doing", "Blocked", "Review", "Done", "Superseded"]);

const STATUS_ALIASES = new Map([
  ["In Progress", "Doing"],
  ["InProgress", "Doing"],
  ["進行中", "Doing"],
  ["未着手", "Todo"],
  ["完了", "Done"],
]);

export function todayJst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

export function hasArg(name) {
  return process.argv.includes(name);
}

export function normalizeStatus(status) {
  const trimmed = String(status ?? "").trim();
  const normalized = STATUS_ALIASES.get(trimmed) ?? trimmed;
  if (!STATUS_VALUES.has(normalized)) {
    throw new Error(`Unknown status: ${status}`);
  }
  return normalized;
}

export function projectPath(project, relativePath = PLAN_TASKS_PATH) {
  return path.join(project, relativePath);
}

export function loadPlanTasks(project = process.cwd()) {
  const file = projectPath(project);
  if (!existsSync(file)) {
    throw new Error(`Missing plan task store: ${file}`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

export function savePlanTasks(data, project = process.cwd()) {
  const file = projectPath(project);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function findTask(data, taskId, sourcePlan = "") {
  const exact = data.tasks.find((task) => task.id === taskId && (!sourcePlan || task.sourcePlan === sourcePlan));
  if (exact) return exact;

  const matches = data.tasks.filter((task) => {
    const aliases = new Set([...(task.aliases ?? []), task.rawId].filter(Boolean));
    return aliases.has(taskId) && (!sourcePlan || task.sourcePlan === sourcePlan);
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const plans = matches.map((task) => task.sourcePlan).join(", ");
    throw new Error(`Ambiguous task id "${taskId}". Pass --source-plan. Matches: ${plans}`);
  }

  return null;
}

export function updateTask(data, { taskId, sourcePlan = "", status, evidence = "", notes = "" }) {
  const task = findTask(data, taskId, sourcePlan);
  if (!task) {
    throw new Error(`Unknown task id: ${taskId}`);
  }

  const date = todayJst();
  task.status = normalizeStatus(status);
  task.updatedAt = date;
  task.lastUpdatedBy = "scripts/plan/update-plan-task-status.mjs";

  if (evidence) {
    task.evidence = Array.from(new Set([...(task.evidence ?? []), evidence]));
  }
  if (notes) task.notes = notes;

  data.lastUpdated = date;
  return task;
}

export function runUpdateCli(defaults = {}) {
  const project = argValue("--project", process.cwd());
  const taskId = argValue("--id") || defaults.taskId;
  const sourcePlan = argValue("--source-plan", defaults.sourcePlan ?? "");
  const status = argValue("--status") || defaults.status;
  const evidence = argValue("--evidence", defaults.evidence ?? "");
  const notes = argValue("--notes", defaults.notes ?? "");
  const dryRun = hasArg("--dry-run");

  if (!taskId || !status) {
    process.stderr.write(
      "Usage: node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <Todo|Doing|Blocked|Review|Done|Superseded> [--source-plan <plan.md>] [--evidence <text>] [--notes <text>] [--dry-run]\n",
    );
    process.exit(2);
  }

  try {
    const data = loadPlanTasks(project);
    const task = updateTask(data, { taskId, sourcePlan, status, evidence, notes });
    if (!dryRun) savePlanTasks(data, project);
    process.stdout.write(`${task.id}: ${task.status}${dryRun ? " (dry-run)" : ""}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
