#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { PLAN_TASKS_PATH, normalizeStatus, todayJst } from "./lib/plan-task-store.mjs";
import { legacyTaskBoardArchives } from "./data/legacy-task-board-archives.mjs";

const project = process.cwd();
const docsDir = path.join(project, "docs/plan");
const outPath = path.join(project, PLAN_TASKS_PATH);
const fresh = process.argv.includes("--fresh");

const manualBacklog = [
  {
    id: "plan-sync:fastapi-sse-contract",
    sourcePlan: "monitoring-logging-incident-response-plan.md",
    status: "Todo",
    priority: "P0",
    area: "FastAPI",
    task: "SSE actor key と client disconnect cancellation contract を計画に反映する",
    ownerAgent: "fastapi-developer",
    acceptanceCriteria: [
      "`CareerPrincipal` 由来の actor key を全 SSE feature で統一する実装タスクがある",
      "client disconnect → provider abort → lease release → billing cancel の受け入れテストが明記される",
    ],
    verificationCommands: [
      "python -m pytest backend/tests/shared/test_sse_concurrency.py backend/tests/es_review/test_es_review_stream_cancellation.py backend/tests/interview/test_interview_stream_cancellation.py -q",
    ],
    evidence: ["FastAPI audit: SSE actor key inconsistency and cancellation contract gap"],
  },
  {
    id: "plan-sync:rag-metadata-contract",
    sourcePlan: "llm-rag-security-owasp-audit.md",
    status: "Todo",
    priority: "P0",
    area: "RAG",
    task: "`RagChunkMetadata` 型、private material pre-OCR gate、削除 receipt 実測を計画に反映する",
    ownerAgent: "rag-engineer",
    acceptanceCriteria: [
      "Chroma/BM25/Redis の metadata contract と deletion receipt が JSON タスクにある",
      "private material は OCR/embedding より前に consent/retention/provider policy を検証する",
    ],
    verificationCommands: [
      "python -m pytest backend/tests/security/test_private_material_rag_contract.py backend/tests/security/test_tenant_isolation.py -q",
    ],
    evidence: ["RAG audit: metadata dict contract and deletion receipt are incomplete"],
  },
  {
    id: "plan-sync:db-migration-safety-drift",
    sourcePlan: "db-design-optimization-rls.md",
    status: "Todo",
    priority: "P0",
    area: "Database",
    task: "RLS Phase 0 未実装、JSONB 36 件、0031/0036 migration safety drift を計画に反映する",
    ownerAgent: "database-engineer",
    acceptanceCriteria: [
      "`dbReadWithIdentity` / `SET LOCAL app.current_*` は未実装として扱われる",
      "rollback section、snapshot presence、Drizzle 配下 CONCURRENTLY 禁止の validator タスクがある",
    ],
    verificationCommands: [
      "bash scripts/ci/validate-migrations.sh",
      "node scripts/ci/check-migration-safety.mjs --staged",
    ],
    evidence: ["Database audit: RLS boundary API is absent; JSONB count is 36"],
  },
  {
    id: "plan-sync:next-raw-error-debt",
    sourcePlan: "auth-guest-ownership-api-boundary-plan.md",
    status: "Todo",
    priority: "P0",
    area: "Next BFF",
    task: "raw error response 残存と owner helper 収束不足を未完タスクとして追跡する",
    ownerAgent: "nextjs-developer",
    acceptanceCriteria: [
      "`check-raw-error-responses` の既存赤がタスクとして残る",
      "`guestId!` を使う owner 条件 helper の置換タスクがある",
    ],
    verificationCommands: [
      "node scripts/security/check-raw-error-responses.mjs --project /Users/saoki/work/career_compass",
    ],
    evidence: ["Next.js audit: raw error response remains in gakuchika generate draft route"],
  },
  {
    id: "plan-sync:es-prompt-contract-drift",
    sourcePlan: "llm-rag-security-owasp-audit.md",
    status: "Todo",
    priority: "P0",
    area: "Prompt",
    task: "ES Review 計画を LLM validation 実装済み前提へ更新し、型安全 prompt contract と outbound policy を次タスクにする",
    ownerAgent: "prompt-engineer",
    acceptanceCriteria: [
      "LLM validation は `llm_validation.py` 実装済みとして扱われる",
      "`TemplateDef` の `Any` / `total=False` と ES review outbound policy が未完タスクになる",
    ],
    verificationCommands: [
      "cd backend && pytest backend/tests/es_review/test_llm_validation.py backend/tests/security/test_outbound_policy.py -q",
    ],
    evidence: ["Prompt audit: plan As-Is is stale; type contracts and PII minimization remain"],
  },
  {
    id: "plan-sync:test-json-ssot",
    sourcePlan: "test-quality-gate-plan.md",
    status: "Done",
    priority: "P0",
    area: "Quality Gate",
    task: "削除済み per-plan task JSON ではなく統合 `docs/plan/plan-tasks.json` を SSOT にする",
    ownerAgent: "test-automator",
    acceptanceCriteria: [
      "`docs/plan/plan-tasks.json` が存在し validator が通る",
      "旧 updater は統合 JSON を更新する互換 wrapper になる",
    ],
    verificationCommands: [
      "node scripts/plan/validate-plan-tasks.mjs",
      "node scripts/plan/update-test-quality-task-status.mjs --id F1 --status Doing --notes smoke --dry-run",
    ],
    evidence: ["Implementation: unified task store added"],
  },
];

function slugifyPlan(fileName) {
  return fileName.replace(/\.md$/, "");
}

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = [];
  let cell = "";
  let inCode = false;
  const body = trimmed.slice(1, -1);

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];

    if (char === "\\" && next === "|") {
      cell += "|";
      index += 1;
      continue;
    }

    if (char === "`") {
      inCode = !inCode;
      cell += char;
      continue;
    }

    if (char === "|" && !inCode) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells.map((value) => value.trim().replace(/<br\s*\/?>/gi, "; "));
}

function isSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[\s_-]+/g, "");
}

function headerIndex(headers, names) {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const index = normalized.indexOf(normalizeHeader(name));
    if (index !== -1) return index;
  }
  return -1;
}

function extractRawId(taskText, explicitId) {
  const fromExplicit = explicitId?.trim();
  if (fromExplicit) return fromExplicit.replace(/^`|`$/g, "");
  const normalized = taskText.replace(/`/g, "");
  const match = normalized.match(/^\s*([A-Z]{1,5}-?\d{1,3}[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s*[:：]/);
  if (match) return match[1];
  return "";
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim();
}

function stableId(planSlug, rawId, ordinal) {
  const local = rawId
    ? rawId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : `task-${String(ordinal).padStart(3, "0")}`;
  return `${planSlug}:${local}`;
}

function parseTables(fileName, content) {
  const tasks = [];
  const lines = content.split(/\r?\n/);
  let ordinal = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const headers = splitRow(lines[i]);
    const separator = splitRow(lines[i + 1] ?? "");
    if (!headers || !separator || !isSeparator(separator)) continue;
    if (!headers.some((header) => normalizeHeader(header) === "status")) continue;

    const statusIdx = headerIndex(headers, ["Status"]);
    const taskIdx = headerIndex(headers, ["Task", "タスク"]);
    if (statusIdx === -1 || taskIdx === -1) continue;

    const priorityIdx = headerIndex(headers, ["Priority", "Severity"]);
    const areaIdx = headerIndex(headers, ["Area", "Phase", "OWASP"]);
    const idIdx = headerIndex(headers, ["ID", "Task ID"]);
    const ownerIdx = headerIndex(headers, ["Owner"]);
    const evidenceIdx = headerIndex(headers, ["Evidence", "Ref", "対象ファイル"]);
    const acceptanceIdx = headerIndex(headers, ["Acceptance Criteria"]);
    const verificationIdx = headerIndex(headers, ["Verification"]);
    const updatedIdx = headerIndex(headers, ["Updated At", "Updated"]);

    for (let j = i + 2; j < lines.length; j += 1) {
      const row = splitRow(lines[j]);
      if (!row) break;
      if (row.length < headers.length - 1) break;
      const rawStatus = row[statusIdx] ?? "";
      if (!rawStatus.trim()) continue;

      let status;
      try {
        status = normalizeStatus(stripMarkdown(rawStatus));
      } catch {
        continue;
      }

      ordinal += 1;
      const task = stripMarkdown(row[taskIdx] ?? "");
      const rawId = extractRawId(task, idIdx === -1 ? "" : row[idIdx]);
      const planSlug = slugifyPlan(fileName);
      const id = stableId(planSlug, rawId, ordinal);
      const sourcePlan = fileName;

      tasks.push({
        id,
        rawId: rawId || null,
        aliases: rawId ? [rawId] : [],
        sourcePlan,
        status,
        originalStatus: stripMarkdown(rawStatus),
        priority: stripMarkdown(priorityIdx === -1 ? "" : row[priorityIdx]) || "Unprioritized",
        area: stripMarkdown(areaIdx === -1 ? "" : row[areaIdx]) || "General",
        task,
        ownerAgent: stripMarkdown(ownerIdx === -1 ? "" : row[ownerIdx]) || "orchestrator",
        acceptanceCriteria: [stripMarkdown(acceptanceIdx === -1 ? "" : row[acceptanceIdx]) || "Source plan task acceptance criteria must be preserved before implementation."],
        verificationCommands: verificationIdx === -1 || !row[verificationIdx] ? [] : [stripMarkdown(row[verificationIdx])],
        dependencies: [],
        evidence: evidenceIdx === -1 || !row[evidenceIdx] ? [] : [stripMarkdown(row[evidenceIdx])],
        updatedAt: stripMarkdown(updatedIdx === -1 ? "" : row[updatedIdx]) || "2026-05-13",
        notes: "",
      });
    }
  }

  return tasks;
}

function mergeExisting(tasks) {
  if (fresh) return tasks;
  if (!existsSync(outPath)) return tasks;
  const existing = JSON.parse(readFileSync(outPath, "utf8"));
  const byId = new Map(existing.tasks.map((task) => [task.id, task]));
  return tasks.map((task) => {
    const current = byId.get(task.id);
    if (!current) return task;
    const preserveStatus = Boolean(current.lastUpdatedBy);
    return {
      ...task,
      status: preserveStatus ? current.status : task.status,
      evidence: Array.from(new Set([...(task.evidence ?? []), ...(current.evidence ?? [])])),
      notes: current.notes ?? task.notes,
      updatedAt: preserveStatus ? current.updatedAt : task.updatedAt,
      lastUpdatedBy: current.lastUpdatedBy,
      supersededBy: current.supersededBy,
    };
  });
}

const markdownFiles = readdirSync(docsDir)
  .filter((fileName) => fileName.endsWith(".md"))
  .sort();

const completedMarkdownFiles = readdirSync(path.join(docsDir, "completed"))
  .filter((fileName) => fileName.endsWith(".md"))
  .map((fileName) => `completed/${fileName}`)
  .sort();

const parsedTasks = markdownFiles.flatMap((fileName) => {
  const content = readFileSync(path.join(docsDir, fileName), "utf8");
  return parseTables(fileName, content);
});

const manualTasks = manualBacklog.map((task) => ({
  rawId: null,
  aliases: [],
  dependencies: [],
  notes: "",
  updatedAt: todayJst(),
  ...task,
}));

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

const legacyTasks = legacyTaskBoardArchives.flatMap((archive) =>
  (archive.data.tasks ?? []).map((task) => {
    const acceptanceCriteria = asArray(task.acceptanceCriteria);
    return {
      id: task.id,
      rawId: task.id,
      aliases: [task.id],
      sourcePlan: archive.sourcePlan,
      status: normalizeStatus(task.status),
      originalStatus: task.status,
      priority: task.priority ?? task.severity ?? "Unprioritized",
      area: task.area ?? archive.data.plan ?? archive.data.scope ?? archive.file,
      task: task.task ?? task.title,
      ownerAgent: task.owner ?? "orchestrator",
      acceptanceCriteria:
        acceptanceCriteria.length > 0
          ? acceptanceCriteria
          : ["Legacy task board did not define acceptance criteria; original id, title, status, and archived source are preserved."],
      verificationCommands: asArray(task.verificationCommands ?? task.tests),
      dependencies: [],
      evidence: asArray(task.evidence),
      updatedAt: task.updatedAt ?? archive.data.updatedAt ?? todayJst(),
      notes: asArray(task.notes).join("; "),
      archivedFrom: archive.file,
    };
  }),
);

const legacyAliasKeys = new Set(legacyTasks.map((task) => `${task.sourcePlan}:${task.rawId}`));
const sourceTasks = parsedTasks.filter((task) => !task.rawId || !legacyAliasKeys.has(`${task.sourcePlan}:${task.rawId}`));

function uniquifyIds(tasks) {
  const seen = new Map();
  return tasks.map((task) => {
    const count = (seen.get(task.id) ?? 0) + 1;
    seen.set(task.id, count);
    if (count === 1) return task;
    return {
      ...task,
      id: `${task.id}-${count}`,
    };
  });
}

const tasks = mergeExisting(uniquifyIds([...sourceTasks, ...manualTasks, ...legacyTasks])).sort((a, b) => a.id.localeCompare(b.id));
const duplicateIds = tasks.filter((task, index) => tasks.findIndex((candidate) => candidate.id === task.id) !== index);
if (duplicateIds.length > 0) {
  process.stderr.write(`Duplicate task ids: ${duplicateIds.map((task) => task.id).join(", ")}\n`);
  process.exit(1);
}

const data = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  lastUpdated: todayJst(),
  description: "Unified SSOT for docs/plan task state. Markdown plan files are narrative; this JSON is the task state source of truth.",
  statusValues: ["Todo", "Doing", "Blocked", "Review", "Done", "Superseded"],
  completionCriteria: [
    "No task remains in Todo, Doing, Blocked, or Review unless it is intentionally deferred with a supersededBy or dependency note.",
    "Every task has non-empty acceptanceCriteria and a sourcePlan.",
    "After all tasks are Done or Superseded, obsolete compatibility JSON files under docs/plan may be removed.",
  ],
  documents: Array.from(new Set([...markdownFiles, ...completedMarkdownFiles])),
  tasks,
};

writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`);
process.stdout.write(`Wrote ${tasks.length} tasks to ${PLAN_TASKS_PATH}\n`);
