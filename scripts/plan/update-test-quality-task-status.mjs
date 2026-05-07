#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const STATUS_VALUES = new Set(["Todo", "Doing", "Blocked", "Review", "Done"]);

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const project = argValue("--project", process.cwd());
const taskId = argValue("--id");
const status = argValue("--status");
const evidence = argValue("--evidence");
const notes = argValue("--notes");
const file = path.join(project, "docs/plan/test-quality-gate-tasks.json");

if (!taskId || !STATUS_VALUES.has(status)) {
  process.stderr.write(
    "Usage: node scripts/plan/update-test-quality-task-status.mjs --id <task-id> --status <Todo|Doing|Blocked|Review|Done> [--evidence <text>] [--notes <text>]\n",
  );
  process.exit(2);
}

const board = JSON.parse(readFileSync(file, "utf8"));
const task = board.tasks.find((item) => item.id === taskId);
if (!task) {
  process.stderr.write(`Unknown task id: ${taskId}\n`);
  process.exit(2);
}

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

task.status = status;
task.updatedAt = today;
if (evidence) task.evidence = evidence;
if (notes) task.notes = notes;
board.lastUpdated = today;

writeFileSync(file, `${JSON.stringify(board, null, 2)}\n`);
process.stdout.write(`${task.id}: ${task.status}\n`);
