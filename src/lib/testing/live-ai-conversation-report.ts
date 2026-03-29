import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type LiveAiConversationFeature = "gakuchika" | "motivation" | "interview";
export type LiveAiConversationSuiteDepth = "smoke" | "extended";
export type LiveAiConversationTargetEnv = "staging" | "production";

export type LiveAiConversationTranscriptTurn = {
  role: "user" | "assistant";
  content: string;
};

export type LiveAiConversationReportRow = {
  feature: LiveAiConversationFeature;
  caseId: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  transcript: LiveAiConversationTranscriptTurn[];
  outputs: {
    finalText: string;
    generatedDocumentId: string | null;
  };
  deterministicFailReasons: string[];
  judgeScores: { overallPass: boolean; scores?: Record<string, number> } | null;
  judgeFailReasons: string[];
  cleanup: { ok: boolean; removedIds: string[] };
};

export type LiveAiConversationReport = {
  runId: string;
  generatedAt: string;
  generatedAtStamp: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  targetEnv: LiveAiConversationTargetEnv;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    byFeature: Record<
      LiveAiConversationFeature,
      { total: number; passed: number; failed: number; skipped: number }
    >;
  };
  rows: LiveAiConversationReportRow[];
};

function emptyFeatureCounts() {
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

export function generateLiveAiConversationReport(input: {
  runId: string;
  generatedAt: string;
  generatedAtStamp: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  targetEnv: LiveAiConversationTargetEnv;
  rows: LiveAiConversationReportRow[];
}): LiveAiConversationReport & { markdown: string } {
  const summary = {
    total: input.rows.length,
    passed: input.rows.filter((row) => row.status === "passed").length,
    failed: input.rows.filter((row) => row.status === "failed").length,
    skipped: input.rows.filter((row) => row.status === "skipped").length,
    byFeature: {
      gakuchika: emptyFeatureCounts(),
      motivation: emptyFeatureCounts(),
      interview: emptyFeatureCounts(),
    } as Record<
      LiveAiConversationFeature,
      { total: number; passed: number; failed: number; skipped: number }
    >,
  };

  for (const row of input.rows) {
    const bucket = summary.byFeature[row.feature];
    bucket.total += 1;
    bucket[row.status] += 1;
  }

  const markdownLines = [
    "# AI Live Conversation Report",
    "",
    `- run_id: \`${input.runId}\``,
    `- generated_at: \`${input.generatedAt}\``,
    `- suite_depth: \`${input.suiteDepth}\``,
    `- target_env: \`${input.targetEnv}\``,
    `- total: \`${summary.total}\` passed=\`${summary.passed}\` failed=\`${summary.failed}\` skipped=\`${summary.skipped}\``,
    "",
    "## By Feature",
    "",
    "| feature | total | passed | failed | skipped |",
    "|---|---:|---:|---:|---:|",
    ...(["gakuchika", "motivation", "interview"] as const).map(
      (feature) =>
        `| ${feature} | ${summary.byFeature[feature].total} | ${summary.byFeature[feature].passed} | ${summary.byFeature[feature].failed} | ${summary.byFeature[feature].skipped} |`,
    ),
    "",
    "## Rows",
    "",
    ...input.rows.flatMap((row) => [
      `### \`${row.feature}\` / \`${row.caseId}\` / \`${row.status}\``,
      "",
      `- title: \`${row.title}\``,
      `- duration_ms: \`${row.durationMs}\``,
      `- cleanup: \`${row.cleanup.ok ? "ok" : "failed"}\``,
      row.deterministicFailReasons.length > 0
        ? `- deterministic_fail_reasons: ${row.deterministicFailReasons.map((reason) => `\`${reason}\``).join(", ")}`
        : "- deterministic_fail_reasons: `none`",
      row.judgeFailReasons.length > 0
        ? `- judge_fail_reasons: ${row.judgeFailReasons.map((reason) => `\`${reason}\``).join(", ")}`
        : "- judge_fail_reasons: `none`",
      row.outputs.finalText ? `- final_text: \`${row.outputs.finalText}\`` : "- final_text: `(empty)`",
      "",
    ]),
  ];

  return {
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
  const jsonPath = path.join(input.outputDir, `live_ai_conversations_${suffix}.json`);
  const markdownPath = path.join(input.outputDir, `live_ai_conversations_${suffix}.md`);

  await writeFile(jsonPath, JSON.stringify(input.report, null, 2), "utf8");
  await writeFile(markdownPath, input.report.markdown, "utf8");

  return { jsonPath, markdownPath };
}
