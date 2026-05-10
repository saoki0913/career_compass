#!/usr/bin/env node
/**
 * double-execution-check.mjs
 * Checks for missing double-execution prevention.
 * Items: DEDUP-01, DEDUP-02
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "../..");

function getStagedFiles(pattern) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "diff", "--cached", "--name-only"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(f => f.trim() && (pattern ? pattern.test(f) : true));
}

function getStagedContent(file) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "show", `:0:${file}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

function print(findings) {
  process.stdout.write(JSON.stringify({ findings, count: findings.length }, null, 2) + "\n");
}

function run() {
  const findings = [];

  // --- DEDUP-01: API POST routes without idempotency ---
  const apiRoutePattern = /^src\/app\/api\/.+\/route\.ts$/;
  const apiFiles = getStagedFiles(apiRoutePattern);

  for (const file of apiFiles) {
    const content = getStagedContent(file);
    if (!content) continue;

    const hasPost = /export\s+(?:async\s+)?function\s+POST\b/.test(content);
    if (!hasPost) continue;

    const hasIdempotency = /(?:idempotency|idempotent|Idempotency-Key|x-idempotency|dedup|deduplicate)/i.test(content);
    if (!hasIdempotency) {
      findings.push({
        item_id: "DEDUP-01",
        severity: "high",
        file,
        message: "POST ハンドラーに冪等性キー / 重複実行防止ロジックがありません",
      });
    }
  }

  // --- DEDUP-02: React components with async onClick but no disabled state ---
  const componentPattern = /^src\/components\/.+\.tsx$/;
  const componentFiles = getStagedFiles(componentPattern);

  for (const file of componentFiles) {
    const content = getStagedContent(file);
    if (!content) continue;

    const hasAsyncClick = /onClick\s*=\s*\{[^}]*async/.test(content);
    if (!hasAsyncClick) continue;

    const hasDisabledState = /(?:disabled\s*=|isSubmitting|isLoading|isPending|loading\s*&&|formState\.isSubmitting)/.test(content);
    if (!hasDisabledState) {
      findings.push({
        item_id: "DEDUP-02",
        severity: "medium",
        file,
        message: "async onClick がありますが disabled / isSubmitting / isLoading による二重実行防止がありません",
      });
    }
  }

  // --- DEDUP-01 for Python routers ---
  const pythonRouterPattern = /^backend\/app\/routers\/.+\.py$/;
  const pythonFiles = getStagedFiles(pythonRouterPattern);

  for (const file of pythonFiles) {
    const content = getStagedContent(file);
    if (!content) continue;

    const hasPostRoute = /@(?:router|app)\.post\s*\(/.test(content);
    if (!hasPostRoute) continue;

    const hasIdempotency = /(?:idempotency|idempotent|dedup|deduplicate)/i.test(content);
    if (!hasIdempotency) {
      findings.push({
        item_id: "DEDUP-01",
        severity: "high",
        file,
        message: "Python POST ルートに冪等性 / 重複実行防止ロジックがありません",
      });
    }
  }

  print(findings);
}

try {
  run();
} catch {
  print([]);
}
