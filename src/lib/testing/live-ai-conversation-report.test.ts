import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  generateLiveAiConversationReport,
  writeLiveAiConversationReport,
  type LiveAiConversationReportRow,
} from "./live-ai-conversation-report";

const rows: LiveAiConversationReportRow[] = [
  {
    feature: "motivation",
    caseId: "motivation_generic_reason",
    title: "どの会社にも言える志望理由",
    status: "passed",
    severity: "passed",
    durationMs: 1234,
    transcript: [{ role: "assistant", content: "質問" }],
    outputs: { finalText: "回答", generatedDocumentId: null },
    deterministicFailReasons: [],
    checks: [{ name: "draft-ready", passed: true, evidence: ["draft generated"] }],
    judge: null,
    cleanup: { ok: true, removedIds: [] },
  },
  {
    feature: "interview",
    caseId: "interview_story_depth",
    title: "深掘りが浅い面接ケース",
    status: "passed",
    severity: "degraded",
    durationMs: 4321,
    transcript: [{ role: "assistant", content: "質問" }],
    outputs: { finalText: "", generatedDocumentId: null },
    deterministicFailReasons: [],
    checks: [{ name: "question-depth", passed: true, evidence: ["follow-up observed"] }],
    judge: {
      enabled: true,
      model: "gpt-5.4-mini",
      overallPass: false,
      blocking: false,
      scores: { logic: 2 },
      warnings: ["回答の掘り下げ不足"],
      reasons: ["logic"],
    },
    cleanup: { ok: false, removedIds: ["company-1"] },
  },
];

describe("live AI conversation report", () => {
  it("summarizes rows into feature-specific markdown", () => {
    const report = generateLiveAiConversationReport({
      reportType: "motivation",
      runId: "run-123",
      generatedAt: "2026-03-29T14:00:00.000Z",
      generatedAtStamp: "20260329T140000Z",
      suiteDepth: "smoke",
      targetEnv: "staging",
      rows,
    });

    expect(report.summary.total).toBe(2);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.degraded).toBe(1);
    expect(report.markdown).toMatch(/# Motivation Live AI Report/);
    expect(report.markdown).toMatch(/`smoke`/);
    expect(report.markdown).toMatch(/志望動機作成/);
    expect(report.markdown).toMatch(/`motivation`/);
    expect(report.markdown).toMatch(/`interview`/);
    expect(report.markdown).toMatch(/`degraded`/);
    expect(report.markdown).toMatch(/回答の掘り下げ不足/);
    expect(report.markdown).toMatch(/cleanup: `failed`/);
  });

  it("writes timestamped JSON and Markdown files", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "ai-live-report-"));
    const report = generateLiveAiConversationReport({
      reportType: "interview",
      runId: "run-456",
      generatedAt: "2026-03-29T14:00:00.000Z",
      generatedAtStamp: "20260329T140000Z",
      suiteDepth: "extended",
      targetEnv: "staging",
      rows,
    });

    const result = await writeLiveAiConversationReport({
      outputDir,
      report,
    });

    expect(result.jsonPath).toMatch(/live_interview_extended_20260329T140000Z\.json$/);
    expect(result.markdownPath).toMatch(/live_interview_extended_20260329T140000Z\.md$/);

    const json = JSON.parse(readFileSync(result.jsonPath, "utf8")) as { summary: { total: number } };
    const markdown = readFileSync(result.markdownPath, "utf8");

    expect(json.summary.total).toBe(2);
    expect(markdown).toMatch(/Interview Live AI Report/);
  });
});
