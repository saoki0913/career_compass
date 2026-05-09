#!/usr/bin/env node
/**
 * timeout-check.mjs
 * Checks for missing timeout configuration on external calls.
 * Items: TIMEOUT-01, TIMEOUT-02, TIMEOUT-03, TIMEOUT-04
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
  const targetPattern = /\.(?:tsx?|py)$/;
  const testPattern = /(?:\.test\.|\.spec\.|__tests__|e2e\/|backend\/tests\/)/;
  const files = getStagedFiles(targetPattern);

  for (const file of files) {
    // Skip test files
    if (testPattern.test(file)) continue;

    const content = getStagedContent(file);
    if (!content) continue;

    const isPython = file.endsWith(".py");
    const isTypeScript = /\.tsx?$/.test(file);

    if (isTypeScript) {
      // TIMEOUT-01: fetch without AbortController or signal
      const hasFetch = /\bfetch\s*\(/.test(content);
      const hasAbortOrSignal = /(?:AbortController|signal\s*:|AbortSignal\.timeout)/.test(content);
      if (hasFetch && !hasAbortOrSignal) {
        const hasExternalUrl = /fetch\s*\(\s*['"`]https?:/.test(content) || /fetch\s*\(\s*(?:url|endpoint|apiUrl)/.test(content);
        if (hasExternalUrl) {
          findings.push({
            item_id: "TIMEOUT-01",
            severity: "high",
            file,
            message: "外部 fetch() に AbortController / signal が設定されていません。タイムアウトなしでハングする可能性があります",
          });
        }
      }

      // TIMEOUT-02: axios without timeout
      const hasAxios = /axios(?:\.(?:get|post|put|patch|delete))?\s*\(/.test(content);
      const hasAxiosTimeout = /timeout\s*:/.test(content);
      if (hasAxios && !hasAxiosTimeout) {
        findings.push({
          item_id: "TIMEOUT-02",
          severity: "high",
          file,
          message: "axios 呼び出しに timeout オプションが設定されていません",
        });
      }
    }

    if (isPython) {
      // TIMEOUT-03: Python requests without timeout
      const hasPythonRequests = /requests\.(?:get|post|put|patch|delete)\s*\(/.test(content);
      const hasPythonTimeout = /timeout\s*=/.test(content);
      if (hasPythonRequests && !hasPythonTimeout) {
        findings.push({
          item_id: "TIMEOUT-03",
          severity: "high",
          file,
          message: "Python requests 呼び出しに timeout パラメータが設定されていません",
        });
      }

      // TIMEOUT-04: Python httpx without timeout
      const hasHttpx = /httpx\.(?:get|post|put|patch|delete|AsyncClient|Client)\s*\(/.test(content);
      const hasHttpxTimeout = /timeout\s*=/.test(content);
      if (hasHttpx && !hasHttpxTimeout) {
        findings.push({
          item_id: "TIMEOUT-04",
          severity: "high",
          file,
          message: "Python httpx 呼び出しに timeout パラメータが設定されていません",
        });
      }
    }
  }

  print(findings);
}

try {
  run();
} catch {
  print([]);
}
