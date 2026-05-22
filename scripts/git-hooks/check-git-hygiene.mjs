#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const MAX_UNALLOWLISTED_IMAGE_BYTES = 500 * 1024;

const FORBIDDEN_PREFIXES = [
  ".ui-preflight/",
  "output/",
  "backend/.ai/",
  "product/.ai/",
  "public/dashboard/",
  "public/screenshots/generated/",
  "public/marketing/LP/LP_sub/",
  "public/marketing/LP/assets/_archive/",
  "public/marketing/LP/section_image/asset/",
  "public/marketing/PR/",
  "public/marketing/design_system/",
  "scripts/marketing_video/.venv/",
  "scripts/marketing_video/output/",
];

const FORBIDDEN_EXACT = new Set(["docs/operations/development/agent-usage.log"]);

const ALLOWED_IMAGE_PREFIXES = [
  "public/marketing/LP/assets/",
  "public/marketing/LP/sections/",
  "public/marketing/LP/seo-lp-hero/",
  "public/marketing/LP/screenshots/",
];

const ALLOWED_IMAGE_EXACT = new Set([
  "public/apple-icon.png",
  "public/favicon-48x48.png",
  "public/favicon-96x96.png",
  "public/icon.png",
  "public/marketing/LP/LP.png",
]);

const FORBIDDEN_PREFIX_OVERRIDES = new Set([
  "public/dashboard/assets/empty-state-hourglass.png",
  "public/dashboard/assets/empty-state-clipboard.png",
  "public/dashboard/assets/empty-state-folder.png",
  "public/dashboard/assets/empty-state-envelope.png",
  "public/dashboard/assets/empty-state-document.png",
  "public/dashboard/assets/empty-state-conversation.png",
  "public/dashboard/assets/empty-state-waiting.png",
  "public/dashboard/assets/empty-state-trophy.png",
]);

function normalizeRepoPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/^\.\/+/u, "").trim();
}

function runGit(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout;
}

function stagedFiles(cwd = process.cwd()) {
  return runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], cwd)
    .split(/\r?\n/u)
    .map(normalizeRepoPath)
    .filter(Boolean);
}

function trackedFiles(cwd = process.cwd()) {
  return runGit(["ls-files"], cwd)
    .split(/\r?\n/u)
    .map(normalizeRepoPath)
    .filter(Boolean);
}

function isDirectChildOf(prefix, filePath) {
  if (!filePath.startsWith(prefix)) {
    return false;
  }
  return !filePath.slice(prefix.length).includes("/");
}

function isAllowedImagePath(filePath) {
  return (
    ALLOWED_IMAGE_EXACT.has(filePath) ||
    ALLOWED_IMAGE_PREFIXES.some((prefix) => filePath.startsWith(prefix)) ||
    isDirectChildOf("public/marketing/LP/section_image/", filePath)
  );
}

function isEnvOrSecretPath(filePath) {
  const base = path.posix.basename(filePath);
  if (base.endsWith(".example")) return false;
  if (filePath.includes("/secrets-examples/")) return false;
  return (
    base === ".env" ||
    base.startsWith(".env.") ||
    filePath.includes("/.secrets/") ||
    filePath.startsWith(".secrets/") ||
    filePath.includes("/secrets/") ||
    filePath.startsWith("secrets/") ||
    /\.(?:key|p12|pem)$/iu.test(base)
  );
}

function isBrowserAuthStatePath(filePath) {
  const normalized = filePath.toLowerCase();
  const base = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized);
  if ([".cjs", ".js", ".jsx", ".mjs", ".sh", ".ts", ".tsx"].includes(extension)) {
    return false;
  }
  return (
    base.includes("playwright-auth-state") ||
    base.includes("storage-state") ||
    base.includes("storagestate") ||
    normalized.includes("/.auth/") ||
    normalized.endsWith("/cookies.json") ||
    normalized.endsWith("cookies.json")
  );
}

function isPublicArchiveOrReference(filePath) {
  return (
    filePath.startsWith("public/") &&
    (filePath.includes("/_archive/") ||
      filePath.includes("/reference/") ||
      filePath.includes("/metadata/ai/verification/"))
  );
}

function statSize(cwd, filePath) {
  try {
    return statSync(path.join(cwd, filePath)).size;
  } catch {
    return 0;
  }
}

function indexSize(cwd, filePath) {
  const output = runGit(["cat-file", "-s", `:${filePath}`], cwd).trim();
  const size = Number.parseInt(output, 10);
  return Number.isFinite(size) ? size : 0;
}

function fileSize(cwd, filePath, source) {
  return source === "index" ? indexSize(cwd, filePath) : statSize(cwd, filePath);
}

function indexText(cwd, filePath) {
  return runGit(["show", `:${filePath}`], cwd);
}

async function readTextIfSmall(cwd, filePath, source) {
  if (fileSize(cwd, filePath, source) > 1024 * 1024) {
    return "";
  }
  if (source === "index") {
    return indexText(cwd, filePath);
  }
  const fullPath = path.join(cwd, filePath);
  if (!existsSync(fullPath)) {
    return "";
  }
  try {
    return await readFile(fullPath, "utf8");
  } catch {
    return "";
  }
}

export async function evaluateFiles(files, { cwd = process.cwd(), source = "worktree" } = {}) {
  const findings = [];
  for (const rawFile of files) {
    const file = normalizeRepoPath(rawFile);
    if (!file) {
      continue;
    }

    if (FORBIDDEN_EXACT.has(file)) {
      findings.push({ file, reason: "runtime log/state file must not be tracked" });
      continue;
    }
    const forbiddenPrefix = FORBIDDEN_PREFIXES.find((prefix) => file.startsWith(prefix));
    if (forbiddenPrefix && !FORBIDDEN_PREFIX_OVERRIDES.has(file)) {
      findings.push({ file, reason: `generated/local artifact path is forbidden (${forbiddenPrefix})` });
      continue;
    }
    if (file.endsWith(".DS_Store")) {
      findings.push({ file, reason: "macOS metadata file must not be tracked" });
      continue;
    }
    if (isEnvOrSecretPath(file)) {
      findings.push({ file, reason: "secret/env material must not be tracked" });
      continue;
    }
    if (isBrowserAuthStatePath(file)) {
      findings.push({ file, reason: "browser auth/storage state must not be tracked" });
      continue;
    }
    if (isPublicArchiveOrReference(file)) {
      findings.push({ file, reason: "public archive/reference material must not be tracked" });
      continue;
    }

    const extension = path.posix.extname(file).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension) && !isAllowedImagePath(file)) {
      const size = fileSize(cwd, file, source);
      if (size > MAX_UNALLOWLISTED_IMAGE_BYTES) {
        findings.push({
          file,
          reason: `large image outside the public asset allowlist (${Math.round(size / 1024)} KiB)`,
        });
        continue;
      }
    }

    if (extension === ".json") {
      const text = await readTextIfSmall(cwd, file, source);
      if (/"sessionId"\s*:|"_sessionId"\s*:|"storageState"\s*:|"cookies"\s*:/u.test(text)) {
        findings.push({ file, reason: "generated session/auth state must not be tracked" });
      }
    }
  }
  return findings;
}

async function main() {
  const source = process.argv.includes("--staged") || process.argv.includes("--tracked") ? "index" : "worktree";
  const files = process.argv.includes("--staged")
    ? stagedFiles()
    : process.argv.includes("--tracked")
      ? trackedFiles()
      : process.argv.slice(2);
  const findings = await evaluateFiles(files, { source });

  if (findings.length === 0) {
    process.stdout.write("[git-hygiene] no issues found\n");
    return;
  }

  process.stderr.write("[git-hygiene] refusing to commit files that should not be Git-managed:\n");
  for (const finding of findings) {
    process.stderr.write(`  - ${finding.file}: ${finding.reason}\n`);
  }
  process.stderr.write("[git-hygiene] move generated/private files to an ignored workspace or promote only curated assets.\n");
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
