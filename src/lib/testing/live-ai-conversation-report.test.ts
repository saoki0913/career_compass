import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyLiveAiConversationFailure,
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
    failureKind: "none",
    durationMs: 1234,
    transcript: [{ role: "assistant", content: "質問" }],
    outputs: { finalText: "回答", generatedDocumentId: null },
    deterministicFailReasons: [],
    representativeLog: null,
    representativeError: null,
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
    failureKind: "quality",
    durationMs: 4321,
    transcript: [{ role: "assistant", content: "質問" }],
    outputs: { finalText: "", generatedDocumentId: null },
    deterministicFailReasons: [],
    representativeLog: "回答の掘り下げ不足",
    representativeError: null,
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
  {
    feature: "gakuchika",
    caseId: "gakuchika_cleanup_failure",
    title: "cleanup failed case",
    status: "failed",
    severity: "failed",
    failureKind: "cleanup",
    durationMs: 2100,
    transcript: [{ role: "assistant", content: "質問" }],
    outputs: { finalText: "draft", generatedDocumentId: "doc-1" },
    deterministicFailReasons: ["cleanup_failed"],
    representativeLog: "cleanup failed while deleting gakuchika artifacts",
    representativeError: null,
    checks: [{ name: "cleanup", passed: false, evidence: ["cleanup failed"] }],
    judge: null,
    cleanup: { ok: false, removedIds: ["doc-1"] },
  },
];

describe("live AI conversation report", () => {
  it("classifies common live conversation failure modes", () => {
    expect(
      classifyLiveAiConversationFailure({
        status: "failed",
        cleanupOk: true,
        deterministicFailReasons: ["401 unauthorized from stream route"],
        judge: null,
      }),
    ).toBe("auth");
    expect(
      classifyLiveAiConversationFailure({
        status: "failed",
        cleanupOk: true,
        deterministicFailReasons: ["stream did not emit a complete event before timeout"],
        judge: null,
      }),
    ).toBe("timeout");
    expect(
      classifyLiveAiConversationFailure({
        status: "passed",
        cleanupOk: true,
        deterministicFailReasons: [],
        judge: {
          enabled: true,
          model: "heuristic-live-judge-v1",
          overallPass: false,
          blocking: false,
          warnings: ["深掘り不足"],
          reasons: ["question-depth"],
        },
      }),
    ).toBe("quality");
  });

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

    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.degraded).toBe(1);
    expect(report.markdown).toMatch(/# Motivation Live AI Report/);
    expect(report.markdown).toMatch(/`smoke`/);
    expect(report.markdown).toMatch(/志望動機作成/);
    expect(report.markdown).toMatch(/`motivation`/);
    expect(report.markdown).toMatch(/`interview`/);
    expect(report.markdown).toMatch(/failure_kind: `quality`/);
    expect(report.markdown).toMatch(/failure_kind: `cleanup`/);
    expect(report.markdown).toMatch(/failure_reasons:/);
    expect(report.markdown).toMatch(/representative_log:/);
    expect(report.markdown).toMatch(/representative_error:/);
    expect(report.markdown).toMatch(/`degraded`/);
    expect(report.markdown).toMatch(/回答の掘り下げ不足/);
    expect(report.markdown).toMatch(/cleanup: `failed`/);
    expect(report.markdown).toMatch(/cleanup failed while deleting gakuchika artifacts/);
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

    expect(json.summary.total).toBe(3);
    expect(markdown).toMatch(/Interview Live AI Report/);
  });

  it("renders local target env in markdown output", () => {
    const report = generateLiveAiConversationReport({
      reportType: "gakuchika",
      runId: "run-local",
      generatedAt: "2026-03-29T14:00:00.000Z",
      generatedAtStamp: "20260329T140000Z",
      suiteDepth: "extended",
      targetEnv: "local",
      rows,
    });

    expect(report.targetEnv).toBe("local");
    expect(report.markdown).toMatch(/target_env: `local`/);
  });

  it("appends transcript_tail for failed rows when LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT=1", () => {
    const prev = process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT;
    process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT = "1";
    try {
      const failedRow: LiveAiConversationReportRow = {
        feature: "gakuchika",
        caseId: "case-transcript",
        title: "transcript case",
        status: "failed",
        severity: "failed",
        failureKind: "state",
        durationMs: 100,
        transcript: [
          { role: "assistant", content: "最初の質問" },
          { role: "user", content: "ユーザ回答A" },
          { role: "assistant", content: "続きの質問" },
        ],
        outputs: { finalText: "", generatedDocumentId: null },
        deterministicFailReasons: ["draft_ready missing"],
        representativeLog: null,
        representativeError: null,
        checks: [],
        judge: null,
        cleanup: { ok: true, removedIds: [] },
      };
      const report = generateLiveAiConversationReport({
        reportType: "gakuchika",
        runId: "run-tx",
        generatedAt: "2026-03-29T14:00:00.000Z",
        generatedAtStamp: "20260329T140000Z",
        suiteDepth: "extended",
        targetEnv: "local",
        rows: [failedRow],
      });
      expect(report.markdown).toMatch(/#### transcript_tail/);
      expect(report.markdown).toMatch(/ユーザ回答A/);
    } finally {
      if (prev === undefined) {
        delete process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT;
      } else {
        process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT = prev;
      }
    }
  });

  it("does not append transcript_tail for passed rows when env is set", () => {
    const prev = process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT;
    process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT = "1";
    try {
      const report = generateLiveAiConversationReport({
        reportType: "motivation",
        runId: "run-pass",
        generatedAt: "2026-03-29T14:00:00.000Z",
        generatedAtStamp: "20260329T140000Z",
        suiteDepth: "smoke",
        targetEnv: "local",
        rows: [rows[0]],
      });
      expect(report.markdown).not.toMatch(/#### transcript_tail/);
    } finally {
      if (prev === undefined) {
        delete process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT;
      } else {
        process.env.LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT = prev;
      }
    }
  });
});
