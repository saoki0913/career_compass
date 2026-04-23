import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  classifyUiReviewAuthMode,
  getPreferredLocalUiReviewAuthMode,
  normalizeReviewRoute,
  resolveUiReviewRoutes,
} from "./ui-review-routing.mjs";
import {
  getE2EFunctionalCommand,
  resolveE2EFunctionalFeatureForPath,
} from "./e2e-functional-features.mjs";

const TSC_COMMAND = "npx tsc --noEmit";
const UI_LINT_COMMAND = "npm run lint:ui:guardrails";
const UNIT_TEST_COMMAND = "npm run test:unit -- --run";
const HARNESS_TEST_COMMAND = "npm run test:harness";
const AUTH_STATE_COMMAND = "npm run auth:save-playwright-state";
const STATE_VERSION = 1;

const UI_FILE_PATTERNS = [
  /^src\/components\//u,
  /^src\/components\/skeletons\//u,
  /^src\/app\/.+\/(?:page|layout|loading)\.tsx$/u,
  /^src\/app\/(?:page|layout|loading)\.tsx$/u,
];

const HARNESSED_TS_PATTERNS = [
  /^src\//u,
  /^e2e\//u,
  /^tools\//u,
  /^playwright(?:\.live)?\.config\.ts$/u,
  /^package\.json$/u,
  /^\.codex\//u,
  /^\.claude\//u,
  /^scripts\/(?:codex|claude|cursor|agent-pipeline)\//u,
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeRepoPath(filePath, cwd = process.cwd()) {
  const normalized = String(filePath || "").replaceAll("\\", "/").trim().replace(/\/+$/u, "");
  if (!normalized) {
    return "";
  }

  const repoRoot = String(cwd || "").replaceAll("\\", "/").replace(/\/+$/u, "");
  if (repoRoot && normalized.startsWith(`${repoRoot}/`)) {
    return normalized.slice(repoRoot.length + 1);
  }

  return normalized.replace(/^\.\/+/u, "");
}

export function getVerificationDir(cwd = process.cwd(), env = process.env) {
  if (env.AI_VERIFICATION_DIR?.trim()) {
    return path.resolve(cwd, env.AI_VERIFICATION_DIR.trim());
  }
  return path.join(cwd, ".ai", "verification");
}

export function getVerificationCurrentPath(cwd = process.cwd(), env = process.env) {
  return path.join(getVerificationDir(cwd, env), "current.json");
}

export function getVerificationRunsDir(cwd = process.cwd(), env = process.env) {
  return path.join(getVerificationDir(cwd, env), "runs");
}

export function getPlaywrightAuthStatePath(cwd = process.cwd(), env = process.env) {
  if (env.PLAYWRIGHT_AUTH_STATE?.trim()) {
    return path.resolve(cwd, env.PLAYWRIGHT_AUTH_STATE.trim());
  }
  return path.join(cwd, ".ai", "auth", "playwright-auth-state.json");
}

export function collectChangedFiles(cwd = process.cwd()) {
  const tracked = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd,
    encoding: "utf8",
  });

  const trackedFiles = tracked.status === 0 ? tracked.stdout.split(/\r?\n/u) : [];
  const untrackedFiles = untracked.status === 0 ? untracked.stdout.split(/\r?\n/u) : [];
  return unique([...trackedFiles, ...untrackedFiles].map((file) => normalizeRepoPath(file, cwd)));
}

function hasUiRelevantChange(changedFiles) {
  return changedFiles.some((filePath) => UI_FILE_PATTERNS.some((pattern) => pattern.test(filePath)));
}

function hasTsOrUiChange(changedFiles) {
  return changedFiles.some((filePath) => HARNESSED_TS_PATTERNS.some((pattern) => pattern.test(filePath)));
}

function hasHarnessChange(changedFiles) {
  return changedFiles.some((filePath) =>
    /^(?:\.codex\/|\.claude\/|tools\/|scripts\/(?:codex|claude|cursor|agent-pipeline)\/|docs\/ops\/(?:AI_HARNESS|CODEX_HARNESS)\.md)/u.test(
      filePath,
    ),
  );
}

function hasUnitTestImpact(changedFiles) {
  return changedFiles.some((filePath) =>
    /^(?:src\/|tools\/|playwright(?:\.live)?\.config\.ts$|package\.json$)/u.test(filePath),
  );
}

function resolveFeatures(changedFiles, featureOverrides = []) {
  if (featureOverrides.length > 0) {
    return unique(featureOverrides);
  }

  return unique(changedFiles.map((filePath) => resolveE2EFunctionalFeatureForPath(filePath)));
}

function getLocalUiAuthMode(routes, authModeOverride) {
  if (authModeOverride?.trim()) {
    return authModeOverride.trim();
  }
  if (routes.length === 0) {
    return "none";
  }
  return getPreferredLocalUiReviewAuthMode(routes) || classifyUiReviewAuthMode(routes);
}

function buildUiCheckId(kind, routePath) {
  return `${kind}:${normalizeReviewRoute(routePath)}`;
}

function buildUiCommand(kind, routePath, authMode) {
  const normalized = normalizeReviewRoute(routePath);
  const authFlag = authMode && authMode !== "none" ? ` --auth=${authMode}` : "";

  if (kind === "ui:preflight") {
    return `npm run ui:preflight -- ${normalized} --surface=product${authFlag}`;
  }

  if (kind === "ui:review") {
    return `npm run test:ui:review -- ${normalized}${authFlag}`;
  }

  return `npm run verify:manual -- --route ${normalized}${authFlag}`;
}

export function resolveVerificationPlan({
  changedFiles = [],
  routeOverrides = [],
  featureOverrides = [],
  authModeOverride = "",
} = {}) {
  const normalizedFiles = unique(changedFiles.map((filePath) => normalizeRepoPath(filePath)));
  const uiScope = resolveUiReviewRoutes({ changedFiles: normalizedFiles });
  const routes =
    routeOverrides.length > 0
      ? unique(routeOverrides.map((route) => normalizeReviewRoute(route)))
      : uiScope.routes;
  const authMode = getLocalUiAuthMode(routes, authModeOverride);
  const features = resolveFeatures(normalizedFiles, featureOverrides);
  const checks = [];
  const unresolved = [];

  checks.push({
    id: "tsc:noemit",
    kind: "typescript",
    command: TSC_COMMAND,
    required: true,
  });

  if (hasTsOrUiChange(normalizedFiles)) {
    checks.push({
      id: "lint:ui:guardrails",
      kind: "ui-lint",
      command: UI_LINT_COMMAND,
      required: true,
    });
  }

  if (hasHarnessChange(normalizedFiles)) {
    checks.push({
      id: "test:harness",
      kind: "harness",
      command: HARNESS_TEST_COMMAND,
      required: true,
    });
  }

  if (hasUnitTestImpact(normalizedFiles)) {
    checks.push({
      id: "test:unit",
      kind: "unit",
      command: UNIT_TEST_COMMAND,
      required: true,
    });
  }

  if (routes.length > 0) {
    let authStateAdded = false;
    for (const routePath of routes) {
      checks.push({
        id: buildUiCheckId("ui:preflight", routePath),
        kind: "ui:preflight",
        route: routePath,
        authMode,
        command: buildUiCommand("ui:preflight", routePath, authMode),
        required: true,
      });

      if (authMode === "real" && !authStateAdded) {
        checks.push({
          id: "auth:playwright-state",
          kind: "auth-state",
          authMode,
          command: AUTH_STATE_COMMAND,
          required: true,
        });
        authStateAdded = true;
      }

      checks.push({
        id: buildUiCheckId("ui:review", routePath),
        kind: "ui:review",
        route: routePath,
        authMode,
        command: buildUiCommand("ui:review", routePath, authMode),
        required: true,
      });

      checks.push({
        id: buildUiCheckId("manual:review", routePath),
        kind: "manual:review",
        route: routePath,
        authMode,
        command: buildUiCommand("manual:review", routePath, authMode),
        required: true,
        interactive: true,
      });
    }
  }

  for (const feature of features) {
    const command = getE2EFunctionalCommand(feature, "local");
    if (!command) {
      unresolved.push(`feature:${feature}`);
      continue;
    }
    checks.push({
      id: `e2e-functional:${feature}`,
      kind: "e2e-functional",
      feature,
      command,
      required: true,
    });
  }

  const codeFiles = normalizedFiles.filter((filePath) =>
    /^(?:src\/|backend\/|tools\/|scripts\/|\.codex\/|\.claude\/|playwright(?:\.live)?\.config\.ts$|package\.json$)/u.test(
      filePath,
    ),
  );
  if (codeFiles.length > 0 && checks.length === 1 && routes.length === 0 && features.length === 0) {
    unresolved.push(...codeFiles);
  }

  return {
    version: STATE_VERSION,
    changedFiles: normalizedFiles,
    generatedAt: new Date().toISOString(),
    routes,
    features,
    authMode,
    hasUiChange: hasUiRelevantChange(normalizedFiles),
    unresolved: unique(unresolved),
    checks,
  };
}

export async function ensureVerificationDirs(cwd = process.cwd(), env = process.env) {
  await fsp.mkdir(getVerificationRunsDir(cwd, env), { recursive: true });
  await fsp.mkdir(path.dirname(getPlaywrightAuthStatePath(cwd, env)), { recursive: true });
}

export async function readVerificationState(cwd = process.cwd(), env = process.env) {
  const filePath = getVerificationCurrentPath(cwd, env);
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeVerificationState(state, cwd = process.cwd(), env = process.env) {
  await ensureVerificationDirs(cwd, env);
  const filePath = getVerificationCurrentPath(cwd, env);
  const payload = {
    version: STATE_VERSION,
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function appendVerificationRun(record, cwd = process.cwd(), env = process.env) {
  await ensureVerificationDirs(cwd, env);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const baseName = `${timestamp}-${String(record.id || "run").replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
  const jsonPath = path.join(getVerificationRunsDir(cwd, env), `${baseName}.json`);
  await fsp.writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (record.markdown) {
    await fsp.writeFile(path.join(getVerificationRunsDir(cwd, env), `${baseName}.md`), `${record.markdown}\n`, "utf8");
  }
  return jsonPath;
}

export function mergePlanWithState(plan, previousState) {
  const previousChecks = new Map(
    (previousState?.checks || []).map((check) => [check.id, check]),
  );

  return {
    ...plan,
    stale: previousState?.stale ?? false,
    staleReason: previousState?.staleReason ?? null,
    sessionId: previousState?.sessionId ?? null,
    checks: plan.checks.map((check) => {
      const previous = previousChecks.get(check.id);
      if (!previous) {
        return { ...check, status: "not_run" };
      }

      return {
        ...check,
        status: previous.status || "not_run",
        lastRunAt: previous.lastRunAt ?? null,
        exitCode: previous.exitCode ?? null,
        evidencePath: previous.evidencePath ?? null,
        message: previous.message ?? null,
      };
    }),
  };
}

export async function rebuildVerificationState(options = {}, cwd = process.cwd(), env = process.env) {
  const plan = resolveVerificationPlan({
    changedFiles: options.changedFiles || collectChangedFiles(cwd),
    routeOverrides: options.routeOverrides || [],
    featureOverrides: options.featureOverrides || [],
    authModeOverride: options.authModeOverride || "",
  });
  const previous = await readVerificationState(cwd, env);
  return mergePlanWithState(plan, previous);
}

export async function markVerificationStale({
  filePath,
  sessionId = null,
  agent = "unknown",
} = {}, cwd = process.cwd(), env = process.env) {
  const changedFiles = collectChangedFiles(cwd);
  const nextState = await rebuildVerificationState({ changedFiles }, cwd, env);
  nextState.stale = true;
  nextState.staleReason = filePath ? `file changed: ${normalizeRepoPath(filePath, cwd)}` : "file changed";
  nextState.sessionId = sessionId || nextState.sessionId || null;
  nextState.lastEditedBy = agent;
  nextState.lastEditedAt = new Date().toISOString();
  nextState.checks = nextState.checks.map((check) => {
    if (check.status === "passed") {
      return { ...check, status: "stale" };
    }
    return check;
  });
  return writeVerificationState(nextState, cwd, env);
}

export async function recordCheckResult({
  id,
  status,
  exitCode = null,
  message = null,
  evidencePath = null,
} = {}, cwd = process.cwd(), env = process.env) {
  const state = (await readVerificationState(cwd, env)) || (await rebuildVerificationState({}, cwd, env));
  state.checks = state.checks.map((check) =>
    check.id === id
      ? {
          ...check,
          status,
          exitCode,
          message,
          evidencePath,
          lastRunAt: new Date().toISOString(),
        }
      : check,
  );
  state.stale = state.checks.some((check) => check.status === "stale");
  if (!state.stale) {
    state.staleReason = null;
  }
  return writeVerificationState(state, cwd, env);
}

export function formatCheckLabel(check) {
  if (check.route) {
    return `${check.kind} ${check.route}`;
  }
  if (check.feature) {
    return `${check.kind} ${check.feature}`;
  }
  return check.kind;
}

export function evaluateVerificationState(state) {
  if (!state) {
    return {
      ok: false,
      missing: ["verification state is missing"],
      failed: [],
      unresolved: [],
      stale: false,
    };
  }

  const missing = [];
  const failed = [];
  const unresolved = [...(state.unresolved || [])];

  for (const check of state.checks || []) {
    if (check.status === "failed") {
      failed.push(formatCheckLabel(check));
      continue;
    }

    if (check.status !== "passed") {
      missing.push(formatCheckLabel(check));
    }
  }

  if (state.stale) {
    missing.unshift(`stale:${state.staleReason || "verification state is stale"}`);
  }

  return {
    ok: missing.length === 0 && failed.length === 0 && unresolved.length === 0,
    missing,
    failed,
    unresolved,
    stale: Boolean(state.stale),
  };
}

export function formatVerificationStatus(state) {
  const evaluation = evaluateVerificationState(state);
  const lines = [];
  lines.push(`verification: ${evaluation.ok ? "pass" : "fail"}`);

  if (state?.checks?.length) {
    for (const check of state.checks) {
      lines.push(`- ${check.status || "not_run"} ${formatCheckLabel(check)}`);
    }
  }

  if (evaluation.unresolved.length > 0) {
    lines.push(`- unresolved ${evaluation.unresolved.join(", ")}`);
  }

  return lines.join("\n");
}

export function runShellCommand(command, cwd = process.cwd(), env = process.env) {
  return spawnSync(command, {
    cwd,
    env,
    stdio: "inherit",
    shell: true,
  });
}

export function stateHasMatchingPreflight(state, filePath) {
  if (!state) {
    return false;
  }

  const uiScope = resolveUiReviewRoutes({
    changedFiles: [normalizeRepoPath(filePath)],
  });
  if (!uiScope.shouldRun || uiScope.routes.length === 0) {
    return true;
  }

  const passedPreflightRoutes = new Set(
    (state.checks || [])
      .filter((check) => check.kind === "ui:preflight" && check.status === "passed" && check.route)
      .map((check) => normalizeReviewRoute(check.route)),
  );

  return uiScope.routes.some((routePath) => passedPreflightRoutes.has(normalizeReviewRoute(routePath)));
}

export function hasPlaywrightAuthState(cwd = process.cwd(), env = process.env) {
  const statePath = getPlaywrightAuthStatePath(cwd, env);
  if (!fs.existsSync(statePath)) {
    return false;
  }
  try {
    const content = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const cookies = Array.isArray(content.cookies) ? content.cookies : [];
    const hasLocalhostSession = cookies.some(
      (c) => c.name === "better-auth.session_token" && /localhost/i.test(c.domain || ""),
    );
    if (!hasLocalhostSession) {
      return false;
    }
    const sessionCookie = cookies.find(
      (c) => c.name === "better-auth.session_token" && /localhost/i.test(c.domain || ""),
    );
    if (sessionCookie?.expires && sessionCookie.expires > 0 && sessionCookie.expires < Date.now() / 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
