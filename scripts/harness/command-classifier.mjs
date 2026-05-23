#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

const SAFE_DELETE_TARGETS = new Set([
  "node_modules",
  ".next",
  "build",
  "dist",
  "__pycache__",
  "coverage",
  ".turbo",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "out",
  ".parcel-cache",
  ".vercel",
  "target",
  "tmp",
  ".output",
  ".nuxt",
  ".svelte-kit",
]);

const FAST_PATH_EXTENSIONS = new Set([".md", ".txt", ".json", ".yml", ".yaml", ".css", ".svg"]);

const INFRA_PATH_PREFIXES = [
  ".claude/hooks/",
  ".codex/hooks/",
  ".github/workflows/",
  "scripts/harness/",
  "scripts/codex/",
];

const HOTSPOT_FILES = new Set([
  "backend/app/routers/company_info.py",
  "backend/app/routers/es_review.py",
  "backend/app/utils/llm.py",
  "src/components/companies/CorporateInfoSection.tsx",
  "src/components/es/ReviewPanel.tsx",
  "src/hooks/useESReview.ts",
  "src/lib/server/app-loaders.ts",
]);

// --- Codex autonomy-budget taxonomy (single source of truth) ---
// Consumed by .codex/hooks/lib/autonomy.sh, user-prompt-submit-router.sh and
// the runtime guards via the `taxonomy` subcommand below, so the router, the
// autonomy manifest and the guards can never disagree on the token universe.
const CODEX_AUTONOMY_ACTIONS = Object.freeze([
  "test",
  "push",
  "release",
  "production-promotion",
  "edit",
  "commit",
  "migration",
]);
const CODEX_AUTONOMY_RELEASE_MODES = Object.freeze([
  "staging",
  "production",
  "stage-all",
  "release",
  "provider",
]);
// Reference/serialization only (NOT control flow): the predicate names whose
// match means "dangerous / irreversible" and therefore can never be softened
// by autonomy or HARNESS_DISABLE_ADVISORY. The guards still enforce these via
// guard-core predicates; this list documents the frozen hard-stop boundary.
const CODEX_HARDSTOP_PREDICATES = Object.freeze([
  "forcePush",
  "gitPushProtectedTarget",
  "productionPromotion",
  "secretApplyProduction",
  "migrationApply",
  "unsafeDelete",
  "readsSensitivePath",
  "protectedCheckpoint",
]);

function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  let escape = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escape = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";" || char === "|" || char === "&") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if ((char === "|" || char === "&") && command[index + 1] === char) index += 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function detectUnsafeShellExpansion(segment) {
  let quote = null;
  let escape = false;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    const next = segment[index + 1] || "";

    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (quote === "'") {
      if (char === quote) quote = null;
      continue;
    }
    if (quote === '"') {
      if (char === quote) {
        quote = null;
        continue;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "$" && next === "(") {
      return { unsafe: true, reason: "command_substitution" };
    }
    if (char === "`") {
      return { unsafe: true, reason: "backtick_substitution" };
    }
    if ((char === "<" || char === ">") && next === "(") {
      return { unsafe: true, reason: "process_substitution" };
    }
    if (char === "$" && /[A-Za-z_{0-9@*#?$!-]/.test(next)) {
      return { unsafe: true, reason: "variable_expansion" };
    }
  }
  if (quote) {
    return { unsafe: true, reason: "unmatched_quote" };
  }
  return { unsafe: false, reason: "" };
}

function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escape = false;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function isAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function assignmentPair(token) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(token || "");
  return match ? [match[1], match[2]] : null;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePathToken(token) {
  return token
    .replace(/^file:\/\//, "")
    .replace(/^\$PWD\//, "./")
    .replace(/^\.\//, "");
}

function isSensitivePath(token) {
  const value = normalizePathToken(token);
  if (!value) return false;
  const base = path.basename(value);
  const inRealSecretStore =
    value.includes("codex-company/.secrets/") ||
    value.includes("/.secrets/") ||
    value === ".secrets" ||
    value.startsWith(".secrets/") ||
    value.includes("/secrets/") ||
    value.startsWith("secrets/");
  const isKeyMaterial = /\.(pem|key|p12)$/i.test(base);
  // Env/secret templates carry only placeholders and are git-tracked, so they
  // must remain editable. They are definitionally non-secret (real secret files
  // never use the .env.example suffix, and secrets-examples/ is the tracked
  // template directory). Exempt them — but never override the real secret store
  // or key material, so a file under .secrets/ stays protected regardless.
  const isEnvTemplate =
    base.endsWith(".env.example") ||
    value.includes("/secrets-examples/") ||
    value.startsWith("secrets-examples/");
  if (isEnvTemplate && !inRealSecretStore && !isKeyMaterial) return false;
  return (
    inRealSecretStore ||
    base === ".env" ||
    base.startsWith(".env.") ||
    isKeyMaterial
  );
}

function unwrapCommandWithAssignments(tokens) {
  let result = [...tokens];
  const assignments = {};
  let changed = true;
  while (changed && result.length > 0) {
    changed = false;
    if (result[0] === "sudo" || result[0] === "command") {
      result = result.slice(1);
      changed = true;
      continue;
    }
    if (result[0] === "env") {
      result = result.slice(1);
      while (result[0] && (isAssignment(result[0]) || result[0] === "-i" || result[0] === "--ignore-environment")) {
        const pair = assignmentPair(result[0]);
        if (pair) assignments[pair[0]] = pair[1];
        result = result.slice(1);
      }
      changed = true;
      continue;
    }
    if (isAssignment(result[0])) {
      const pair = assignmentPair(result[0]);
      if (pair) assignments[pair[0]] = pair[1];
      result = result.slice(1);
      changed = true;
      continue;
    }
  }
  return { tokens: result, assignments };
}

function nestedShellCommand(tokens) {
  const command = path.basename(tokens[0] || "");
  if (!["bash", "sh", "zsh"].includes(command)) return "";
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-c" || token === "-lc" || token === "-ilc") {
      return tokens[index + 1] || "";
    }
  }
  return "";
}

function dotenvCommandIndex(tokens) {
  const first = path.basename(tokens[0] || "");
  if (first === "dotenv" || first === "dotenvx") return 0;
  if (first !== "npx") return -1;

  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index] || "";
    if (token === "--") {
      index += 1;
      break;
    }
    if (token === "-y" || token === "--yes" || token === "--no-install" || token === "--ignore-existing") {
      index += 1;
      continue;
    }
    if (token === "-p" || token === "--package" || token === "--call" || token === "-c") {
      index += 2;
      continue;
    }
    if (token.startsWith("--package=") || token.startsWith("--call=")) {
      index += 1;
      continue;
    }
    break;
  }

  const candidate = path.basename(tokens[index] || "");
  return candidate === "dotenv" || candidate === "dotenvx" ? index : -1;
}

function dotenvNestedCommand(tokens) {
  if (dotenvCommandIndex(tokens) === -1) return [];
  const separator = tokens.lastIndexOf("--");
  if (separator === -1) return [];
  return tokens.slice(separator + 1);
}

function classifyDotenvLoader(tokens, actions, depth) {
  const dotenvIndex = dotenvCommandIndex(tokens);
  if (dotenvIndex === -1) return false;

  actions.readsSensitivePath = true;

  const nested = dotenvNestedCommand(tokens);
  if (nested.length > 0) {
    const nestedFirst = path.basename(nested[0] || "");
    if (["env", "printenv", "set"].includes(nestedFirst)) {
      actions.readsSensitivePath = true;
    }
    classifyTokens(nested, actions, depth + 1);
  }
  return true;
}

function classifyGit(tokens, actions) {
  if (path.basename(tokens[0] || "") !== "git") return;
  const hadGitPush = actions.gitPush;
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "-c" || token === "--config-env") {
      index += 2;
      continue;
    }
    if (token === "-C" || token === "--git-dir" || token === "--work-tree" || token === "--namespace") {
      index += 2;
      continue;
    }
    if (token.startsWith("-")) {
      index += 1;
      continue;
    }
    break;
  }
  const subcommand = tokens[index] || "";
  const rest = tokens.slice(index + 1);
  if (subcommand === "push") {
    const nonTargetFlags = new Set([
      "--force",
      "--force-with-lease",
      "-f",
      "--delete",
      "-d",
      "--mirror",
      "--all",
      "--tags",
      "--prune",
      "--dry-run",
      "-n",
      "--porcelain",
      "--atomic",
      "--follow-tags",
      "--set-upstream",
      "-u",
    ]);
    const targets = [];
    for (let restIndex = 0; restIndex < rest.length; restIndex += 1) {
      const token = rest[restIndex];
      if (!token) continue;
      if (token === "--repo" || token === "--receive-pack" || token === "--exec" || token === "-o" || token === "--push-option") {
        restIndex += 1;
        continue;
      }
      if (token.startsWith("--repo=") || token.startsWith("--receive-pack=") || token.startsWith("--exec=") || token.startsWith("--push-option=")) {
        continue;
      }
      if (nonTargetFlags.has(token) || token.startsWith("-")) {
        continue;
      }
      targets.push(token);
    }
    const segmentRemote = targets[0] || "";
    const segmentRefspecs = targets.slice(1);
    const segmentAllowedTarget =
      segmentRemote === "origin" &&
      segmentRefspecs.length === 1 &&
      segmentRefspecs[0] === "develop";
    if (!actions.gitPushRemote) actions.gitPushRemote = segmentRemote;
    actions.gitPushRefspecs.push(...segmentRefspecs);
    actions.gitPushAllowedTarget = hadGitPush
      ? actions.gitPushAllowedTarget && segmentAllowedTarget
      : segmentAllowedTarget;
    actions.gitPush = true;
    if (rest.some((token) => token === "--force" || token === "--force-with-lease" || token === "-f" || /^-[A-Za-z]*f[A-Za-z]*$/.test(token))) {
      actions.forcePush = true;
    }
    if (rest.some((token) => token === "--delete" || token === "-d" || token === "--mirror" || token.startsWith("+") || token === ":" || /^:[^:]+/.test(token))) {
      actions.forcePush = true;
    }
  }
  if (subcommand === "commit") {
    actions.gitCommit = true;
  }
  if (["checkout", "switch"].includes(subcommand) && rest.some((t) => ["-b", "-c", "-B", "-C", "--create", "--create-force"].includes(t))) {
    actions.gitBranchCreate = true;
  }
  if (subcommand === "branch") {
    const nonCreateFlags = new Set(["-d", "-D", "--delete", "-m", "-M", "--move", "-l", "--list", "-a", "--all", "-r", "--remotes", "-v", "--verbose"]);
    if (!rest.some((t) => nonCreateFlags.has(t)) && rest.some((t) => !t.startsWith("-"))) {
      actions.gitBranchCreate = true;
    }
  }
  if (subcommand === "worktree" && rest.some((t) => t === "-b" || t === "-B")) {
    actions.gitBranchCreate = true;
  }
  if (subcommand === "checkout" && rest.includes("--orphan")) {
    actions.gitBranchCreate = true;
  }
  if (subcommand === "clean" && rest.some((token) => token.includes("x"))) {
    actions.destructiveDelete = true;
    actions.unsafeDelete = true;
  }
}

function classifyGithubCli(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first !== "gh") return;
  const topic = tokens[1] || "";
  const subcommand = tokens[2] || "";
  if (topic === "api") {
    actions.releaseProvider = true;
    actions.releaseModes.add("github-api");
    const methodIndex = tokens.findIndex((token) => token === "-X" || token === "--method");
    const methodToken = methodIndex !== -1 ? tokens[methodIndex + 1] || "" : "";
    const methodEquals = tokens.find((token) => token.startsWith("--method=") || token.startsWith("-X=")) || "";
    const method = (methodToken || methodEquals.split("=").slice(1).join("=") || "GET").toUpperCase();
    const endpoint = tokens.find((token) => token.startsWith("/") || token.includes("/actions/secrets") || token.includes("/secrets/")) || "";
    const hasInputFields = tokens.some((token) =>
      token === "-f" ||
      token === "-F" ||
      token === "--field" ||
      token === "--raw-field" ||
      token.startsWith("-f=") ||
      token.startsWith("-F=") ||
      token.startsWith("--field=") ||
      token.startsWith("--raw-field=")
    );
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) || hasInputFields) {
      actions.releaseMutating = true;
    } else {
      actions.releaseReadOnly = true;
    }
    if (/\/(?:actions\/)?secrets(?:\/|$)/u.test(endpoint)) {
      actions.secretApplyProduction = true;
      actions.releaseMutating = true;
      actions.releaseReadOnly = false;
    }
  }
  if (topic === "pr" && subcommand === "merge") {
    actions.releaseProvider = true;
    actions.releaseMutating = true;
    actions.releaseModes.add("github-merge");
  }
  if (topic === "release" && ["create", "edit", "delete", "upload"].includes(subcommand)) {
    actions.releaseProvider = true;
    actions.releaseMutating = true;
    actions.releaseModes.add("github-release");
  }
  if (topic === "secret" && ["set", "delete", "remove"].includes(subcommand)) {
    actions.releaseProvider = true;
    actions.releaseMutating = true;
    actions.releaseModes.add("github-secret");
    actions.secretApplyProduction = true;
  }
  if (topic === "workflow" && ["run", "enable", "disable"].includes(subcommand)) {
    actions.releaseProvider = true;
    actions.releaseMutating = true;
    actions.releaseModes.add("github-workflow");
  }
}

function classifyStripeCli(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first !== "stripe") return;
  actions.releaseProvider = true;
  actions.releaseModes.add("stripe");
  const [resource, subcommand] = [tokens[1] || "", tokens[2] || ""];
  const readOnly = resource === "events" && subcommand === "list";
  if (readOnly) {
    actions.releaseReadOnly = true;
  } else {
    actions.releaseMutating = true;
  }
}

function classifySentryCli(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first !== "sentry") return;
  actions.releaseProvider = true;
  actions.releaseModes.add("sentry");
  const topic = tokens[1] || "";
  if (["issues", "events", "projects"].includes(topic)) {
    actions.releaseReadOnly = true;
  } else {
    actions.releaseMutating = true;
  }
}

function classifyNpmExternalService(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first !== "npm" || tokens[1] !== "run") return;
  const scriptName = tokens[2] || "";
  if (!scriptName.startsWith("stripe:")) return;
  actions.releaseProvider = true;
  actions.releaseModes.add("stripe");
  if (["stripe:inspect", "stripe:audit", "stripe:check-live-readiness"].includes(scriptName)) {
    actions.releaseReadOnly = true;
  } else {
    actions.releaseMutating = true;
  }
}

function npxPackageCommand(tokens) {
  if (path.basename(tokens[0] || "") !== "npx") return "";
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index] || "";
    if (token === "--") {
      index += 1;
      break;
    }
    if (token === "-y" || token === "--yes" || token === "--no-install" || token === "--ignore-existing") {
      index += 1;
      continue;
    }
    if (token === "-p" || token === "--package" || token === "--call" || token === "-c") {
      index += 2;
      continue;
    }
    if (token.startsWith("--package=") || token.startsWith("--call=")) {
      index += 1;
      continue;
    }
    break;
  }
  return tokens[index] || "";
}

function releaseModeFor(tokens) {
  const first = path.basename(tokens[0] || "");
  const npxCommand = npxPackageCommand(tokens);
  if (first === "make") {
    const goals = parseMakeGoals(tokens);
    if (goals.some((goal) => /^(deploy-migrate|deploy-production)$/.test(goal))) return "production";
    if (goals.some((goal) => /^(deploy-stage-all)$/.test(goal))) return "stage-all";
    if (goals.some((goal) => /^(deploy-staging)$/.test(goal))) return "staging";
    if (goals.some((goal) => /^(deploy|release-pr)$/.test(goal))) return "release";
    if (goals.some((goal) => /^(rollback-prod)$/.test(goal))) return "rollback";
    if (goals.some((goal) => /^(ops-release-check)$/.test(goal))) return "check";
  }
  const releaseScriptToken = (first === "bash" || first === "zsh") && /^scripts\/release\//.test(tokens[1] || "")
    ? tokens[1]
    : /^scripts\/release\//.test(tokens[0] || "")
      ? tokens[0]
      : "";
  if (releaseScriptToken) {
    if (tokens.includes("--production")) return "production";
    if (tokens.includes("--staging-only")) return "staging";
    if (tokens.includes("--stage-all")) return "stage-all";
    return "release";
  }
  if (["vercel", "railway", "supabase", "gcloud", "wrangler", "stripe", "sentry"].includes(first)) return "provider";
  if (first === "npx" && ["vercel", "railway", "supabase", "wrangler"].includes(npxCommand)) return "provider";
  return "";
}

function releaseIntentFor(tokens) {
  const first = path.basename(tokens[0] || "");
  const npxCommand = npxPackageCommand(tokens);
  const hasFlag = (flag) => tokens.includes(flag);

  if (first === "make") {
    const goals = parseMakeGoals(tokens);
    if (goals.some((goal) => /^(deploy|deploy-stage-all|deploy-staging|deploy-production|deploy-migrate|rollback-prod|release-pr)$/.test(goal))) {
      return "mutating";
    }
    if (goals.some((goal) => /^(ops-release-check|ops-status|ops-auth-check|doctor-check)$/.test(goal))) {
      return "read-only";
    }
  }

  const scriptToken = tokens.find((token) => /^scripts\/release\//.test(normalizePathToken(token)));
  if (scriptToken) {
    const mutatingFlag = ["--apply", "--staging-only", "--stage-all", "--apply-secrets", "--confirm"].some(hasFlag);
    if (mutatingFlag) return "mutating";

    const readOnlyFlag = hasFlag("--check") || hasFlag("--preflight-only") || hasFlag("--dry-run");
    const mutatingScript =
      /(?:deploy|release|rollback|migrate|run-migrations)\.mjs$/.test(scriptToken) ||
      /(?:deploy|release|rollback|migrate|run-migrations)\.sh$/.test(scriptToken);

    if (
      mutatingScript &&
      !readOnlyFlag
    ) {
      return "mutating";
    }
    if (readOnlyFlag) return "read-only";
  }

  if (["vercel", "railway", "supabase", "gcloud", "wrangler"].includes(first)) {
    return "mutating";
  }
  if (first === "npx" && ["vercel", "railway", "supabase", "wrangler"].includes(npxCommand)) {
    return "mutating";
  }
  return "";
}

function normalizeFeatureName(value) {
  const feature = String(value || "").trim();
  if (!feature) return "";
  if (feature === "es") return "es-review";
  if (feature === "company-info-search-dev") return "company-info-search";
  return feature;
}

function featuresFromValue(value, fallback = []) {
  const features = parseCsv(value).map(normalizeFeatureName).filter(Boolean);
  return features.length > 0 ? features : fallback;
}

function featuresFromMakeTarget(target, assignments = {}) {
  if (target === "ai-live-local") return featuresFromValue(assignments.AI_LIVE_LOCAL_FEATURES, ["all"]);
  if (target === "test-e2e-functional" || target === "test-e2e-functional-local") {
    return featuresFromValue(assignments.AI_LIVE_LOCAL_FEATURES || assignments.AI_LIVE_FEATURE, ["all"]);
  }
  if (target.startsWith("test-e2e-functional-local-")) {
    return [normalizeFeatureName(target.replace(/^test-e2e-functional-local-/u, ""))].filter(Boolean);
  }
  if (target.startsWith("test-e2e-functional-")) {
    return [normalizeFeatureName(target.replace(/^test-e2e-functional-/u, ""))].filter(Boolean);
  }
  if (target === "test-quality-all") return featuresFromValue(assignments.AI_LIVE_FEATURE, ["all"]);
  return [];
}

function parseMakeInvocation(tokens, inheritedAssignments = {}) {
  const assignments = { ...inheritedAssignments };
  let target = "";
  const goals = [];
  for (const token of tokens.slice(1)) {
    const pair = assignmentPair(token);
    if (pair) {
      assignments[pair[0]] = pair[1];
      continue;
    }
    if (!token.startsWith("-")) {
      goals.push(token);
      if (!target) target = token;
    }
  }
  return { target, goals, assignments };
}

function parseMakeGoals(tokens) {
  return parseMakeInvocation(tokens).goals;
}

function featuresFromNpmScript(scriptName) {
  if (scriptName === "test:e2e:functional" || scriptName === "test:e2e:functional:local") {
    return ["all"];
  }
  if (scriptName.startsWith("test:e2e:functional:local:")) {
    return [normalizeFeatureName(scriptName.replace(/^test:e2e:functional:local:/u, ""))].filter(Boolean);
  }
  if (scriptName.startsWith("test:e2e:functional:")) {
    return [normalizeFeatureName(scriptName.replace(/^test:e2e:functional:/u, ""))].filter(Boolean);
  }
  return [];
}

function featuresFromFlag(tokens, flagName, fallback = []) {
  const index = tokens.indexOf(flagName);
  if (index !== -1) {
    return featuresFromValue(tokens[index + 1] || "", fallback);
  }
  const prefix = `${flagName}=`;
  const token = tokens.find((item) => item.startsWith(prefix));
  if (token) return featuresFromValue(token.slice(prefix.length), fallback);
  return fallback;
}

function flagValue(tokens, flagName, fallback = "") {
  const index = tokens.indexOf(flagName);
  if (index !== -1) return tokens[index + 1] || fallback;
  const prefix = `${flagName}=`;
  const token = tokens.find((item) => item.startsWith(prefix));
  return token ? token.slice(prefix.length) : fallback;
}

function addTestCategory(actions, category, features = []) {
  if (!category) return;
  actions.testCategories.add(category);
  if (!actions.testCategoryFeatures.has(category)) {
    actions.testCategoryFeatures.set(category, new Set());
  }
  const categoryFeatures = actions.testCategoryFeatures.get(category);
  for (const feature of features) {
    const normalized = normalizeFeatureName(feature);
    if (normalized) {
      actions.testFeatures.add(normalized);
      categoryFeatures.add(normalized);
    }
  }
}

function classifyTestCommand(tokens, assignments, actions) {
  const first = path.basename(tokens[0] || "");
  const second = tokens[1] || "";
  if (first === "make") {
    const makeInvocation = parseMakeInvocation(tokens, assignments);
    const makeTarget = makeInvocation.target || second;
    if (/^test-e2e-functional(?:-|$)/u.test(makeTarget) || makeTarget === "ai-live-local") {
      addTestCategory(actions, "e2e-functional", featuresFromMakeTarget(makeTarget, makeInvocation.assignments));
    }
    if (/^test-quality-/u.test(makeTarget)) {
      addTestCategory(actions, "quality", featuresFromMakeTarget(makeTarget, makeInvocation.assignments));
    }
    if (makeTarget === "security-scan") {
      addTestCategory(actions, "security", []);
    }
    return;
  }

  if (first === "npm" && second === "run") {
    const scriptName = tokens[2] || "";
    if (scriptName.startsWith("test:e2e:functional")) {
      addTestCategory(actions, "e2e-functional", featuresFromNpmScript(scriptName));
    }
    if (scriptName.startsWith("test-quality-") || scriptName.startsWith("test:quality:")) {
      const qualityFeatures = scriptName === "test:quality:all" || scriptName === "test-quality-all"
        ? ["all"]
        : [];
      addTestCategory(actions, "quality", qualityFeatures);
    }
    if (scriptName.startsWith("test:security:")) {
      addTestCategory(actions, "security", []);
    }
    if (scriptName === "test:static" || scriptName === "lint") {
      addTestCategory(actions, "static", []);
    }
    return;
  }

  if (first === "npx" && second === "tsc" && tokens.includes("--noEmit")) {
    addTestCategory(actions, "static", []);
    return;
  }

  const script = normalizePathToken(tokens[1] || tokens[0] || "");
  const scriptTokens = ["bash", "sh", "zsh"].includes(first) ? tokens.slice(1) : tokens;
  const scriptPath = normalizePathToken(scriptTokens[0] || script);
  if (scriptPath === "scripts/dev/run-ai-live-local.sh") {
    addTestCategory(actions, "e2e-functional", featuresFromValue(assignments.AI_LIVE_LOCAL_FEATURES, ["all"]));
    return;
  }
  if (scriptPath === "scripts/ci/run-e2e-functional.sh") {
    addTestCategory(actions, "e2e-functional", featuresFromFlag(scriptTokens, "--features", ["all"]));
    return;
  }
  if (scriptPath === "scripts/ci/run-ai-live.sh") {
    const category = assignments.AI_LIVE_TEST_CATEGORY === "quality" ? "quality" : "e2e-functional";
    addTestCategory(
      actions,
      category,
      featuresFromValue(assignments.AI_LIVE_FEATURE, featuresFromFlag(scriptTokens, "--feature", ["all"])),
    );
    return;
  }
  if (scriptPath === "scripts/security/run-lightweight-scan.sh") {
    addTestCategory(actions, "security", []);
  }
}

function classifyDelete(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first === "find" && tokens.includes("-delete")) {
    actions.destructiveDelete = true;
    actions.unsafeDelete = true;
    return;
  }
  if (first === "find") {
    const execIndex = tokens.indexOf("-exec");
    if (execIndex !== -1) {
      const execTokens = tokens.slice(execIndex + 1);
      const nestedActions = emptyActions();
      classifyDelete(execTokens, nestedActions);
      if (nestedActions.destructiveDelete) {
        actions.destructiveDelete = true;
        actions.unsafeDelete = true;
        actions.deleteTargets.push(...nestedActions.deleteTargets);
      }
    }
    return;
  }
  if (first !== "rm") return;

  const targets = [];
  let recursive = false;
  for (const token of tokens.slice(1)) {
    if (token === "--recursive" || token === "-R" || token === "-r" || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(token)) {
      recursive = true;
      continue;
    }
    if (token === "--force" || token === "-f" || /^-[A-Za-z]*f[A-Za-z]*$/.test(token)) {
      continue;
    }
    if (token.startsWith("-")) continue;
    targets.push(token);
  }
  if (!recursive) return;

  actions.destructiveDelete = true;
  actions.deleteTargets.push(...targets);
  actions.safeDelete = targets.length > 0 && targets.every((target) => {
    if (!target || target === "." || target === ".." || target.startsWith("/") || target.startsWith("~") || target.startsWith("../")) {
      return false;
    }
    return SAFE_DELETE_TARGETS.has(path.basename(target.replace(/\/+$/, "")));
  });
  actions.unsafeDelete = !actions.safeDelete;
}

function classifyMigration(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first === "make" && parseMakeGoals(tokens).some((goal) => /^deploy-migrate$/.test(goal))) {
    actions.migrationApply = true;
    return;
  }
  if (first === "npm" && tokens[1] === "run" && ["db:push", "db:migrate"].includes(tokens[2] || "")) {
    actions.migrationApply = true;
    return;
  }
  if (
    (first === "npx" || first === "pnpm" || first === "yarn" || first === "drizzle-kit" || first === "supabase") &&
    tokens.some((token) => /^(drizzle-kit|supabase)$/u.test(path.basename(token || ""))) &&
    tokens.some((token) => /^(push|migrate|migration)$/u.test(token))
  ) {
    actions.migrationApply = true;
    return;
  }
  if (
    (first === "node" || first === "npx" || first === "run-migrations.mjs") &&
    tokens.some((t) => t.includes("run-migrations.mjs")) &&
    ["staging", "production"].includes(flagValue(tokens, "--env", "local")) &&
    !tokens.includes("--dry-run")
  ) {
    actions.migrationApply = true;
  }
}

function classifyProductionPromotion(tokens, actions) {
  const first = path.basename(tokens[0] || "");
  if (first === "make" && parseMakeGoals(tokens).some((goal) => /^deploy-production$/.test(goal))) {
    actions.productionPromotion = true;
    return;
  }
  const shells = new Set(["zsh", "bash", "sh", "source", "."]);
  if (
    (shells.has(first) && tokens.some((t) => t.includes("deploy-production.sh"))) ||
    normalizePathToken(tokens[0] || "").includes("deploy-production.sh") ||
    (tokens.some((t) => t.includes("release-career-compass.sh")) && tokens.includes("--production"))
  ) {
    actions.productionPromotion = true;
  }
}

function classifySecretApply(tokens, assignments, actions) {
  const first = path.basename(tokens[0] || "");
  if (first === "vercel" && tokens[1] === "env" && ["add", "pull", "rm", "remove"].includes(tokens[2] || "") && tokens.some((token) => token.includes("production"))) {
    actions.secretApplyProduction = true;
  }
  if (first === "railway" && tokens.some((token) => token === "--set" || token.startsWith("--set=") || token.includes("variables"))) {
    actions.secretApplyProduction = true;
  }

  const makeInvocation = first === "make" ? parseMakeInvocation(tokens, assignments) : null;
  const effectiveAssignments = makeInvocation?.assignments ?? assignments;
  const makeTarget = first === "make" && makeInvocation?.goals?.includes("ops-secrets-sync");
  const hasApply = tokens.includes("--apply");
  const syncScript = tokens.some((t) => t.includes("sync-career-compass-secrets.sh"));

  const hasSyncModeApply =
    (effectiveAssignments.SYNC_MODE || "").replace(/^["']|["']$/g, "") === "--apply";

  if (!hasApply && !hasSyncModeApply) return;
  if (!syncScript && !makeTarget) return;

  const targetIdx = tokens.indexOf("--target");
  const target = targetIdx !== -1 ? tokens[targetIdx + 1] || "" : "";
  const envTarget = (effectiveAssignments.TARGET || "").replace(/^["']|["']$/g, "");
  const resolvedTarget = target || envTarget || "all";

  if (resolvedTarget.includes("production") || resolvedTarget === "all") {
    actions.secretApplyProduction = true;
  }
}

function classifyTokens(tokens, actions, depth = 0) {
  if (tokens.length === 0 || depth > 3) return;
  const { tokens: unwrapped, assignments } = unwrapCommandWithAssignments(tokens);
  if (classifyDotenvLoader(unwrapped, actions, depth)) {
    return;
  }
  const nested = nestedShellCommand(unwrapped);
  if (nested) {
    mergeActions(actions, classifyCommand(nested, depth + 1));
    return;
  }

  const first = path.basename(unwrapped[0] || "");
  const readCommands = new Set(["cat", "head", "tail", "less", "more", "bat", "sed", "awk", "grep", "rg", "source", ".", "open", "pbcopy", "base64", "xxd", "strings"]);
  const secretMovingCommands = new Set(["cp", "mv", "tar", "zip", "rsync", "scp", "curl"]);
  if ((readCommands.has(first) || secretMovingCommands.has(first)) && unwrapped.slice(1).some(isSensitivePath)) {
    actions.readsSensitivePath = true;
  }
  const commandText = unwrapped.join(" ");
  if (["python", "python3", "node", "ruby", "perl"].includes(first) && /(?:open|readFile|readFileSync)\s*\(/u.test(commandText) && /(?:^|[/"'])\.?(?:env(?:\.[A-Za-z0-9_-]+)?|\.secrets\/|codex-company\/\.secrets\/|[^ ]+\.(?:pem|key|p12))/u.test(commandText)) {
    actions.readsSensitivePath = true;
  }
  if (unwrapped.some(isSensitivePath) && ["source", "."].includes(first)) {
    actions.readsSensitivePath = true;
  }
  if (
    first === "node" &&
    unwrapped.some((token) => token.includes("scripts/harness/diff-snapshot.mjs")) &&
    unwrapped.includes("checkpoint")
  ) {
    const kind = flagValue(unwrapped, "--kind", "");
    if (["push", "release", "migration", "secret-apply", "production-promotion", "staging-verified"].includes(kind)) {
      actions.protectedCheckpoint = true;
    }
  }
  if (
    normalizePathToken(unwrapped[0] || "").endsWith("scripts/harness/diff-snapshot.mjs") &&
    unwrapped.includes("checkpoint")
  ) {
    const kind = flagValue(unwrapped, "--kind", "");
    if (["push", "release", "migration", "secret-apply", "production-promotion", "staging-verified"].includes(kind)) {
      actions.protectedCheckpoint = true;
    }
  }

  classifyGit(unwrapped, actions);
  classifyGithubCli(unwrapped, actions);
  classifyStripeCli(unwrapped, actions);
  classifySentryCli(unwrapped, actions);
  classifyNpmExternalService(unwrapped, actions);
  classifyTestCommand(unwrapped, assignments, actions);

  const releaseMode = releaseModeFor(unwrapped);
  if (releaseMode) {
    actions.releaseProvider = true;
    actions.releaseModes.add(releaseMode);
  }
  const releaseIntent = releaseIntentFor(unwrapped);
  if (releaseIntent === "read-only") {
    actions.releaseReadOnly = true;
  } else if (releaseIntent === "mutating") {
    actions.releaseMutating = true;
  }

  classifyDelete(unwrapped, actions);
  classifyMigration(unwrapped, actions);
  classifyProductionPromotion(unwrapped, actions);
  classifySecretApply(unwrapped, assignments, actions);
}

function emptyActions() {
  return {
    segments: [],
    readsSensitivePath: false,
    gitPush: false,
    gitPushRemote: "",
    gitPushRefspecs: [],
    gitPushAllowedTarget: false,
    forcePush: false,
    gitCommit: false,
    gitBranchCreate: false,
    releaseProvider: false,
    releaseReadOnly: false,
    releaseMutating: false,
    releaseModes: new Set(),
    testCategories: new Set(),
    testFeatures: new Set(),
    testCategoryFeatures: new Map(),
    destructiveDelete: false,
    unsafeDelete: false,
    safeDelete: false,
    deleteTargets: [],
    migrationApply: false,
    productionPromotion: false,
    secretApplyProduction: false,
    unsafeShellExpansion: false,
    unsafeShellReason: "",
    protectedCheckpoint: false,
  };
}

function mergeActions(target, source) {
  target.segments.push(...(source.segments || []));
  const hadGitPush = target.gitPush;
  for (const key of ["readsSensitivePath", "gitPush", "forcePush", "gitCommit", "gitBranchCreate", "releaseProvider", "releaseReadOnly", "releaseMutating", "destructiveDelete", "unsafeDelete", "safeDelete", "migrationApply", "productionPromotion", "secretApplyProduction", "unsafeShellExpansion", "protectedCheckpoint"]) {
    target[key] = target[key] || Boolean(source[key]);
  }
  if (source.gitPush) {
    target.gitPushAllowedTarget = hadGitPush
      ? target.gitPushAllowedTarget && Boolean(source.gitPushAllowedTarget)
      : Boolean(source.gitPushAllowedTarget);
  }
  if (!target.gitPushRemote && source.gitPushRemote) target.gitPushRemote = source.gitPushRemote;
  target.gitPushRefspecs.push(...(source.gitPushRefspecs || []));
  if (!target.unsafeShellReason && source.unsafeShellReason) target.unsafeShellReason = source.unsafeShellReason;
  for (const mode of source.releaseModes || []) target.releaseModes.add(mode);
  for (const category of source.testCategories || []) target.testCategories.add(category);
  for (const feature of source.testFeatures || []) target.testFeatures.add(feature);
  for (const [category, features] of source.testCategoryFeatures || []) {
    if (!target.testCategoryFeatures.has(category)) {
      target.testCategoryFeatures.set(category, new Set());
    }
    const targetFeatures = target.testCategoryFeatures.get(category);
    for (const feature of features) targetFeatures.add(feature);
  }
  target.deleteTargets.push(...(source.deleteTargets || []));
}

function classifyCommand(command, depth = 0) {
  const actions = emptyActions();
  for (const segment of splitSegments(command || "")) {
    actions.segments.push(segment);
    const unsafeExpansion = detectUnsafeShellExpansion(segment);
    if (unsafeExpansion.unsafe) {
      actions.unsafeShellExpansion = true;
      actions.unsafeShellReason ||= unsafeExpansion.reason;
    }
    classifyTokens(tokenize(segment), actions, depth);
  }
  return actions;
}

function serializable(actions) {
  const testCategoryFeatures = {};
  for (const [category, features] of actions.testCategoryFeatures) {
    testCategoryFeatures[category] = [...features].sort();
  }
  return {
    ...actions,
    releaseModes: [...actions.releaseModes].sort(),
    testCategories: [...actions.testCategories].sort(),
    testFeatures: [...actions.testFeatures].sort(),
    testCategoryFeatures,
  };
}

function normalizeChangeFile(file) {
  return normalizePathToken(String(file || "").trim()).replace(/^\/+/, "");
}

function pathMatches(file, target) {
  return file === target || file.endsWith(`/${target}`);
}

function isInfraPath(file) {
  return INFRA_PATH_PREFIXES.some((prefix) => file.startsWith(prefix) || file.includes(`/${prefix}`));
}

function isFastPathFile(file) {
  if (!file || isInfraPath(file)) return false;
  return FAST_PATH_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function classifyChangePath(files, { totalLines = 0 } = {}) {
  const normalizedFiles = files.map(normalizeChangeFile).filter(Boolean);
  const hasInfraPath = normalizedFiles.some(isInfraPath);
  const hasHotspot = normalizedFiles.some((file) => [...HOTSPOT_FILES].some((hotspot) => pathMatches(file, hotspot)));
  const fileCount = normalizedFiles.length;
  const lineCount = Number.isFinite(Number(totalLines)) ? Number(totalLines) : 0;

  if (fileCount === 0) {
    return {
      changePath: "STANDARD_PATH",
      reason: "no_files",
      fileCount,
      totalLines: lineCount,
      files: normalizedFiles,
    };
  }

  if (hasInfraPath) {
    return {
      changePath: "INFRA_PATH",
      reason: "infra_path",
      fileCount,
      totalLines: lineCount,
      files: normalizedFiles,
    };
  }

  if (hasHotspot) {
    return {
      changePath: "EXTENDED_PATH",
      reason: "hotspot",
      fileCount,
      totalLines: lineCount,
      files: normalizedFiles,
    };
  }

  if (normalizedFiles.every(isFastPathFile)) {
    return {
      changePath: "FAST_PATH",
      reason: "docs_or_static_metadata",
      fileCount,
      totalLines: lineCount,
      files: normalizedFiles,
    };
  }

  if (fileCount >= 10 || lineCount >= 500) {
    return {
      changePath: "EXTENDED_PATH",
      reason: fileCount >= 10 ? "file_count" : "line_count",
      fileCount,
      totalLines: lineCount,
      files: normalizedFiles,
    };
  }

  return {
    changePath: "STANDARD_PATH",
    reason: "default",
    fileCount,
    totalLines: lineCount,
    files: normalizedFiles,
  };
}

function cliArgValue(args, name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

const command = process.argv[2] || "";
const predicate = process.argv[3] || "";

if (command === "classify-change-path") {
  const args = process.argv.slice(3);
  const totalLines = Number(cliArgValue(args, "--lines", "0"));
  const files = args.filter((arg, index) => {
    if (arg === "--lines") return false;
    if (args[index - 1] === "--lines") return false;
    return !arg.startsWith("--");
  });
  process.stdout.write(`${JSON.stringify(classifyChangePath(files, { totalLines }), null, 2)}\n`);
  process.exit(0);
}

if (command === "taxonomy") {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        actions: CODEX_AUTONOMY_ACTIONS,
        releaseModes: CODEX_AUTONOMY_RELEASE_MODES,
        hardStop: CODEX_HARDSTOP_PREDICATES,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const actions = classifyCommand(command);

if (predicate) {
  const value = predicate === "allDeletesSafe"
    ? actions.destructiveDelete && !actions.unsafeDelete
    : predicate === "testCategoryCommand"
      ? actions.testCategories.size > 0
    : Boolean(actions[predicate]);
  process.exit(value ? 0 : 1);
}

process.stdout.write(`${JSON.stringify(serializable(actions), null, 2)}\n`);
