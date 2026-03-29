#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPORT_NAME_RE = /^(live_[^/]+?)_(\d{8}T\d{6}Z)\.json$/;

function parseTimestamp(value) {
  const match = /^(\d{8})T(\d{6})Z$/.exec(value);
  if (!match) return null;
  const [, ymd, hms] = match;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === "object");
  }
  if (payload && typeof payload === "object") {
    const nested = payload.rows || payload.runs_detail || payload.reports;
    if (Array.isArray(nested)) {
      return nested.filter((row) => row && typeof row === "object");
    }
  }
  return [];
}

function readJsonFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function countRows(rows) {
  const counts = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of rows) {
    counts.total += 1;
    const status = String(row.status || "").toLowerCase();
    if (status === "passed") counts.passed += 1;
    else if (status === "failed") counts.failed += 1;
    else if (status === "skipped") counts.skipped += 1;
  }

  return counts;
}

function buildFailureExcerpt(rows, maxItems = 5) {
  const lines = [];
  for (const row of rows) {
    if (String(row.status || "").toLowerCase() !== "failed") continue;
    const reasonList = [];
    if (Array.isArray(row.deterministic_fail_reasons)) {
      reasonList.push(...row.deterministic_fail_reasons);
    }
    if (Array.isArray(row.deterministicFailReasons)) {
      reasonList.push(...row.deterministicFailReasons);
    }
    if (Array.isArray(row.judge_blocking_reasons)) {
      reasonList.push(...row.judge_blocking_reasons);
    }
    if (Array.isArray(row.judgeFailReasons)) {
      reasonList.push(...row.judgeFailReasons);
    }
    lines.push(`- \`${String(row.case_id || row.caseId || "unknown")}\` ${reasonList.length ? `- ${reasonList.slice(0, 3).join(", ")}` : ""}`.trimEnd());
    if (lines.length >= maxItems) break;
  }
  return lines;
}

export function collectLatestAiLiveReports(outputDir) {
  const entries = readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith("live_") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .filter((name) => !name.includes("_aggregate_"));

  const latestByPrefix = new Map();

  for (const name of entries) {
    const match = REPORT_NAME_RE.exec(name);
    if (!match) continue;
    const [, prefix, stamp] = match;
    const ts = parseTimestamp(stamp);
    if (ts === null) continue;
    const current = latestByPrefix.get(prefix);
    if (!current || ts > current.timestamp) {
      latestByPrefix.set(prefix, {
        path: path.join(outputDir, name),
        timestamp: ts,
      });
    }
  }

  return [...latestByPrefix.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => {
      const payload = readJsonFile(item.path);
      return {
        path: item.path,
        rows: normalizeRows(payload),
        payload,
      };
    });
}

export function buildAiLiveSummaryMarkdown(reports) {
  const reportSummaries = reports.map((report) => ({
    ...report,
    counts: countRows(report.rows || []),
  }));

  const totalCounts = reportSummaries.reduce(
    (acc, report) => {
      acc.total += report.counts.total;
      acc.passed += report.counts.passed;
      acc.failed += report.counts.failed;
      acc.skipped += report.counts.skipped;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, skipped: 0 },
  );

  const lines = [
    "# Nightly AI Live Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| report | total | passed | failed | skipped |",
    "|---|---:|---:|---:|---:|",
  ];

  for (const report of reportSummaries) {
    lines.push(
      `| ${path.basename(report.path)} | ${report.counts.total} | ${report.counts.passed} | ${report.counts.failed} | ${report.counts.skipped} |`,
    );
  }

  lines.push(
    "",
    `Overall: total=${totalCounts.total}, passed=${totalCounts.passed}, failed=${totalCounts.failed}, skipped=${totalCounts.skipped}`,
    "",
  );

  const failureLines = reportSummaries.flatMap((report) => {
    const linesForReport = buildFailureExcerpt(report.rows || []);
    if (linesForReport.length === 0) return [];
    return [`### ${path.basename(report.path)}`, ...linesForReport, ""];
  });

  if (failureLines.length > 0) {
    lines.push("## Recent failures", "", ...failureLines);
  } else {
    lines.push("## Recent failures", "", "_No failed cases in the latest reports._", "");
  }

  return lines.join("\n");
}

export function writeAiLiveSummary({
  outputDir,
  summaryFile,
} = {}) {
  const resolvedOutputDir = outputDir || process.env.AI_LIVE_OUTPUT_DIR || path.resolve("backend/tests/output");
  const resolvedSummaryFile = summaryFile || process.env.GITHUB_STEP_SUMMARY || "";

  const reports = collectLatestAiLiveReports(resolvedOutputDir);
  const markdown =
    reports.length > 0
      ? buildAiLiveSummaryMarkdown(reports)
      : [
          "# Nightly AI Live Summary",
          "",
          `Generated: ${new Date().toISOString()}`,
          "",
          `No live JSON reports found under \`${resolvedOutputDir}\`.`,
          "",
        ].join("\n");

  if (resolvedSummaryFile) {
    writeFileSync(resolvedSummaryFile, `${markdown}\n`, "utf8");
  }

  return markdown;
}

function parseArgs(argv) {
  const out = {
    outputDir: process.env.AI_LIVE_OUTPUT_DIR || "",
    summaryFile: process.env.GITHUB_STEP_SUMMARY || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output-dir") {
      out.outputDir = argv[i + 1] || out.outputDir;
      i += 1;
      continue;
    }
    if (arg === "--summary-file") {
      out.summaryFile = argv[i + 1] || out.summaryFile;
      i += 1;
      continue;
    }
  }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const markdown = writeAiLiveSummary(options);
  process.stdout.write(`${markdown}\n`);
}
