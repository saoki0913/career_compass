import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const PLAN_TASKS_PATH = "docs/plan/plan-tasks.json";

export const STATUS_VALUES = new Set(["Todo", "Doing", "Blocked", "Review", "Done", "Superseded"]);
export const EXECUTION_PHASE_VALUES = new Set([0, 1, 2, 3, 4, 5, 6]);
export const EXTERNAL_SERVICE_REQUIREMENT_LEVELS = new Set([
  "not-required",
  "optional-evaluation",
  "post-release",
  "release-blocking",
]);

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

function taskSearchText(task) {
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
  ]
    .filter(Boolean)
    .join("\n");
}

function isTerminalTask(task) {
  return task.status === "Done" || task.status === "Superseded";
}

function isQdrantMigrationTask(task) {
  const taskText = String(task.task ?? "");
  if (/実装対象外|長期検討|検討条件/.test(taskSearchText(task))) return false;
  return /Qdrant.*(移行|導入|採用)|(移行|導入|採用).*Qdrant/i.test(taskText);
}

export function inferExecutionPhase(task) {
  const sourcePlan = String(task.sourcePlan ?? "");
  const priority = String(task.priority ?? "");
  const text = taskSearchText(task);

  if ((String(task.id ?? "").startsWith("plan-sync:") || sourcePlan === "execution-order.md") && isTerminalTask(task)) return 0;
  if (sourcePlan === "completed/billing-credit-integrity-report.md") return 1;
  if (
    sourcePlan.includes("personal-data") ||
    sourcePlan.includes("auth-guest") ||
    sourcePlan.includes("security-vulnerability") ||
    sourcePlan.includes("legal-commercial") ||
    sourcePlan.includes("db-design") ||
    sourcePlan.includes("db-staging-production")
  ) {
    return /post-release|Phase B|長期|公開後/i.test(text) ? 6 : 1;
  }
  if (sourcePlan.includes("llm-rag")) return priority === "P0" ? 1 : 2;
  if (sourcePlan.includes("test-quality")) return priority === "P2" || priority === "P3" ? 4 : 2;
  if (sourcePlan.includes("seo-public")) return priority === "P0" ? 2 : 3;
  if (sourcePlan.includes("ui-ux")) return priority === "P0" ? 1 : 3;
  if (sourcePlan.includes("company-info")) return isQdrantMigrationTask(task) ? 6 : 3;
  if (sourcePlan.includes("backend-config")) return priority === "P1" ? 3 : 4;
  if (sourcePlan.includes("release-infrastructure") || sourcePlan.includes("monitoring-logging")) {
    return priority === "P0" ? 1 : 4;
  }
  if (sourcePlan.includes("performance-cost") || sourcePlan.includes("maintainability")) return 5;
  return priority === "P0" ? 1 : priority === "P1" ? 2 : 5;
}

export function inferReleaseBlocking(task) {
  const phase = task.executionPhase ?? inferExecutionPhase(task);
  const priority = String(task.priority ?? "");
  const text = taskSearchText(task);
  if (isTerminalTask(task) || phase === 0 || phase >= 5) return false;
  if (/公開前必須ではな|公開前対象外|任意評価|長期検討/i.test(text)) return false;
  return priority === "P0" || priority === "Critical" || priority === "High";
}

export function inferExternalServiceRequirements(task) {
  const text = taskSearchText(task);
  const requirements = [];
  const add = (service, requirementLevel, rationale) => {
    if (!requirements.some((item) => item.service === service)) {
      requirements.push({ service, requirementLevel, rationale });
    }
  };

  if (/Qdrant/i.test(text)) {
    add("Qdrant", "not-required", "Qdrant は公開前または中期の必須実装対象ではなく、長期検討として扱う。");
  }
  if (/Cloudflare\s+proxy|orange cloud/i.test(text)) {
    add("Cloudflare proxy", "optional-evaluation", "Cloudflare proxy は公開前必須ではなく、必要時に別タスクで評価する。");
  }
  if (/WAF/i.test(text)) {
    add("Cloudflare WAF", "optional-evaluation", "WAF は公開前必須ではなく、公開後または別ゲートで評価する。");
  }
  if (/Turnstile/i.test(text)) {
    add("Cloudflare Turnstile", "optional-evaluation", "Turnstile は公開前必須ではなく、公開後または別ゲートで評価する。");
  }
  for (const { service, pattern } of [
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
  ]) {
    if (pattern.test(text)) {
      add(service, "not-required", `${service} は今回の公開前必須サービスではなく、既存サービスまたは任意評価で代替する。`);
    }
  }

  return requirements;
}

export function normalizeExternalServiceRequirements(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter(Boolean)
    .map((item) => ({
      service: String(item.service ?? "").trim(),
      requirementLevel: String(item.requirementLevel ?? "").trim(),
      rationale: String(item.rationale ?? "").trim(),
    }))
    .filter((item) => item.service || item.requirementLevel || item.rationale);
}

export function withPlanTaskMetadata(task) {
  const inferredPhase = inferExecutionPhase(task);
  const executionPhase = Number.isInteger(task.executionPhase) ? task.executionPhase : inferredPhase;
  const releaseBlocking = typeof task.releaseBlocking === "boolean" ? task.releaseBlocking : inferReleaseBlocking({ ...task, executionPhase });
  const existingRequirements = normalizeExternalServiceRequirements(task.externalServiceRequirements);
  const inferredRequirements = inferExternalServiceRequirements(task);
  const byService = new Map();
  for (const requirement of [...inferredRequirements, ...existingRequirements]) {
    byService.set(requirement.service, requirement);
  }

  return {
    ...task,
    executionPhase,
    releaseBlocking,
    externalServiceRequirements: Array.from(byService.values()),
  };
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
