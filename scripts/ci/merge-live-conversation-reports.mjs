#!/usr/bin/env node
/**
 * Merge multiple live conversation JSON reports (same reportType) into one artifact.
 *
 * Usage:
 *   node scripts/ci/merge-live-conversation-reports.mjs out.json \
 *     gpt-mini=backend/tests/output/a/live_gakuchika_extended_*.json \
 *     claude=backend/tests/output/b/live_gakuchika_extended_*.json
 *
 * Each argument after out.json is tag=path (path must exist; expand globs in shell).
 */

import { readFileSync, writeFileSync } from "node:fs";

function summarize(rows) {
  const summary = { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    summary.total += 1;
    const sev = String(row.severity || row.status || "").toLowerCase();
    if (sev === "passed" || sev === "degraded" || sev === "failed") {
      summary[sev] += 1;
    }
    if (String(row.status || "").toLowerCase() === "skipped") {
      summary.skipped += 1;
    }
  }
  return summary;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    process.stderr.write(
      "usage: merge-live-conversation-reports.mjs <out.json> <tag>=<path> [<tag>=<path> ...]\n",
    );
    process.exit(2);
  }
  const outPath = args[0];
  const pairs = [];
  for (let i = 1; i < args.length; i += 1) {
    const raw = args[i];
    const eq = raw.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Bad pair (expected tag=path): ${raw}`);
    }
    pairs.push({ tag: raw.slice(0, eq), path: raw.slice(eq + 1) });
  }

  const first = JSON.parse(readFileSync(pairs[0].path, "utf8"));
  const reportType = first.reportType || "unknown";
  const rows = [];

  for (const { tag, path } of pairs) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if ((doc.reportType || "unknown") !== reportType) {
      throw new Error(
        `reportType mismatch: ${path} has ${doc.reportType}, expected ${reportType}`,
      );
    }
    for (const row of doc.rows || []) {
      rows.push({
        ...row,
        caseId: `${tag}::${row.caseId}`,
        title: `[${tag}] ${row.title || row.caseId}`,
      });
    }
  }

  const merged = {
    reportType,
    displayName: first.displayName || reportType,
    mergedFrom: pairs.map((p) => ({ tag: p.tag, path: p.path })),
    generatedAt: new Date().toISOString(),
    suiteDepth: first.suiteDepth,
    targetEnv: first.targetEnv,
    summary: summarize(rows),
    rows,
  };

  writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${outPath} (${rows.length} rows)\n`);
}

main();
