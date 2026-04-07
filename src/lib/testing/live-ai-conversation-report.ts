import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type LiveAiConversationFeature = "gakuchika" | "motivation" | "interview";
export type LiveAiConversationSuiteDepth = "smoke" | "extended";
export type LiveAiConversationTargetEnv = "local" | "staging" | "production";
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

function markdownTranscriptEnv(): { enabled: boolean; maxTurns: number; maxChars: number } {
  const enabled = process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT?.trim() === "1";
  const maxTurnsRaw = Number(process.env.LIVE_AI_CONVERSATION_MD_TRANSCRIPT_MAX_TURNS ?? "8");
  const maxCharsRaw = Number(process.env.LIVE_AI_CONVERSATION_MD_TRANSCRIPT_MAX_CHARS ?? "12000");
  const maxTurns =
    Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.min(50, Math.floor(maxTurnsRaw)) : 8;
  const maxChars =
    Number.isFinite(maxCharsRaw) && maxCharsRaw > 0 ? Math.min(100_000, Math.floor(maxCharsRaw)) : 12_000;
  return { enabled, maxTurns, maxChars };
}

/** Avoid breaking fenced code blocks in Markdown when embedding user/assistant text. */
function escapeMarkdownFence(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/```/g, "'''");
}

/** Optional: last N turns for failed rows when `LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT=1`. */
function transcriptAppendixLines(row: LiveAiConversationReportRow): string[] {
  const { enabled, maxTurns, maxChars } = markdownTranscriptEnv();
  if (!enabled || row.severity !== "failed" || row.transcript.length === 0) {
    return [];
  }
  const tail = row.transcript.slice(-maxTurns);
  const lines: string[] = ["", "#### transcript_tail", ""];
  let used = 0;
  let truncated = false;
  for (const turn of tail) {
    if (used >= maxChars) {
      truncated = true;
      break;
    }
    const header = `- **${turn.role}**`;
    const room = maxChars - used - header.length - 40;
    if (room < 20) {
      truncated = true;
      break;
    }
    let body = escapeMarkdownFence((turn.content ?? "").trim());
    if (body.length > room) {
      body = `${body.slice(0, room)}…`;
      truncated = true;
    }
    lines.push(header, "", "```", body, "```", "");
    used += body.length + header.length + 40;
  }
  if (truncated) {
    lines.push("_…truncated (`LIVE_AI_CONVERSATION_MD_TRANSCRIPT_MAX_CHARS` / max turns)_", "");
  }
  return lines;
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

  lines.push(...transcriptAppendixLines(row));

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
