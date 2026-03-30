#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPORT_NAME_RE = /^(live_[^/]+?)_(\d{8}T\d{6}Z)\.json$/;
const FEATURE_DISPLAY = {
  es_review: "ES添削",
  gakuchika: "ガクチカ作成",
  motivation: "志望動機作成",
  interview: "面接対策",
};

const FEATURE_RECOMMENDATIONS = {
  es_review: [
    {
      id: "length-control",
      match: (reason) => reason.includes("char_count") || reason.includes("length_shortfall"),
      title: "文字数制御を優先確認",
      description: "length-fix か prompt 制約が弱く、指定文字数帯に届いていないケースが多い。",
      nextStep: "失敗 case の target window と rewrite/repair prompt を確認する。",
    },
    {
      id: "grounding",
      match: (reason) => reason.includes("company") || reason.includes("grounding"),
      title: "企業根拠の反映を確認",
      description: "企業 grounding 系の理由が多く、志望理由の根拠が薄い可能性がある。",
      nextStep: "RAG / evidence selection / grounding policy のログを確認する。",
    },
    {
      id: "judge",
      match: (reason) => reason.includes("judge"),
      title: "judge 低評価ケースを精査",
      description: "deterministic は通っても、自然さや設問適合で評価を落としている。",
      nextStep: "低評価 case の生成文を見て prompt と model routing を見直す。",
    },
  ],
  gakuchika: [
    {
      id: "question-depth",
      match: (reason) => reason.includes("question-depth"),
      title: "会話の深掘りを強化",
      description: "役割・工夫・改善の掘り下げ質問が不足している。",
      nextStep: "質問遷移と follow-up 条件を確認し、役割/改善を必須化する。",
    },
    {
      id: "output-grounding",
      match: (reason) => reason.includes("output-grounding"),
      title: "要約/ES draft への反映を改善",
      description: "会話で得た要点が最終生成文に十分残っていない。",
      nextStep: "summary 生成と draft prompt の入力マッピングを確認する。",
    },
  ],
  motivation: [
    {
      id: "question-depth",
      match: (reason) => reason.includes("question-depth"),
      title: "企業理解を問う深掘りを増やす",
      description: "企業理由や差別化を引き出す質問が弱い。",
      nextStep: "question stage と company-specific follow-up を確認する。",
    },
    {
      id: "output-grounding",
      match: (reason) => reason.includes("output-grounding") || reason.includes("company-fit"),
      title: "企業理解と経験接続の反映を改善",
      description: "企業理解や本人経験との接続が draft に残り切っていない。",
      nextStep: "draft 生成の入力 context と evidence summary を確認する。",
    },
  ],
  interview: [
    {
      id: "question-depth",
      match: (reason) => reason.includes("question-depth"),
      title: "追質問の深さを改善",
      description: "初手質問や follow-up が浅く、面接らしい掘り下げになっていない。",
      nextStep: "質問生成条件と会話履歴の参照量を確認する。",
    },
    {
      id: "output-grounding",
      match: (reason) => reason.includes("output-grounding"),
      title: "フィードバックの具体性を改善",
      description: "feedback が抽象的で、改善ポイントが弱い。",
      nextStep: "feedback prompt と評価観点の入力を確認する。",
    },
  ],
};

function parseTimestamp(value) {
  const match = /^(\d{8})T(\d{6})Z$/.exec(value);
  if (!match) return null;
  const [, ymd, hms] = match;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

function toJstDate(value) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date(value));
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
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function inferReportType(report) {
  if (report.payload?.reportType) return String(report.payload.reportType);
  const base = path.basename(report.path);
  if (base.startsWith("live_es_review_")) return "es_review";
  if (base.startsWith("live_gakuchika_")) return "gakuchika";
  if (base.startsWith("live_motivation_")) return "motivation";
  if (base.startsWith("live_interview_")) return "interview";
  return "unknown";
}

function countRows(rows) {
  const counts = { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    counts.total += 1;
    const severity = String(row.severity || row.status || "").toLowerCase();
    if (severity === "passed") counts.passed += 1;
    else if (severity === "degraded") counts.degraded += 1;
    else if (severity === "failed") counts.failed += 1;

    const status = String(row.status || "").toLowerCase();
    if (status === "skipped") counts.skipped += 1;
  }
  return counts;
}

function collectReasons(row) {
  const reasons = [];
  if (Array.isArray(row.deterministic_fail_reasons)) reasons.push(...row.deterministic_fail_reasons);
  if (Array.isArray(row.deterministicFailReasons)) reasons.push(...row.deterministicFailReasons);
  if (Array.isArray(row.judge_blocking_reasons)) reasons.push(...row.judge_blocking_reasons);
  if (Array.isArray(row.judgeFailReasons)) reasons.push(...row.judgeFailReasons);
  if (Array.isArray(row.judge?.reasons)) reasons.push(...row.judge.reasons);
  return reasons.map((reason) => String(reason));
}

function collectWarnings(row) {
  const warnings = [];
  if (Array.isArray(row.judge?.warnings)) warnings.push(...row.judge.warnings);
  return warnings.map((warning) => String(warning));
}

function rankEntries(entries, limit = 5) {
  return [...entries.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildIssueLines(rows, targetSeverity, maxItems = 5) {
  const lines = [];
  for (const row of rows) {
    const severity = String(row.severity || row.status || "").toLowerCase();
    if (severity !== targetSeverity) continue;
    const caseId = String(row.case_id || row.caseId || "unknown");
    const reasons = collectReasons(row);
    lines.push(`- \`${caseId}\`${reasons.length ? ` - ${reasons.slice(0, 3).join(", ")}` : ""}`);
    if (lines.length >= maxItems) break;
  }
  return lines;
}

function collectLatestAiLiveFiles(dir) {
  const walk = (target) => {
    const entries = readdirSync(target, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const resolved = path.join(target, entry.name);
      if (entry.isDirectory()) files.push(...walk(resolved));
      else if (entry.isFile()) files.push(resolved);
    }
    return files;
  };

  return walk(dir)
    .filter((filePath) => path.basename(filePath).startsWith("live_") && filePath.endsWith(".json"))
    .filter((filePath) => !path.basename(filePath).includes("_aggregate_"));
}

export function collectLatestAiLiveReports(outputDir) {
  const entries = collectLatestAiLiveFiles(outputDir);
  const latestByPrefix = new Map();

  for (const filePath of entries) {
    const name = path.basename(filePath);
    const match = REPORT_NAME_RE.exec(name);
    if (!match) continue;
    const [, prefix, stamp] = match;
    const ts = parseTimestamp(stamp);
    if (ts === null) continue;
    const current = latestByPrefix.get(prefix);
    if (!current || ts > current.timestamp) {
      latestByPrefix.set(prefix, { path: filePath, timestamp: ts });
    }
  }

  return [...latestByPrefix.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => {
      const payload = readJsonFile(item.path);
      return { path: item.path, rows: normalizeRows(payload), payload };
    });
}

function normalizeReports(reports) {
  return reports.map((report) => {
    const reportType = inferReportType(report);
    const displayName = report.payload?.displayName || FEATURE_DISPLAY[reportType] || reportType;
    const counts = countRows(report.rows || []);
    const reasonCounts = new Map();
    const warningCounts = new Map();

    for (const row of report.rows || []) {
      for (const reason of collectReasons(row)) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
      for (const warning of collectWarnings(row)) {
        warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1);
      }
    }

    return {
      ...report,
      reportType,
      displayName,
      counts,
      topReasons: rankEntries(reasonCounts),
      topWarnings: rankEntries(warningCounts),
      degradedLines: buildIssueLines(report.rows || [], "degraded"),
      failedLines: buildIssueLines(report.rows || [], "failed"),
    };
  });
}

function buildRecommendations(report) {
  const rules = FEATURE_RECOMMENDATIONS[report.reportType] || [];
  const recommendations = [];
  for (const rule of rules) {
    const matchedReasons = report.topReasons.filter((entry) => rule.match(entry.value));
    if (matchedReasons.length === 0) continue;
    recommendations.push({
      id: rule.id,
      title: rule.title,
      description: rule.description,
      nextStep: rule.nextStep,
      signals: matchedReasons,
    });
  }

  if (recommendations.length === 0 && (report.counts.failed > 0 || report.counts.degraded > 0)) {
    recommendations.push({
      id: "manual-review",
      title: "代表ケースの手動確認が必要",
      description: "典型的な reason へのマッピングができていないため、まず transcript と生成文を確認する。",
      nextStep: "feature report の failed/degraded case を 1 件ずつ確認する。",
      signals: report.topReasons,
    });
  }

  return recommendations.slice(0, 3);
}

function priorityForReport(report) {
  if (report.counts.failed > 0) return "high";
  if (report.counts.degraded > 0) return "medium";
  return "low";
}

function buildTodayActions(features) {
  return features
    .filter((feature) => feature.priority !== "low")
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority] || b.counts.failed - a.counts.failed;
    })
    .flatMap((feature) =>
      feature.recommendations.slice(0, 2).map((item) =>
        `- [${feature.displayName}] ${item.title}: ${item.nextStep}`,
      ),
    )
    .slice(0, 6);
}

export function buildAiLiveSummaryMarkdown(reports) {
  return buildAiLiveArtifacts(reports).summaryMarkdown;
}

export function buildAiLiveArtifacts(reports, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const runUrl = options.runUrl || "";
  const suite = options.suite || "";
  const normalizedReports = normalizeReports(reports);
  const overall = normalizedReports.reduce(
    (acc, report) => {
      acc.total += report.counts.total;
      acc.passed += report.counts.passed;
      acc.degraded += report.counts.degraded;
      acc.failed += report.counts.failed;
      acc.skipped += report.counts.skipped;
      return acc;
    },
    { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 },
  );

  const features = normalizedReports.map((report) => ({
    reportType: report.reportType,
    displayName: report.displayName,
    counts: report.counts,
    topReasons: report.topReasons,
    topWarnings: report.topWarnings,
    degradedLines: report.degradedLines,
    failedLines: report.failedLines,
    priority: priorityForReport(report),
    recommendations: buildRecommendations(report),
    reportFile: path.basename(report.path),
  }));

  const aggregate = {
    generatedAt,
    dateJst: toJstDate(generatedAt),
    runUrl,
    suite,
    overall,
    features: Object.fromEntries(features.map((feature) => [feature.reportType, feature])),
  };

  const summaryLines = [
    "# AI Live Summary",
    "",
    `Generated: ${generatedAt}`,
    ...(suite ? [`Suite: ${suite}`, ""] : [""]),
    ...(runUrl ? [`Run: ${runUrl}`, ""] : [""]),
    "| report | total | passed | degraded | failed | skipped |",
    "|---|---:|---:|---:|---:|---:|",
    ...features.map(
      (feature) =>
        `| ${feature.reportFile} | ${feature.counts.total} | ${feature.counts.passed} | ${feature.counts.degraded} | ${feature.counts.failed} | ${feature.counts.skipped} |`,
    ),
    "",
    `Overall: total=${overall.total}, passed=${overall.passed}, degraded=${overall.degraded}, failed=${overall.failed}, skipped=${overall.skipped}`,
    "",
  ];

  for (const feature of features) {
    summaryLines.push(`## ${feature.displayName}`, "");
    summaryLines.push(
      `- report: \`${feature.reportFile}\``,
      `- total=${feature.counts.total} passed=${feature.counts.passed} degraded=${feature.counts.degraded} failed=${feature.counts.failed} skipped=${feature.counts.skipped}`,
      `- priority: \`${feature.priority}\``,
      "",
    );

    if (feature.recommendations.length > 0) {
      summaryLines.push("### Recommendations", "");
      for (const item of feature.recommendations) {
        summaryLines.push(`- ${item.title}: ${item.nextStep}`);
      }
      summaryLines.push("");
    }

    if (feature.degradedLines.length > 0) {
      summaryLines.push("### Degraded", "", ...feature.degradedLines, "");
    }

    if (feature.failedLines.length > 0) {
      summaryLines.push("### Failed", "", ...feature.failedLines, "");
    }

    if (feature.degradedLines.length === 0 && feature.failedLines.length === 0) {
      summaryLines.push("_No degraded or failed cases in the latest report._", "");
    }
  }

  const todayActions = buildTodayActions(features);
  const issueLines = [
    `# AI Live Daily Report ${aggregate.dateJst}`,
    "",
    ...(runUrl ? [`- Run: ${runUrl}`] : []),
    ...(suite ? [`- Suite: \`${suite}\``] : []),
    `- Overall: total=${overall.total}, passed=${overall.passed}, degraded=${overall.degraded}, failed=${overall.failed}, skipped=${overall.skipped}`,
    "",
    "## 今日やること",
    "",
    ...(todayActions.length > 0 ? todayActions : ["- 重大な failed / degraded はありません。"]),
    "",
  ];

  for (const feature of features) {
    issueLines.push(`## ${feature.displayName}`, "");
    issueLines.push(
      `- 状態: passed=${feature.counts.passed} degraded=${feature.counts.degraded} failed=${feature.counts.failed}`,
      `- 優先度: \`${feature.priority}\``,
      `- report: \`${feature.reportFile}\``,
      "",
    );

    if (feature.topReasons.length > 0) {
      issueLines.push("### 主な原因", "");
      for (const item of feature.topReasons.slice(0, 3)) {
        issueLines.push(`- \`${item.value}\` x ${item.count}`);
      }
      issueLines.push("");
    }

    if (feature.recommendations.length > 0) {
      issueLines.push("### 改善提案", "");
      for (const item of feature.recommendations) {
        issueLines.push(`- **${item.title}**: ${item.description} ${item.nextStep}`);
      }
      issueLines.push("");
    }

    if (feature.failedLines.length > 0) {
      issueLines.push("### failed case", "", ...feature.failedLines, "");
    }
    if (feature.degradedLines.length > 0) {
      issueLines.push("### degraded case", "", ...feature.degradedLines, "");
    }
    if (feature.failedLines.length === 0 && feature.degradedLines.length === 0) {
      issueLines.push("_問題のある case はありません。_", "");
    }
  }

  return {
    aggregate,
    summaryMarkdown: summaryLines.join("\n"),
    issueBody: issueLines.join("\n"),
    recommendations: features.map((feature) => ({
      reportType: feature.reportType,
      displayName: feature.displayName,
      priority: feature.priority,
      recommendations: feature.recommendations,
    })),
  };
}

export function writeAiLiveSummary({ outputDir, summaryFile, runUrl, suite } = {}) {
  const resolvedOutputDir = outputDir || process.env.AI_LIVE_OUTPUT_DIR || path.resolve("backend/tests/output");
  const resolvedSummaryFile = summaryFile || process.env.GITHUB_STEP_SUMMARY || "";
  const defaultRunUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";
  const resolvedRunUrl = runUrl || defaultRunUrl;
  const resolvedSuite = suite || process.env.AI_LIVE_SUITE || "";

  const reports = collectLatestAiLiveReports(resolvedOutputDir);
  mkdirSync(resolvedOutputDir, { recursive: true });

  const artifacts =
    reports.length > 0
      ? buildAiLiveArtifacts(reports, {
          generatedAt: new Date().toISOString(),
          runUrl: resolvedRunUrl,
          suite: resolvedSuite,
        })
      : {
          aggregate: {
            generatedAt: new Date().toISOString(),
            dateJst: toJstDate(new Date().toISOString()),
            runUrl: resolvedRunUrl,
            suite: resolvedSuite,
            overall: { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 },
            features: {},
          },
          summaryMarkdown: [
            "# AI Live Summary",
            "",
            `Generated: ${new Date().toISOString()}`,
            "",
            `No live JSON reports found under \`${resolvedOutputDir}\`.`,
            "",
          ].join("\n"),
          issueBody: `# AI Live Daily Report ${toJstDate(new Date().toISOString())}\n\n- 実行結果が見つかりませんでした。\n`,
          recommendations: [],
        };

  writeFileSync(path.join(resolvedOutputDir, "ai-live-summary.json"), JSON.stringify(artifacts.aggregate, null, 2), "utf8");
  writeFileSync(path.join(resolvedOutputDir, "ai-live-summary.md"), `${artifacts.summaryMarkdown}\n`, "utf8");
  writeFileSync(path.join(resolvedOutputDir, "ai-live-recommendations.json"), JSON.stringify(artifacts.recommendations, null, 2), "utf8");
  writeFileSync(path.join(resolvedOutputDir, "ai-live-issue-body.md"), `${artifacts.issueBody}\n`, "utf8");

  if (resolvedSummaryFile) {
    writeFileSync(resolvedSummaryFile, `${artifacts.summaryMarkdown}\n`, "utf8");
  }

  return artifacts.summaryMarkdown;
}

function parseArgs(argv) {
  const out = {
    outputDir: process.env.AI_LIVE_OUTPUT_DIR || "",
    summaryFile: process.env.GITHUB_STEP_SUMMARY || "",
    runUrl: "",
    suite: "",
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
    if (arg === "--run-url") {
      out.runUrl = argv[i + 1] || out.runUrl;
      i += 1;
      continue;
    }
    if (arg === "--suite") {
      out.suite = argv[i + 1] || out.suite;
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
