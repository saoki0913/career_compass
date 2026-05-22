#!/usr/bin/env node
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const CORE_ENV_KEYS = [
  "CI",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "PWD",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
];

const PROFILE_KEYS = {
  "sentry-read": ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_BASE_URL"],
  "stripe-read": [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_STANDARD_MONTHLY",
    "STRIPE_PRICE_STANDARD_ANNUAL",
    "STRIPE_PRICE_PRO_MONTHLY",
    "STRIPE_PRICE_PRO_ANNUAL",
    "STRIPE_PORTAL_CONFIGURATION_ID",
  ],
  "github-read": ["GH_TOKEN", "GITHUB_TOKEN"],
  "vercel-read": ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
  "railway-read": ["RAILWAY_TOKEN", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID"],
  "supabase-read": ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD"],
  "gcloud-read": ["GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_CONFIG", "GOOGLE_CLOUD_PROJECT"],
};

const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9_-]{12,}/g,
  /sk_test_[A-Za-z0-9_-]{12,}/g,
  /whsec_[A-Za-z0-9_-]{12,}/g,
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /sntrys_[A-Za-z0-9_-]{20,}/g,
  /gh[opsu]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sbp_[0-9a-f]{20,}/g,
  /postgres(?:ql)?:\/\/[^"'\s<>]+@[^"'\s<>]+/g,
  /Bearer\s+[A-Za-z0-9._-]{12,}/g,
];

const CLI_SAFE_EXECUTABLES = new Set(["gh", "gcloud", "railway", "sentry", "stripe", "supabase", "vercel"]);
const DIRECT_NODE_SCRIPTS = new Set([
  "scripts/stripe/audit.mjs",
  "scripts/stripe/check-live-readiness.mjs",
  "scripts/stripe/inspect.mjs",
]);

function usage() {
  return [
    "Usage: node scripts/harness/run-with-local-service-env.mjs --profile <profile> -- <command> [args...]",
    "",
    `Profiles: ${Object.keys(PROFILE_KEYS).sort().join(", ")}`,
  ].join("\n");
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator === -1) {
    throw new Error("Missing -- command separator.");
  }
  const options = argv.slice(0, separator);
  const command = argv.slice(separator + 1);
  let profile = "";

  for (let index = 0; index < options.length; index += 1) {
    const token = options[index];
    if (token === "--profile") {
      profile = options[index + 1] || "";
      index += 1;
      continue;
    }
    if (token.startsWith("--profile=")) {
      profile = token.slice("--profile=".length);
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  if (!profile || !(profile in PROFILE_KEYS)) {
    throw new Error(`Unknown or missing profile: ${profile || "(none)"}`);
  }
  if (command.length === 0) {
    throw new Error("Missing command.");
  }
  return { profile, command };
}

function isForbiddenExecutable(command) {
  const first = path.basename(command[0] || "");
  return new Set([
    ".",
    "bash",
    "cat",
    "env",
    "grep",
    "head",
    "less",
    "more",
    "pbcopy",
    "printenv",
    "rg",
    "sed",
    "set",
    "sh",
    "source",
    "tail",
    "zsh",
  ]).has(first);
}

function hasDangerousFlag(command) {
  return command.some((token) => ["-c", "-lc", "-ilc", "--eval", "-e", "--print", "-p", "--debug"].includes(token));
}

function hasPathSeparator(token) {
  return token.includes("/") || token.includes("\\");
}

function normalizedRelativePath(repoRoot, token) {
  if (!token) return "";
  const absolute = path.resolve(repoRoot, token);
  const relative = path.relative(repoRoot, absolute).replaceAll(path.sep, "/");
  return relative.startsWith("../") || path.isAbsolute(relative) ? "" : relative;
}

function trustedSentryApiPaths() {
  const home = process.env.HOME || "";
  return [
    home ? path.join(home, ".codex/plugins/cache/openai-curated/sentry/dc902811/skills/sentry/scripts/sentry_api.py") : "",
  ].filter(Boolean).map((entry) => path.resolve(entry));
}

function isTrustedSentryApi(token) {
  const resolved = path.resolve(token || "");
  return trustedSentryApiPaths().includes(resolved);
}

function isTrustedDirectNodeScript(repoRoot, token) {
  return DIRECT_NODE_SCRIPTS.has(normalizedRelativePath(repoRoot, token));
}

function isAllowedSentry(command) {
  const first = path.basename(command[0] || "");
  if (first === "python3" && command.some(isTrustedSentryApi)) {
    return true;
  }
  if (first === "sentry") {
    const [topic, action] = [command[1] || "", command[2] || ""];
    return (
      (topic === "issues" && ["list", "view"].includes(action)) ||
      (topic === "events" && ["list"].includes(action)) ||
      (topic === "projects" && ["list"].includes(action))
    );
  }
  return false;
}

function isAllowedStripe(command, repoRoot) {
  const first = path.basename(command[0] || "");
  if (first === "node" && isTrustedDirectNodeScript(repoRoot, command[1] || "")) {
    return true;
  }
  return first === "stripe" && command[1] === "events" && command[2] === "list";
}

function isAllowedGithub(command) {
  const first = path.basename(command[0] || "");
  if (first !== "gh") return false;
  const unsafeFlags = new Set(["--show-token", "-f", "--field", "-F", "--raw-field", "--input", "--method", "-X"]);
  if (command.some((token) => unsafeFlags.has(token) || token.startsWith("--field=") || token.startsWith("--raw-field=") || token.startsWith("--input=") || token.startsWith("--method=") || token.startsWith("-X"))) {
    return false;
  }
  const [topic, action] = [command[1] || "", command[2] || ""];
  if (topic === "auth" && action === "status") return true;
  if (topic === "repo" && action === "view") return true;
  if (topic === "pr" && ["view", "checks", "list"].includes(action)) return true;
  if (topic === "run" && ["list", "view"].includes(action)) return true;
  return false;
}

function isAllowedVercel(command) {
  const first = path.basename(command[0] || "");
  if (first !== "vercel") return false;
  const [topic, action] = [command[1] || "", command[2] || ""];
  if (["whoami", "ls", "inspect", "logs"].includes(topic)) return true;
  if (topic === "domains" && action === "ls") return true;
  if (topic === "env" && action === "ls") return true;
  if (topic === "projects" && action === "ls") return true;
  return false;
}

function isAllowedRailway(command) {
  const first = path.basename(command[0] || "");
  if (first !== "railway") return false;
  return ["whoami", "status", "logs", "service"].includes(command[1] || "");
}

function isAllowedSupabase(command) {
  const first = path.basename(command[0] || "");
  if (first !== "supabase") return false;
  const [topic, action] = [command[1] || "", command[2] || ""];
  if (topic === "projects" && action === "list") return true;
  if (topic === "status") return true;
  if (topic === "migration" && action === "list") return true;
  return false;
}

function isAllowedGcloud(command) {
  const first = path.basename(command[0] || "");
  if (first !== "gcloud") return false;
  const [topic, action] = [command[1] || "", command[2] || ""];
  if (topic === "auth" && action === "list") return true;
  if (topic === "config" && action === "list") return true;
  if (topic === "projects" && action === "list") return true;
  if (topic === "services" && action === "list") return true;
  return false;
}

function isAllowedCommand(profile, command, repoRoot) {
  if (hasPathSeparator(command[0] || "")) return false;
  if (hasDangerousFlag(command)) return false;
  if (isForbiddenExecutable(command) && profile !== "sentry-read") return false;
  if (profile === "sentry-read") return isAllowedSentry(command);
  if (profile === "stripe-read") return isAllowedStripe(command, repoRoot);
  if (profile === "github-read") return isAllowedGithub(command);
  if (profile === "vercel-read") return isAllowedVercel(command);
  if (profile === "railway-read") return isAllowedRailway(command);
  if (profile === "supabase-read") return isAllowedSupabase(command);
  if (profile === "gcloud-read") return isAllowedGcloud(command);
  return false;
}

function canExecute(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveExecutable(executable, pathValue) {
  if (!executable || hasPathSeparator(executable)) return "";
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, executable);
    if (canExecute(candidate)) return path.resolve(candidate);
  }
  return "";
}

function resolveCommand({ repoRoot, profile, command, childEnv }) {
  const first = path.basename(command[0] || "");
  const resolved = resolveExecutable(first, childEnv.PATH || process.env.PATH || "");
  if (!resolved) {
    throw new Error(`Executable not found for profile ${profile}: ${first}`);
  }

  if (CLI_SAFE_EXECUTABLES.has(first)) {
    const expected = path.resolve(repoRoot, "tools/cli-safe/bin", first);
    if (resolved !== expected) {
      throw new Error(`Command must use tools/cli-safe/bin/${first} for profile ${profile}.`);
    }
  }

  return [resolved, command.slice(1)];
}

function buildChildEnv({ repoRoot, profile }) {
  const env = {};
  for (const key of CORE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.PATH = `${path.join(repoRoot, "tools/cli-safe/bin")}:${process.env.PATH || ""}`;
  env.PWD = repoRoot;

  for (const key of PROFILE_KEYS[profile]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function secretValues(env, profile) {
  return PROFILE_KEYS[profile]
    .map((key) => env[key])
    .filter((value) => typeof value === "string" && value.length >= 8)
    .sort((a, b) => b.length - a.length);
}

function redact(text, values) {
  let next = text;
  for (const value of values) {
    next = next.split(value).join("[REDACTED]");
  }
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, "[REDACTED]");
  }
  return next;
}

async function run() {
  const { profile, command } = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  if (!isAllowedCommand(profile, command, repoRoot)) {
    throw new Error(`Command is not allowed for profile ${profile}.`);
  }

  const childEnv = buildChildEnv({ repoRoot, profile });
  const [executable, args] = resolveCommand({ repoRoot, profile, command, childEnv });
  const valuesToRedact = secretValues(childEnv, profile);
  const child = spawn(executable, args, {
    cwd: repoRoot,
    env: childEnv,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise((resolve) => {
    child.on("error", (error) => {
      stderr += `${error.message}\n`;
      resolve(1);
    });
    child.on("close", resolve);
  });

  if (stdout) process.stdout.write(redact(stdout, valuesToRedact));
  if (stderr) process.stderr.write(redact(stderr, valuesToRedact));
  process.exitCode = exitCode ?? 1;
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write(usage() + "\n");
  process.exitCode = 1;
});
