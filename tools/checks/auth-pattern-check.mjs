#!/usr/bin/env node
/**
 * auth-pattern-check.mjs
 * Checks API route files for missing auth patterns.
 * Items: AUTH-01, AUTH-02, AUTH-04, IDOR-01
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
  const apiRoutePattern = /^src\/app\/api\/.+\/route\.ts$/;
  const files = getFiles(apiRoutePattern);

  for (const file of files) {
    const isPublicRoute = /\/api\/(?:auth|webhooks|health|cron|csrf)\//i.test(file);
    const isIntentionallyPublic = /\/api\/companies\/suggestions\//.test(file);
    if (isPublicRoute || isIntentionallyPublic) continue;

    const content = getContent(file);
    if (!content) continue;

    // Skip thin BFF proxy routes — auth is handled in BFF layer
    const isBffProxy = /from\s+["']@\/bff\//.test(content);
    if (isBffProxy) continue;

    // AUTH-01: session verification
    const hasSessionCheck = /(?:getRequestIdentity|requestIdentity|getSession|requireSession|getServerSession)\s*\(/.test(content);
    if (!hasSessionCheck) {
      findings.push({
        item_id: "AUTH-01",
        severity: "critical",
        file,
        message: "API route に認証チェック (getRequestIdentity/getSession/requireSession) がありません",
      });
    }

    // AUTH-02: owner access check
    const hasOwnerCheck = /(?:checkOwnerAccess|buildOwnerCondition|buildOwnedDeadlineCondition)\s*\(/.test(content);
    const hasResourceAccess = /\b(?:params\.id|params\.documentId|params\.companyId)\b/.test(content);
    if (!hasOwnerCheck && hasResourceAccess) {
      findings.push({
        item_id: "AUTH-02",
        severity: "high",
        file,
        message: "リソースアクセスに checkOwnerAccess がありません",
      });
    }

    // AUTH-04: guest identity handling
    const handlesGuest = /(?:guestId|guest_device_token|guestDeviceToken|requestIdentity)\s*/.test(content);
    const usesUserId = /userId/.test(content);
    if (usesUserId && !handlesGuest) {
      findings.push({
        item_id: "AUTH-04",
        severity: "medium",
        file,
        message: "userId を使用していますがゲスト identity の処理がありません",
      });
    }

    // IDOR-01: Dynamic param routes without owner verification
    const hasDynamicParam = /\[(?:id|documentId|companyId|deadlineId|taskId)\]/.test(file);
    const hasOwnerFilter = /(?:buildOwnerCondition|buildOwnedDeadlineCondition|buildOwnedRowCondition|checkOwnerAccess|getOwnedCompany|getOwnedCompanyRecord|getOwnedDocument|getOwnedApplicationRecord|getOwnedApplication|buildInterviewContext|buildConversationOwnerWhere|\.where\(.*(?:userId|guestId))/s.test(content);
    const hasInlineOwnerCheck = /identity\.(?:userId|guestId)/.test(content);
    const delegatesToBff = /from\s+["']@\/bff\//.test(content);
    if (hasDynamicParam && !hasOwnerFilter && !hasInlineOwnerCheck && !delegatesToBff) {
      findings.push({
        item_id: "IDOR-01",
        severity: "critical",
        file,
        message: "動的パラメータの API route にオーナー検証がありません (IDOR リスク)",
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
