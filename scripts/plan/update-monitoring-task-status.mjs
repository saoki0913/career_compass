#!/usr/bin/env node
import { hasArg, loadPlanTasks, savePlanTasks, updateTask } from "./lib/plan-task-store.mjs";

const dryRun = hasArg("--dry-run");
const [taskId, status, evidence] = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

if (!taskId || !status) {
  process.stderr.write("Usage: node scripts/plan/update-monitoring-task-status.mjs <task-id> <status> [evidence] [--dry-run]\n");
  process.exit(2);
}

try {
  const data = loadPlanTasks(process.cwd());
  const task = updateTask(data, {
    taskId,
    sourcePlan: "monitoring-logging-incident-response-plan.md",
    status,
    evidence,
  });
  if (!dryRun) savePlanTasks(data, process.cwd());
  process.stdout.write(`${task.id}: ${task.status}${dryRun ? " (dry-run)" : ""}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
