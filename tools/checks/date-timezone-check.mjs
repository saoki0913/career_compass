#!/usr/bin/env node
/**
 * date-timezone-check.mjs
 * Checks .ts/.tsx files for timezone issues.
 * Items: DT-01, DT-04
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "../..");
const ALL_FILES = process.argv.includes("--all-files");

function getStagedFiles(pattern) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "diff", "--cached", "--name-only"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(f => f.trim() && (pattern ? pattern.test(f) : true));
}

function getAllTrackedFiles(pattern) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "ls-files"], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(f => f.trim() && (pattern ? pattern.test(f) : true));
}

function getStagedContent(file) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "show", `:0:${file}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

function getWorkingContent(file) {
  try { return readFileSync(join(PROJECT_DIR, file), "utf8"); } catch { return ""; }
}

function getFiles(pattern) {
  return ALL_FILES ? getAllTrackedFiles(pattern) : getStagedFiles(pattern);
}

function getContent(file) {
  return ALL_FILES ? getWorkingContent(file) : getStagedContent(file);
}

function print(findings) {
  process.stdout.write(JSON.stringify({ findings, count: findings.length }, null, 2) + "\n");
}

function run() {
  const findings = [];
  const tsPattern = /\.tsx?$/;
  const files = getFiles(tsPattern);

  for (const file of files) {
    // Skip test/spec/mock files
    if (/(?:test|spec|mock|fixture|__tests__|__mocks__)/i.test(file)) continue;
    // Skip server-only files where UTC is appropriate
    if (/(?:sitemap|robots)\.(ts|js)$/.test(file)) continue;

    const content = getContent(file);
    if (!content) continue;

    const lines = content.split("\n");
    const jstHelpers = /(?:toJST|formatJST|startOfDay|endOfDay|Asia\/Tokyo|toZonedTime|fromZonedTime|getJstDateKey|getJstDate|toJstDate|startOfJstDayAsUtc|getJstHour)/;
    const dbTimestampContext = /(?:\w+(?:At|_at|Date|_date|Time|_time))\s*[=:]\s*new Date\(\)/;
    const dbTimestampAssign = /(?:createdAt|updatedAt|created_at|updated_at|processedAt|completedAt|scheduledAt|syncedAt|deletedAt|expiredAt|startedAt|endedAt|lastSyncAt|lastCheckedAt|lastRunAt)\s*[=:]/;
    const metadataContext = /(?:lastModified|lastmod|expires|expiresAt|expires_at)\s*[=:]/;
    // Chained methods that are timezone-safe (don't produce user-facing dates)
    const timezoneSafeChain = /new Date\(\)\s*\.\s*(?:getFullYear|getTime|valueOf|toISOString|toUTCString)\s*\(/;

    lines.forEach((line, idx) => {
      // DT-04: bare new Date() without timezone context
      if (/new Date\(\)/.test(line)) {
        if (jstHelpers.test(line)) return;
        if (dbTimestampContext.test(line)) return;
        if (dbTimestampAssign.test(line)) return;
        if (metadataContext.test(line)) return;
        if (timezoneSafeChain.test(line)) return;

        const varMatch = line.match(/(?:const|let)\s+(\w+)\s*=\s*new Date\(\)/);
        if (varMatch) {
          const varName = varMatch[1];
          const usedForDbTimestamp = new RegExp(`(?:\\w+(?:At|_at|Date|_date))\\s*[=:]\\s*${varName}\\b`).test(content);
          if (usedForDbTimestamp) return;
          // Variable used in JST helper downstream
          const usedInJstHelper = new RegExp(`(?:toJST|formatJST|startOfDay|toZonedTime|getJstDateKey|getJstDate|startOfJstDayAsUtc|getJstHour)\\s*\\(\\s*${varName}\\b`).test(content);
          if (usedInJstHelper) return;
          // Variable used for DB comparison operators (lte, gte, gt, lt)
          const usedInDbComparison = new RegExp(`(?:lte|gte|gt|lt|eq)\\s*\\([^,]+,\\s*${varName}\\b`).test(content);
          if (usedInDbComparison) return;
        }

        findings.push({
          item_id: "DT-04",
          severity: "high",
          file,
          line: idx + 1,
          message: "bare new Date() -- JST 変換を確認してください",
        });
      }
    });

    // DT-01: mixed JST/UTC patterns in same file
    const hasJST = /Asia\/Tokyo|toJST|formatJST|startOfDayJST|endOfDayJST/.test(content);
    const hasUTCExplicit = /\.toISOString\(\)|\.toUTCString\(\)|new Date\(\)\.getTime\(\)/.test(content);
    const hasLocaleDateOps = /\.getHours\(\)|\.getDate\(\)|\.getMonth\(\)|\.setHours\(/.test(content);

    if (hasJST && hasLocaleDateOps) {
      findings.push({
        item_id: "DT-01",
        severity: "medium",
        file,
        message: "JST ヘルパーとローカル Date メソッドが混在しています。タイムゾーンの一貫性を確認してください",
      });
    }

    if (hasJST && hasUTCExplicit) {
      // This is less concerning but worth flagging
      findings.push({
        item_id: "DT-01",
        severity: "low",
        file,
        message: "JST ヘルパーと UTC メソッドが混在しています。意図的な変換か確認してください",
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
