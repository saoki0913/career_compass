#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TASKS_PATH = path.join(process.cwd(), "docs/plan/monitoring-release-final-tasks.json");
const VALID_STATUSES = new Set(["Todo", "In Progress", "Blocked", "Review", "Done"]);

function usage() {
  console.error("Usage: node scripts/plan/update-monitoring-task-status.mjs <task-id> <status> [evidence]");
  process.exit(2);
}

const [taskId, status, evidence] = process.argv.slice(2);
if (!taskId || !status || !VALID_STATUSES.has(status)) {
  usage();
}

const raw = await readFile(TASKS_PATH, "utf8");
const data = JSON.parse(raw);
const task = data.tasks.find((item) => item.id === taskId);

if (!task) {
  console.error(`Unknown task id: ${taskId}`);
  process.exit(1);
}

task.status = status;
task.updatedAt = new Date().toISOString().slice(0, 10);
if (evidence) {
  task.evidence = Array.from(new Set([...(task.evidence ?? []), evidence]));
}
data.updatedAt = task.updatedAt;

await writeFile(TASKS_PATH, `${JSON.stringify(data, null, 2)}\n`);
