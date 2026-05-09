#!/usr/bin/env node
/**
 * api-design-check.mjs
 * Checks API route files for design pattern compliance.
 * Items: API-01, API-02, API-03
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
    const content = getStagedContent(file);
    if (!content) continue;

    // API-01: raw error responses instead of createApiErrorResponse
    const hasRawErrorResponse = /NextResponse\.json\s*\([^)]*(?:error|message)\s*:/s.test(content);
    const hasCreateApiError = /createApiErrorResponse/.test(content);

    if (hasRawErrorResponse && !hasCreateApiError) {
      findings.push({
        item_id: "API-01",
        severity: "high",
        file,
        message: "createApiErrorResponse を使用してください (raw NextResponse.json でエラーを返しています)",
      });
    }

    // API-02: 200 status with error-like response body
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      // Detect NextResponse.json({ error: ... }) without explicit status (defaults to 200)
      if (/NextResponse\.json\s*\(\s*\{[^}]*error\s*:/.test(line) && !/status\s*:/.test(line)) {
        findings.push({
          item_id: "API-02",
          severity: "medium",
          file,
          line: idx + 1,
          message: "エラーレスポンスに status コードが指定されていません (200 がデフォルトになります)",
        });
      }
    });

    // API-03: missing X-Request-Id in error handling
    const hasCatchBlock = /catch\s*\(/.test(content);
    const hasRequestId = /X-Request-Id|requestId|x-request-id/.test(content);
    if (hasCatchBlock && !hasRequestId && !hasCreateApiError) {
      findings.push({
        item_id: "API-03",
        severity: "low",
        file,
        message: "エラーハンドリングに X-Request-Id が含まれていません",
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
