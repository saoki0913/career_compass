#!/usr/bin/env node
/**
 * cors-check.mjs
 * Checks for overly permissive CORS settings.
 * Items: SEC-10
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
  const targetPattern = /(?:^src\/app\/api\/.+\/route\.ts$|^backend\/app\/.+\.py$|(?:cors|config)\.\w+$)/;
  const files = getStagedFiles(targetPattern);

  for (const file of files) {
    const content = getStagedContent(file);
    if (!content) continue;

    const wildcardCors = /(?:Access-Control-Allow-Origin['":\s]*\*|allow_origins\s*=\s*\[\s*['"]?\*['"]?\s*\]|cors\(\s*\{[^}]*origin\s*:\s*['"]?\*['"]?)/;
    const credentialsWithWildcard = /(?:credentials\s*:\s*true|allow_credentials\s*=\s*True)/;

    const hasWildcard = wildcardCors.test(content);
    const hasCredentials = credentialsWithWildcard.test(content);

    // Critical: credentials with wildcard origin
    if (hasWildcard && hasCredentials) {
      findings.push({
        item_id: "SEC-10",
        severity: "critical",
        file,
        message: "CORS wildcard origin (*) と credentials: true が同時に設定されています。資格情報の漏洩リスクがあります",
      });
    } else if (hasWildcard) {
      // High: wildcard origin without explicit whitelist
      findings.push({
        item_id: "SEC-10",
        severity: "high",
        file,
        message: "CORS に wildcard origin (*) が設定されています。明示的なオリジンホワイトリストを使用してください",
      });
    }

    // Check for CORS headers set without explicit origin whitelist
    const hasCorsHeader = /(?:Access-Control-Allow-Origin|cors\(|CORSMiddleware|add_middleware\s*\(\s*CORSMiddleware)/.test(content);
    const hasExplicitOrigins = /(?:allow_origins\s*=\s*\[[^\]]*(?:https?:|localhost)[^\]]*\]|origin\s*:\s*\[|allowedOrigins|ALLOWED_ORIGINS|CORS_ORIGINS)/.test(content);
    if (hasCorsHeader && !hasExplicitOrigins && !hasWildcard) {
      findings.push({
        item_id: "SEC-10",
        severity: "high",
        file,
        message: "CORS ヘッダーが設定されていますが、明示的なオリジンホワイトリストがありません",
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
