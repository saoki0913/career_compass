#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  EXECUTION_PHASE_VALUES,
  EXTERNAL_SERVICE_REQUIREMENT_LEVELS,
  loadPlanTasks,
  normalizeExternalServiceRequirements,
  STATUS_VALUES,
} from "./lib/plan-task-store.mjs";

const ACTIVE_STATUSES = new Set(["Todo", "Doing", "Blocked", "Review"]);
const DONE_DEPENDENCY_STATUSES = new Set(["Done", "Superseded"]);
const REVIEW_BLOCKING_DEPENDENCY_STATUSES = new Set(["Todo", "Blocked"]);
const PLACEHOLDER_EVIDENCE = new Set(["TODO", "TBD", "N/A", "未確認", "後で"]);
const BANNED_REQUIRED_SERVICES = [
  { service: "Better Stack", pattern: /Better Stack/i },
  { service: "Healthchecks.io", pattern: /Healthchecks\.io/i },
  { service: "Grafana Cloud", pattern: /Grafana Cloud/i },
  { service: "Loki", pattern: /\bLoki\b/i },
  { service: "UptimeRobot", pattern: /UptimeRobot/i },
  { service: "Render", pattern: /\bRender\b/i },
  { service: "Fly.io", pattern: /Fly\.io/i },
  { service: "Neon", pattern: /\bNeon\b/i },
  { service: "Axiom", pattern: /\bAxiom\b/i },
  { service: "Logtail", pattern: /\bLogtail\b/i },
  { service: "PagerDuty", pattern: /PagerDuty/i },
  { service: "Slack", pattern: /Slack|hooks\.slack\.com/i },
  { service: "Qdrant Cloud", pattern: /Qdrant Cloud/i },
];
const STRUCTURED_SERVICE_PATTERNS = [
  { service: "Qdrant", pattern: /Qdrant/i },
  { service: "Cloudflare proxy", pattern: /Cloudflare\s+proxy|orange cloud/i },
  { service: "Cloudflare WAF", pattern: /WAF/i },
  { service: "Cloudflare Turnstile", pattern: /Turnstile/i },
];

function findPlanJsonFiles(project) {
  const root = path.join(project, "docs/plan");
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.relative(root, fullPath));
      }
    }
  };
  walk(root);
  return files.sort();
}

function textFields(task) {
  return [
    task.id,
    task.sourcePlan,
    task.priority,
    task.area,
    task.task,
    task.notes,
    ...(task.acceptanceCriteria ?? []),
    ...(task.verificationCommands ?? []),
    ...(task.evidence ?? []),
    ...normalizeExternalServiceRequirements(task.externalServiceRequirements).flatMap((requirement) => [
      requirement.service,
      requirement.requirementLevel,
      requirement.rationale,
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

function hasNonPlaceholderText(items) {
  return (items ?? []).some((item) => {
    const text = String(item ?? "").trim();
    return text && !PLACEHOLDER_EVIDENCE.has(text.toUpperCase());
  });
}

function detectCycles(tasks, errors) {
  const graph = new Map(tasks.map((task) => [task.id, task.dependencies ?? []]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id, pathIds) {
    if (visiting.has(id)) {
      const cycleStart = pathIds.indexOf(id);
      const cycle = [...pathIds.slice(cycleStart), id].join(" -> ");
      errors.push(`dependency cycle detected: ${cycle}`);
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency)) visit(dependency, [...pathIds, dependency]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const task of tasks) visit(task.id, [task.id]);
}

export function validatePlanTasks(data, { project = process.cwd() } = {}) {
  const errors = [];
  const ids = new Set();
  const aliasKeys = new Map();
  const exactBySource = new Map();
  const documentSet = new Set(data.documents ?? []);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

  if (data.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(data.tasks) || data.tasks.length === 0) errors.push("tasks must be a non-empty array");

  for (const jsonFile of findPlanJsonFiles(project)) {
    if (jsonFile !== "plan-tasks.json") errors.push(`unexpected docs/plan JSON file: ${jsonFile}`);
  }

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
    if (!EXECUTION_PHASE_VALUES.has(task.executionPhase)) errors.push(`${task.id}: executionPhase must be an integer from 0 to 6`);
    if (typeof task.releaseBlocking !== "boolean") errors.push(`${task.id}: releaseBlocking must be boolean`);
    if (!Array.isArray(task.externalServiceRequirements)) errors.push(`${task.id}: externalServiceRequirements must be an array`);

    const requirements = normalizeExternalServiceRequirements(task.externalServiceRequirements);
    for (const requirement of requirements) {
      if (!requirement.service) errors.push(`${task.id}: externalServiceRequirements[].service is required`);
      if (!EXTERNAL_SERVICE_REQUIREMENT_LEVELS.has(requirement.requirementLevel)) {
        errors.push(`${task.id}: unknown external service requirementLevel ${requirement.requirementLevel || "(empty)"}`);
      }
      if (!requirement.rationale) errors.push(`${task.id}: externalServiceRequirements[].rationale is required`);
      if (ACTIVE_STATUSES.has(task.status) && requirement.requirementLevel === "release-blocking") {
        for (const { service } of BANNED_REQUIRED_SERVICES) {
          if (requirement.service === service) {
            errors.push(`${task.id}: active task cannot mark ${requirement.service} as release-blocking external service`);
          }
        }
      }
    }

    if (task.status === "Done" && !hasNonPlaceholderText(task.evidence) && !hasNonPlaceholderText(task.verificationCommands)) {
      errors.push(`${task.id}: Done tasks must have non-empty evidence or verificationCommands`);
    }

    const text = textFields(task);
    if (ACTIVE_STATUSES.has(task.status)) {
      for (const { service, pattern } of BANNED_REQUIRED_SERVICES) {
        if (pattern.test(text)) {
          const matchingRequirement = requirements.find((requirement) => requirement.service === service);
          if (!matchingRequirement || matchingRequirement.requirementLevel === "release-blocking") {
            errors.push(`${task.id}: active task mentions ${service} without a non-release-blocking externalServiceRequirements entry`);
          }
        }
      }
    }

    for (const { service, pattern } of STRUCTURED_SERVICE_PATTERNS) {
      if (pattern.test(text) && !requirements.some((requirement) => requirement.service === service)) {
        errors.push(`${task.id}: ${service} mention requires externalServiceRequirements entry`);
      }
    }
  }

  const byId = new Map((data.tasks ?? []).map((task) => [task.id, task]));
  for (const task of data.tasks ?? []) {
    for (const alias of task.aliases ?? []) {
      const exactInSamePlan = exactBySource.get(`${task.sourcePlan}:${alias}`);
      if (exactInSamePlan && exactInSamePlan !== task.id) {
        errors.push(`${task.id}: alias ${alias} shadows exact id ${exactInSamePlan} in ${task.sourcePlan}`);
      }
    }
    for (const dependency of task.dependencies ?? []) {
      if (dependency === task.id) errors.push(`${task.id}: cannot depend on itself`);
      if (!ids.has(dependency)) {
        errors.push(`${task.id}: unknown dependency ${dependency}`);
        continue;
      }
      const dependencyTask = byId.get(dependency);
      if (task.status === "Done" && dependencyTask && !DONE_DEPENDENCY_STATUSES.has(dependencyTask.status)) {
        errors.push(`${task.id}: cannot be Done while dependency ${dependency} is ${dependencyTask.status}`);
      }
      if (task.status === "Review" && dependencyTask && REVIEW_BLOCKING_DEPENDENCY_STATUSES.has(dependencyTask.status)) {
        errors.push(`${task.id}: cannot be Review while dependency ${dependency} is ${dependencyTask.status}`);
      }
    }
    if (task.supersededBy && !ids.has(task.supersededBy)) {
      errors.push(`${task.id}: unknown supersededBy ${task.supersededBy}`);
    }
  }

  detectCycles(data.tasks ?? [], errors);
  return errors;
}

export function runValidateCli({ project = process.cwd() } = {}) {
  const data = loadPlanTasks(project);
  const errors = validatePlanTasks(data, { project });

  if (errors.length > 0) {
    process.stderr.write(`${errors.length} plan task validation error(s):\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exit(1);
  }

  process.stdout.write(`Plan task validation passed (${data.tasks.length} tasks)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runValidateCli();
}
