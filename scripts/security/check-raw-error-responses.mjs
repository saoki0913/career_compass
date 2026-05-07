#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const DETECTORS = {
  nextResponseJsonError: {
    label: "NextResponse.json({ error })",
    pattern: /\bNextResponse\.json\s*\(\s*\{\s*error\b/gu,
  },
  responseJsonStringifyError: {
    label: "new Response(JSON.stringify({ error }))",
    pattern: /\bnew\s+Response\s*\(\s*JSON\.stringify\s*\(\s*\{\s*error\b/gu,
  },
};

const DEFAULT_SCAN_ROOTS = ["src/app/api", "src/bff"];
const DEFAULT_ALLOWLIST = {
  "src/app/api/applications/[id]/job-types/route.ts": { nextResponseJsonError: 8 },
  "src/app/api/applications/[id]/route.ts": { nextResponseJsonError: 12 },
  "src/app/api/auth/guest/route.ts": { nextResponseJsonError: 6 },
  "src/app/api/auth/onboarding/route.ts": { nextResponseJsonError: 7 },
  "src/app/api/auth/plan/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/calendar/disconnect/route.ts": { nextResponseJsonError: 1 },
  "src/app/api/calendar/google/route.ts": { nextResponseJsonError: 7 },
  "src/app/api/companies/[id]/applications/route.ts": { nextResponseJsonError: 9 },
  "src/app/api/companies/[id]/credentials/route.ts": { nextResponseJsonError: 5 },
  "src/app/api/companies/[id]/deadlines/route.ts": { nextResponseJsonError: 8 },
  "src/app/api/companies/[id]/delete-corporate-urls/route.ts": { nextResponseJsonError: 6 },
  "src/app/api/companies/[id]/es-review-status/route.ts": { nextResponseJsonError: 4 },
  "src/app/api/companies/[id]/es-role-options/route.ts": { nextResponseJsonError: 4 },
  "src/app/api/companies/[id]/fetch-corporate-upload/estimate/route.ts": { nextResponseJsonError: 6 },
  "src/app/api/companies/[id]/fetch-corporate-upload/route.ts": { nextResponseJsonError: 8 },
  "src/app/api/companies/[id]/fetch-corporate/estimate/route.ts": { nextResponseJsonError: 7 },
  "src/app/api/companies/[id]/fetch-corporate/route.ts": { nextResponseJsonError: 8 },
  "src/app/api/companies/[id]/search-corporate-pages/route.ts": { nextResponseJsonError: 3 },
  "src/app/api/companies/[id]/search-pages/route.ts": { nextResponseJsonError: 3 },
  "src/app/api/companies/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/credits/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/cron/calendar-sync/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/cron/daily-notifications/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/cron/hourly-daily-summary/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/documents/[id]/threads/[threadId]/route.ts": { nextResponseJsonError: 4 },
  "src/app/api/documents/[id]/threads/route.ts": { nextResponseJsonError: 3 },
  "src/app/api/documents/[id]/versions/route.ts": { nextResponseJsonError: 7 },
  "src/app/api/documents/new/route.ts": { nextResponseJsonError: 1 },
  "src/app/api/guest/migrate/route.ts": { nextResponseJsonError: 4 },
  "src/app/api/notifications/[id]/read/route.ts": { nextResponseJsonError: 3 },
  "src/app/api/notifications/[id]/route.ts": { nextResponseJsonError: 4 },
  "src/app/api/notifications/batch/route.ts": { nextResponseJsonError: 3 },
  "src/app/api/notifications/delete/route.ts": { nextResponseJsonError: 5 },
  "src/app/api/notifications/read-all/route.ts": { nextResponseJsonError: 2 },
  "src/app/api/notifications/route.ts": { nextResponseJsonError: 7 },
  "src/app/api/pins/route.ts": { nextResponseJsonError: 11 },
  "src/app/api/settings/profile/route.ts": { nextResponseJsonError: 1 },
  "src/app/api/webhooks/stripe/route.ts": { nextResponseJsonError: 5 },
  "src/bff/api/error-response.ts": { nextResponseJsonError: 1 },
  "src/bff/billing/es-review-stream-policy.ts": { responseJsonStringifyError: 3 },
  "src/bff/billing/gakuchika-stream-policy.ts": { responseJsonStringifyError: 1 },
  "src/bff/billing/motivation-stream-policy.ts": { responseJsonStringifyError: 1 },
  "src/bff/es-review/handle-review-stream.ts": { responseJsonStringifyError: 2 },
  "src/bff/gakuchika/[id]/conversation/new/route.ts": { nextResponseJsonError: 6 },
  "src/bff/gakuchika/[id]/conversation/resume/route.ts": { nextResponseJsonError: 8 },
  "src/bff/gakuchika/[id]/conversation/route.ts": { nextResponseJsonError: 6 },
  "src/bff/gakuchika/[id]/conversation/stream/route.ts": { responseJsonStringifyError: 1 },
  "src/bff/gakuchika/[id]/generate-es-draft/route.ts": { nextResponseJsonError: 13 },
  "src/bff/gakuchika/[id]/route.ts": { nextResponseJsonError: 15 },
  "src/bff/gakuchika/reorder/route.ts": { nextResponseJsonError: 4 },
  "src/bff/gakuchika/route.ts": { nextResponseJsonError: 7 },
  "src/bff/gakuchika/summaries/route.ts": { nextResponseJsonError: 2 },
  "src/bff/identity/llm-cost-guard.ts": { nextResponseJsonError: 1 },
  "src/bff/motivation/routes/[companyId]/conversation/route.ts": { nextResponseJsonError: 6 },
  "src/bff/motivation/routes/[companyId]/conversation/start/route.ts": { nextResponseJsonError: 9 },
  "src/bff/motivation/routes/[companyId]/generate-draft-direct/route.ts": { nextResponseJsonError: 10 },
  "src/bff/motivation/routes/[companyId]/generate-draft/route.ts": { nextResponseJsonError: 8 },
  "src/bff/motivation/routes/[companyId]/save-draft/route.ts": { nextResponseJsonError: 3 },
};

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function isSourceFile(fileName) {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/u.test(fileName);
}

function isSkippedFile(relPath) {
  return (
    relPath.includes("/__tests__/") ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/u.test(relPath)
  );
}

function walkSourceFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, files);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineForOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function lineTextForOffset(source, offset) {
  const start = source.lastIndexOf("\n", offset - 1) + 1;
  const end = source.indexOf("\n", offset);
  return source.slice(start, end === -1 ? source.length : end).trim();
}

function findOccurrences({ relPath, source }) {
  const occurrences = [];
  for (const [detectorId, detector] of Object.entries(DETECTORS)) {
    detector.pattern.lastIndex = 0;
    for (const match of source.matchAll(detector.pattern)) {
      occurrences.push({
        path: relPath,
        line: lineForOffset(source, match.index ?? 0),
        detector: detectorId,
        label: detector.label,
        text: lineTextForOffset(source, match.index ?? 0),
      });
    }
  }
  return occurrences.sort((a, b) => a.line - b.line || a.detector.localeCompare(b.detector));
}

function allowedCountFor(allowlist, relPath, detector) {
  const entry = allowlist[relPath];
  return Number(entry?.[detector] || 0);
}

function evaluateOccurrences(occurrences, allowlist) {
  const seen = new Map();
  const violations = [];
  for (const occurrence of occurrences) {
    const key = `${occurrence.path}\0${occurrence.detector}`;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    const allowed = allowedCountFor(allowlist, occurrence.path, occurrence.detector);
    if (count > allowed) {
      violations.push({ ...occurrence, allowedCount: allowed, foundCount: count });
    }
  }
  return violations;
}

export function evaluateRawErrorResponses({
  projectRoot,
  scanRoots = DEFAULT_SCAN_ROOTS,
  allowlist = DEFAULT_ALLOWLIST,
}) {
  const occurrences = [];
  let scannedFiles = 0;
  for (const scanRoot of scanRoots) {
    for (const filePath of walkSourceFiles(path.join(projectRoot, scanRoot))) {
      const relPath = normalizePath(path.relative(projectRoot, filePath));
      if (isSkippedFile(relPath)) continue;
      scannedFiles += 1;
      const source = fs.readFileSync(filePath, "utf8");
      occurrences.push(...findOccurrences({ relPath, source }));
    }
  }
  return {
    scannedFiles,
    occurrences,
    violations: evaluateOccurrences(occurrences, allowlist),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = path.resolve(argValue("--project", process.cwd()));
  const scanRootsInput = parseCsv(argValue("--scan-roots"));
  const scanRoots = scanRootsInput.length ? scanRootsInput : DEFAULT_SCAN_ROOTS;
  const result = evaluateRawErrorResponses({ projectRoot, scanRoots });

  if (result.violations.length > 0) {
    process.stderr.write(
      "Browser-facing raw error responses outside the explicit allowlist:\n",
    );
    for (const violation of result.violations) {
      process.stderr.write(
        `- ${violation.path}:${violation.line} ${violation.label} ` +
          `(allowed ${violation.allowedCount}, found at least ${violation.foundCount})\n` +
          `  ${violation.text}\n`,
      );
    }
    process.stderr.write(
      "Normalize with createApiErrorResponse()/BFF equivalent, or update the allowlist as tracked debt.\n",
    );
    process.exit(1);
  }

  process.stdout.write(
    `Raw error response check passed (${result.occurrences.length} allowlisted occurrence(s), ${result.scannedFiles} file(s) scanned).\n`,
  );
}
