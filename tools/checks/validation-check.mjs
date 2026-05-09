#!/usr/bin/env node
/**
 * validation-check.mjs
 * Checks API routes for missing server-side input validation.
 * Items: VAL-01, VAL-02
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
  const apiRoutePattern = /^src\/app\/api\/.+\/route\.ts$/;
  const files = getStagedFiles(apiRoutePattern);

  for (const file of files) {
    // Skip auth/webhooks/health/cron routes
    const isSkippedRoute = /\/api\/(?:auth|webhooks|health|cron)\//i.test(file);
    if (isSkippedRoute) continue;

    const content = getStagedContent(file);
    if (!content) continue;

    const hasExport = /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH)\b/.test(content);
    if (!hasExport) continue;

    const hasBodyAccess = /(?:request\.json\(\)|req\.body|request\.body)/.test(content);
    const hasValidation = /(?:\.parse\(|\.safeParse\(|z\.object|z\.string|z\.number|yup\.|joi\.|zod\.|\.validate\()/.test(content);
    const hasManualValidation = /(?:typeof\s+\w+\s*[!=]==?\s*['"]|!body\.|if\s*\(!.*body)/.test(content);

    const isValidated = hasValidation || hasManualValidation;

    // VAL-01: POST/PUT/PATCH handler without any validation
    if (!isValidated) {
      findings.push({
        item_id: "VAL-01",
        severity: "high",
        file,
        message: "POST/PUT/PATCH ハンドラーにバリデーション (zod/yup/joi/safeParse) がありません",
      });
    }

    // VAL-02: request body accessed without subsequent validation
    if (hasBodyAccess && !isValidated) {
      findings.push({
        item_id: "VAL-02",
        severity: "high",
        file,
        message: "request.json() でリクエストボディにアクセスしていますが、バリデーションがありません",
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
