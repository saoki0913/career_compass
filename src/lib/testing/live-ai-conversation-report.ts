import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type LiveAiConversationFeature = "gakuchika" | "motivation" | "interview";
export type LiveAiConversationSuiteDepth = "smoke" | "extended";
export type LiveAiConversationTargetEnv = "staging" | "production";
export type LiveAiConversationSeverity = "passed" | "degraded" | "failed";
export type LiveAiConversationFailureKind =
  | "none"
  | "infra"
  | "auth"
  | "state"
  | "timeout"
  | "cleanup"
  | "quality"
  | "unknown";

export type LiveAiConversationTranscriptTurn = {
  role: "user" | "assistant";
  content: string;
};

export type LiveAiConversationCheck = {
  name: string;
  passed: boolean;
  evidence: string[];
};

export type LiveAiConversationJudge = {
  enabled: boolean;
  model: string;
  overallPass: boolean;
  blocking: boolean;
  scores?: Record<string, number>;
  warnings: string[];
  reasons: string[];
};

export type LiveAiConversationReportRow = {
  feature: LiveAiConversationFeature;
  caseId: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  severity: LiveAiConversationSeverity;
  failureKind: LiveAiConversationFailureKind;
  durationMs: number;
  transcript: LiveAiConversationTranscriptTurn[];
  outputs: {
    finalText: string;
    generatedDocumentId: string | null;
  };
  deterministicFailReasons: string[];
  representativeLog: string | null;
  representativeError: string | null;
  checks: LiveAiConversationCheck[];
  judge: LiveAiConversationJudge | null;
  cleanup: { ok: boolean; removedIds: string[] };
};

type LiveAiConversationSummaryCounts = {
  total: number;
  passed: number;
  degraded: number;
  failed: number;
  skipped: number;
};

export type LiveAiConversationReport = {
  reportType: LiveAiConversationFeature;
  displayName: string;
  runId: string;
  generatedAt: string;
  generatedAtStamp: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  targetEnv: LiveAiConversationTargetEnv;
  summary: LiveAiConversationSummaryCounts;
  rows: LiveAiConversationReportRow[];
};

export function classifyLiveAiConversationFailure(input: {
  status: LiveAiConversationReportRow["status"];
  cleanupOk: boolean;
  deterministicFailReasons: string[];
  judge: LiveAiConversationJudge | null;
}): LiveAiConversationFailureKind {
  if (input.status === "passed") {
    if (input.judge && !input.judge.overallPass) {
      return "quality";
    }
    return "none";
  }

  const haystack = input.deterministicFailReasons.map((reason) => reason.toLowerCase());
  const includes = (pattern: RegExp | string) =>
    haystack.some((reason) => (typeof pattern === "string" ? reason.includes(pattern) : pattern.test(reason)));

  if (!input.cleanupOk || includes("cleanup")) {
    return "cleanup";
  }
  if (includes("timeout") || includes("timed out")) {
    return "timeout";
  }
  if (
    includes("auth") ||
    includes("unauthor") ||
    includes("forbidden") ||
    includes("permission denied") ||
    includes("access denied") ||
    includes("401") ||
    includes("403")
  ) {
    return "auth";
  }
  if (
    includes("state") ||
    includes("conflict") ||
    includes("already started") ||
    includes("already exists") ||
    includes("did not complete") ||
    includes("did not reach") ||
    includes("not ready") ||
    includes("invalid session") ||
    includes("missing_report") ||
    includes("conversation")
  ) {
    return "state";
  }
  if (
    includes("infra") ||
    includes("network") ||
    includes("connection") ||
    includes("fetch") ||
    includes("upstream") ||
    includes("gateway") ||
    includes("internal server error") ||
    includes("service unavailable") ||
    includes("socket") ||
    includes("dns") ||
    includes("unexpected response") ||
    includes("503") ||
    includes("500")
  ) {
    return "infra";
  }
  if (input.judge && !input.judge.overallPass) {
    return "quality";
  }
  return "unknown";
}

const DISPLAY_NAMES: Record<LiveAiConversationFeature, string> = {
  gakuchika: "ガクチカ作成",
  motivation: "志望動機作成",
  interview: "面接対策",
};

const TITLES: Record<LiveAiConversationFeature, string> = {
  gakuchika: "Gakuchika Live AI Report",
  motivation: "Motivation Live AI Report",
  interview: "Interview Live AI Report",
};

function emptyCounts(): LiveAiConversationSummaryCounts {
  return { total: 0, passed: 0, degraded: 0, failed: 0, skipped: 0 };
}

function incrementCounts(summary: LiveAiConversationSummaryCounts, row: LiveAiConversationReportRow) {
  summary.total += 1;
  summary[row.severity] += 1;
  if (row.status === "skipped") {
    summary.skipped += 1;
  }
}

function markdownForField(label: string, value: string | null) {
  if (!value) {
    return `- ${label}: \`(none)\``;
  }
  return `- ${label}: \`${value}\``;
}

function markdownForRow(row: LiveAiConversationReportRow) {
  const failureReasons =
    row.deterministicFailReasons.length > 0
      ? row.deterministicFailReasons.map((reason) => `\`${reason}\``).join(", ")
      : "`none`";
  const judgeReasons =
    row.judge && row.judge.reasons.length > 0
      ? row.judge.reasons.map((reason) => `\`${reason}\``).join(", ")
      : "`none`";
  const judgeWarnings =
    row.judge && row.judge.warnings.length > 0
      ? row.judge.warnings.map((warning) => `\`${warning}\``).join(", ")
      : "`none`";

  const lines = [
    `### \`${row.feature}\` / \`${row.caseId}\` / \`${row.severity}\``,
    "",
    `- title: \`${row.title}\``,
    `- status: \`${row.status}\``,
    `- severity: \`${row.severity}\``,
    `- failure_kind: \`${row.failureKind}\``,
    `- failure_reasons: ${failureReasons}`,
    markdownForField("representative_log", row.representativeLog),
    markdownForField("representative_error", row.representativeError),
    `- duration_ms: \`${row.durationMs}\``,
    `- cleanup: \`${row.cleanup.ok ? "ok" : "failed"}\``,
    row.deterministicFailReasons.length > 0
      ? `- deterministic_fail_reasons: ${row.deterministicFailReasons.map((reason) => `\`${reason}\``).join(", ")}`
      : "- deterministic_fail_reasons: `none`",
    row.checks.length > 0
      ? `- checks: ${row.checks.map((check) => `\`${check.name}:${check.passed ? "pass" : "fail"}\``).join(", ")}`
      : "- checks: `none`",
  ];

  if (row.judge) {
    lines.push(
      `- judge: model=\`${row.judge.model}\` overall_pass=\`${row.judge.overallPass}\` blocking=\`${row.judge.blocking}\``,
      `- judge_reasons: ${judgeReasons}`,
      `- judge_warnings: ${judgeWarnings}`,
    );
  } else {
    lines.push("- judge: `disabled`");
  }

  lines.push(
    row.outputs.finalText ? `- final_text: \`${row.outputs.finalText}\`` : "- final_text: `(empty)`",
    "",
  );

  return lines;
}

export function generateLiveAiConversationReport(input: {
  reportType: LiveAiConversationFeature;
  runId: string;
  generatedAt: string;
  generatedAtStamp: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  targetEnv: LiveAiConversationTargetEnv;
  rows: LiveAiConversationReportRow[];
}): LiveAiConversationReport & { markdown: string } {
  const summary = emptyCounts();
  for (const row of input.rows) {
    incrementCounts(summary, row);
  }

  const markdownLines = [
    `# ${TITLES[input.reportType]}`,
    "",
    `- feature: \`${DISPLAY_NAMES[input.reportType]}\``,
    `- report_type: \`${input.reportType}\``,
    `- run_id: \`${input.runId}\``,
    `- generated_at: \`${input.generatedAt}\``,
    `- suite_depth: \`${input.suiteDepth}\``,
    `- target_env: \`${input.targetEnv}\``,
    `- total: \`${summary.total}\` passed=\`${summary.passed}\` degraded=\`${summary.degraded}\` failed=\`${summary.failed}\` skipped=\`${summary.skipped}\``,
    "",
    "## Rows",
    "",
    ...input.rows.flatMap((row) => markdownForRow(row)),
  ];

  return {
    reportType: input.reportType,
    displayName: DISPLAY_NAMES[input.reportType],
    runId: input.runId,
    generatedAt: input.generatedAt,
    generatedAtStamp: input.generatedAtStamp,
    suiteDepth: input.suiteDepth,
    targetEnv: input.targetEnv,
    summary,
    rows: input.rows,
    markdown: markdownLines.join("\n"),
  };
}

export async function writeLiveAiConversationReport(input: {
  outputDir: string;
  report: LiveAiConversationReport & { markdown: string };
}) {
  await mkdir(input.outputDir, { recursive: true });

  const stamp = input.report.generatedAtStamp.replace(/[^0-9TZ]+/g, "");
  const suffix = `${input.report.suiteDepth}_${stamp}`;
  const jsonPath = path.join(input.outputDir, `live_${input.report.reportType}_${suffix}.json`);
  const markdownPath = path.join(input.outputDir, `live_${input.report.reportType}_${suffix}.md`);

  await writeFile(jsonPath, JSON.stringify(input.report, null, 2), "utf8");
  await writeFile(markdownPath, input.report.markdown, "utf8");

  return { jsonPath, markdownPath };
}
