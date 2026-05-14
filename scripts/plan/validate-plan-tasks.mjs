#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadPlanTasks, STATUS_VALUES } from "./lib/plan-task-store.mjs";

const project = process.cwd();
const errors = [];
const data = loadPlanTasks(project);
const ids = new Set();
const aliasKeys = new Map();
const exactBySource = new Map();
const documentSet = new Set(data.documents ?? []);
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

if (data.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!Array.isArray(data.tasks) || data.tasks.length === 0) errors.push("tasks must be a non-empty array");

for (const sourcePlan of documentSet) {
  if (!existsSync(path.join(project, "docs/plan", sourcePlan))) {
    errors.push(`documents entry does not exist: ${sourcePlan}`);
  }
}

for (const task of data.tasks ?? []) {
  if (!task.id) errors.push("task is missing id");
  if (ids.has(task.id)) errors.push(`duplicate id: ${task.id}`);
  ids.add(task.id);
  exactBySource.set(`${task.sourcePlan}:${task.id}`, task.id);

  if (!STATUS_VALUES.has(task.status)) errors.push(`${task.id}: unknown status ${task.status}`);
  if (!task.sourcePlan) errors.push(`${task.id}: missing sourcePlan`);
  if (task.sourcePlan && !documentSet.has(task.sourcePlan)) {
    errors.push(`${task.id}: sourcePlan is not listed in documents: ${task.sourcePlan}`);
  }
  if (!task.task) errors.push(`${task.id}: missing task text`);
  if (!task.priority) errors.push(`${task.id}: missing priority`);
  if (!task.area) errors.push(`${task.id}: missing area`);
  if (!task.ownerAgent) errors.push(`${task.id}: missing ownerAgent`);
  if (!dateOnly.test(String(task.updatedAt ?? ""))) errors.push(`${task.id}: updatedAt must be YYYY-MM-DD`);
  if (!Array.isArray(task.aliases)) errors.push(`${task.id}: aliases must be an array`);
  for (const alias of task.aliases ?? []) {
    const key = `${task.sourcePlan}:${alias}`;
    const previous = aliasKeys.get(key);
    if (previous && previous !== task.id) {
      errors.push(`${task.id}: duplicate alias ${alias} in ${task.sourcePlan} (already used by ${previous})`);
    }
    aliasKeys.set(key, task.id);
  }
  if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0 || task.acceptanceCriteria.some((item) => !String(item).trim())) {
    errors.push(`${task.id}: acceptanceCriteria must be non-empty`);
  }
  if (!Array.isArray(task.verificationCommands)) errors.push(`${task.id}: verificationCommands must be an array`);
  if (!Array.isArray(task.dependencies)) errors.push(`${task.id}: dependencies must be an array`);
  if (!Array.isArray(task.evidence)) errors.push(`${task.id}: evidence must be an array`);
}

for (const task of data.tasks ?? []) {
  for (const alias of task.aliases ?? []) {
    const exactInSamePlan = exactBySource.get(`${task.sourcePlan}:${alias}`);
    if (exactInSamePlan && exactInSamePlan !== task.id) {
      errors.push(`${task.id}: alias ${alias} shadows exact id ${exactInSamePlan} in ${task.sourcePlan}`);
    }
  }
  for (const dependency of task.dependencies ?? []) {
    if (!ids.has(dependency)) errors.push(`${task.id}: unknown dependency ${dependency}`);
  }
  if (task.supersededBy && !ids.has(task.supersededBy)) {
    errors.push(`${task.id}: unknown supersededBy ${task.supersededBy}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.length} plan task validation error(s):\n`);
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`Plan task validation passed (${data.tasks.length} tasks)\n`);
