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
  return (
    value.includes("codex-company/.secrets/") ||
    value.includes("/.secrets/") ||
    value.startsWith(".secrets/") ||
    value.includes("/secrets/") ||
    value.startsWith("secrets/") ||
    base === ".env" ||
    base.startsWith(".env.") ||
    /\.(pem|key|p12)$/i.test(base)
  );
}

function unwrapCommand(tokens) {
  let result = [...tokens];
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
        result = result.slice(1);
      }
      changed = true;
      continue;
    }
  }
  return result;
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

function classifyGit(tokens, actions) {
  if (path.basename(tokens[0] || "") !== "git") return;
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
    actions.gitPush = true;
    if (rest.some((token) => token === "--force" || token === "--force-with-lease" || token === "-f" || /^-[A-Za-z]*f[A-Za-z]*$/.test(token))) {
      actions.forcePush = true;
    }
  }
  if (subcommand === "commit") {
    actions.gitCommit = true;
  }
  if (subcommand === "clean" && rest.some((token) => token.includes("x"))) {
    actions.destructiveDelete = true;
    actions.unsafeDelete = true;
  }
}

function releaseModeFor(tokens) {
  const first = path.basename(tokens[0] || "");
  const second = tokens[1] || "";
  if (first === "make") {
    if (/^(ops-release-check)$/.test(second)) return "check";
    if (/^(deploy-stage-all|deploy-migrate)$/.test(second)) return "stage-all";
    if (/^(deploy|release-pr)$/.test(second)) return "release";
    if (/^(rollback-prod)$/.test(second)) return "rollback";
  }
  if ((first === "bash" || first === "zsh") && /^scripts\/release\//.test(second)) return "release-script";
  if (/^scripts\/release\//.test(tokens[0] || "")) return "release-script";
  if (["vercel", "railway", "supabase", "gcloud", "wrangler"].includes(first)) return "provider";
  if (first === "npx" && ["vercel", "railway", "supabase", "wrangler"].includes(tokens[1] || "")) return "provider";
  return "";
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

function classifyTokens(tokens, actions, depth = 0) {
  if (tokens.length === 0 || depth > 3) return;
  const unwrapped = unwrapCommand(tokens);
  const nested = nestedShellCommand(unwrapped);
  if (nested) {
    mergeActions(actions, classifyCommand(nested, depth + 1));
    return;
  }

  const first = path.basename(unwrapped[0] || "");
  const readCommands = new Set(["cat", "head", "tail", "less", "more", "bat", "sed", "awk", "grep", "rg", "source", "."]);
  if (readCommands.has(first) && unwrapped.slice(1).some(isSensitivePath)) {
    actions.readsSensitivePath = true;
  }
  if (unwrapped.some(isSensitivePath) && ["source", "."].includes(first)) {
    actions.readsSensitivePath = true;
  }

  classifyGit(unwrapped, actions);

  const releaseMode = releaseModeFor(unwrapped);
  if (releaseMode) {
    actions.releaseProvider = true;
    actions.releaseModes.add(releaseMode);
  }

  classifyDelete(unwrapped, actions);
}

function emptyActions() {
  return {
    segments: [],
    readsSensitivePath: false,
    gitPush: false,
    forcePush: false,
    gitCommit: false,
    releaseProvider: false,
    releaseModes: new Set(),
    destructiveDelete: false,
    unsafeDelete: false,
    safeDelete: false,
    deleteTargets: [],
  };
}

function mergeActions(target, source) {
  target.segments.push(...(source.segments || []));
  for (const key of ["readsSensitivePath", "gitPush", "forcePush", "gitCommit", "releaseProvider", "destructiveDelete", "unsafeDelete", "safeDelete"]) {
    target[key] = target[key] || Boolean(source[key]);
  }
  for (const mode of source.releaseModes || []) target.releaseModes.add(mode);
  target.deleteTargets.push(...(source.deleteTargets || []));
}

function classifyCommand(command, depth = 0) {
  const actions = emptyActions();
  for (const segment of splitSegments(command || "")) {
    actions.segments.push(segment);
    classifyTokens(tokenize(segment), actions, depth);
  }
  return actions;
}

function serializable(actions) {
  return {
    ...actions,
    releaseModes: [...actions.releaseModes].sort(),
  };
}

const command = process.argv[2] || "";
const predicate = process.argv[3] || "";
const actions = classifyCommand(command);

if (predicate) {
  const value = predicate === "allDeletesSafe"
    ? actions.destructiveDelete && !actions.unsafeDelete
    : Boolean(actions[predicate]);
  process.exit(value ? 0 : 1);
}

process.stdout.write(`${JSON.stringify(serializable(actions), null, 2)}\n`);
