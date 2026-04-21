import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  continueInterviewStream,
  fetchInterviewData,
  fetchInterviewRoleOptions,
  generateInterviewFeedbackStream,
  resetInterviewConversation,
  saveInterviewFeedbackSatisfaction,
  scoreInterviewDrill,
  sendInterviewAnswerStream,
  startInterviewDrill,
  startInterviewStream,
} from "./client-api";

describe("interview client api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  it("uses the existing interview route contract with credentials", async () => {
    const signal = new AbortController().signal;

    await fetchInterviewData("company-1");
    await fetchInterviewRoleOptions("company-1");
    await startInterviewStream("company-1", { selectedRole: "営業" }, signal);
    await sendInterviewAnswerStream("company-1", { answer: "回答" }, signal);
    await generateInterviewFeedbackStream("company-1", signal);
    await continueInterviewStream("company-1", signal);
    await resetInterviewConversation("company-1");
    await saveInterviewFeedbackSatisfaction("company-1", {
      historyId: "history-1",
      satisfactionScore: 4,
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/companies/company-1/interview", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/companies/company-1/es-role-options", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/companies/company-1/interview/start",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedRole: "営業" }),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/companies/company-1/interview/stream",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ answer: "回答" }),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/companies/company-1/interview/feedback",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/companies/company-1/interview/continue",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(7, "/api/companies/company-1/interview/reset", {
      method: "POST",
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      8,
      "/api/companies/company-1/interview/feedback/satisfaction",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: "history-1", satisfactionScore: 4 }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Stage 7: drill client helpers
// ---------------------------------------------------------------------------

describe("interview drill client api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("startInterviewDrill posts to /drill/start and parses the 4 fields + attemptId", async () => {
    const responseBody = {
      attemptId: "drill-1",
      whyWeak: "evidence が抽象的。",
      improvementPattern: "数字と固有名詞を加える。",
      modelRewrite: "模範回答です。",
      retryQuestion: "もう一度、具体例を添えて答えてください。",
      promptVersion: "2026-04-17",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await startInterviewDrill("company-1", {
      weakestTurnId: "turn-3",
      weakestQuestion: "なぜ当社ですか。",
      weakestAnswer: "理念に共感しました。",
      weakestAxis: "company_fit",
      originalScore: 2,
      weakestEvidence: ["理念に共感しました"],
      originalScores: { company_fit: 2 },
      originalFeedbackId: "fb-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/companies/company-1/interview/drill/start",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(result.attemptId).toBe("drill-1");
    expect(result.retryQuestion).toContain("もう一度");
  });

  it("startInterviewDrill throws with userMessage from error response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ userMessage: "ドリルに必要な情報が不足しています。" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      startInterviewDrill("company-1", {
        weakestTurnId: "turn-1",
        weakestQuestion: "q",
        weakestAnswer: "a",
        weakestAxis: "company_fit",
        originalScore: 2,
      }),
    ).rejects.toThrow("ドリルに必要な情報が不足しています。");
  });

  it("scoreInterviewDrill posts to /drill/score and parses delta scores", async () => {
    const responseBody = {
      attemptId: "drill-1",
      retryScores: {
        company_fit: 4,
        role_fit: 3,
        specificity: 4,
        logic: 3,
        persuasiveness: 3,
        consistency: 3,
        credibility: 3,
      },
      deltaScores: {
        company_fit: 2,
        role_fit: 0,
        specificity: 2,
        logic: 0,
        persuasiveness: 0,
        consistency: 0,
        credibility: 0,
      },
      rationale: "company_fit が +2 向上しました。",
      promptVersion: "2026-04-17",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoreInterviewDrill("company-1", {
      attemptId: "drill-1",
      retryAnswer: "書き直しました。",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/companies/company-1/interview/drill/score",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ attemptId: "drill-1", retryAnswer: "書き直しました。" }),
      }),
    );
    expect(result.deltaScores.company_fit).toBe(2);
    expect(result.rationale).toContain("company_fit");
  });
});
