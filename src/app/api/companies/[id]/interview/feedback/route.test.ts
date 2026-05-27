import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  listInterviewTurnEventsMock,
  normalizeInterviewPlanValueMock,
  saveInterviewConversationProgressTxMock,
  saveInterviewFeedbackHistoryTxMock,
  saveInterviewFeedbackSheetMock,
  validateInterviewTurnStateMock,
  createInterviewUpstreamStreamMock,
  reserveCreditsMock,
  confirmReservationInTxMock,
  cancelReservationMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
  transactionMock,
  logErrorMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  listInterviewTurnEventsMock: vi.fn(),
  normalizeInterviewPlanValueMock: vi.fn(),
  saveInterviewConversationProgressTxMock: vi.fn(),
  saveInterviewFeedbackHistoryTxMock: vi.fn(),
  saveInterviewFeedbackSheetMock: vi.fn(),
  validateInterviewTurnStateMock: vi.fn(),
  createInterviewUpstreamStreamMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationInTxMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
  transactionMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

const fakeTx = { __tx: "interview-feedback" } as never;

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));
vi.mock("@/bff/identity/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn(async () => null),
}));

vi.mock("..", () => ({
  buildInterviewContext: buildInterviewContextMock,
  listInterviewTurnEvents: listInterviewTurnEventsMock,
  normalizeInterviewPlanValue: normalizeInterviewPlanValueMock,
  saveInterviewConversationProgressTx: saveInterviewConversationProgressTxMock,
  saveInterviewFeedbackHistoryTx: saveInterviewFeedbackHistoryTxMock,
  validateInterviewTurnState: validateInterviewTurnStateMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

vi.mock("../stream-utils", () => ({
  createInterviewUpstreamStream: createInterviewUpstreamStreamMock,
  normalizeFeedback: vi.fn((value: unknown) => value),
}));

vi.mock("@/lib/interview/persistence", () => ({
  saveInterviewFeedbackSheet: saveInterviewFeedbackSheetMock,
}));

vi.mock("@/lib/interview/sheet-builder", () => ({
  buildInterviewSheetData: vi.fn(() => ({ companyName: "テスト株式会社", scores: [] })),
  buildInterviewSheetMarkdown: vi.fn(() => "# Sheet Markdown"),
}));

vi.mock("@/lib/credits", () => ({
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST: 6,
  reserveCredits: reserveCreditsMock,
  confirmReservationInTx: confirmReservationInTxMock,
  cancelReservation: cancelReservationMock,
}));

vi.mock("../persistence-errors", () => ({
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponse: createInterviewPersistenceUnavailableResponseMock,
}));

describe("api/companies/[id]/interview/feedback", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    listInterviewTurnEventsMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    saveInterviewConversationProgressTxMock.mockReset();
    saveInterviewFeedbackHistoryTxMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationInTxMock.mockReset();
    cancelReservationMock.mockReset();
    saveInterviewFeedbackSheetMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();
    transactionMock.mockReset();
    logErrorMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    confirmReservationInTxMock.mockResolvedValue({ confirmed: true, balanceAfter: 4 });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx));
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
    listInterviewTurnEventsMock.mockResolvedValue([
      {
        id: "event-1",
        turnId: "turn-8",
        question: "なぜ当社なのですか。",
        answer: "事業投資を通じて社会実装まで担いたいからです。",
        topic: "motivation_fit",
        questionType: "motivation_fit",
        turnAction: "deepen",
        followupStyle: "company_reason_check",
        intentKey: "motivation_fit:company_reason_check",
        coverageChecklistSnapshot: {},
        deterministicCoveragePassed: false,
        llmCoverageHint: "partial",
        formatPhase: "standard_main",
        formatGuardApplied: null,
        createdAt: "2026-04-02T00:00:00.000Z",
      },
    ]);
    normalizeInterviewPlanValueMock.mockImplementation((value: unknown) => value);
    validateInterviewTurnStateMock.mockImplementation((value: unknown) => value);
    buildInterviewContextMock.mockResolvedValue({
      company: { id: "company-1", name: "テスト株式会社" },
      companySummary: "企業情報",
      motivationSummary: "志望動機",
      gakuchikaSummary: "ガクチカ",
      academicSummary: "ゼミで産業政策を研究。",
      researchSummary: null,
      esSummary: "ES",
      materials: [],
      setup: {
        selectedIndustry: "商社",
        selectedRole: "事業企画",
        selectedRoleSource: "company_override",
        roleTrack: "biz_general",
        interviewFormat: "standard_behavioral",
        selectionType: "fulltime",
        interviewStage: "final",
        interviewerType: "executive",
        strictnessMode: "strict",
      },
      feedbackHistories: [],
      conversation: {
        id: "conv-1",
        questionCount: 10,
        stageStatus: { currentTopicLabel: "志望度", coveredTopics: ["motivation_fit"], remainingTopics: [] },
        turnState: {
          turnCount: 10,
          currentTopic: "motivation_fit",
          coveredTopics: ["motivation_fit"],
          remainingTopics: [],
          recentQuestionSummaries: ["志望度の深掘り"],
          lastQuestion: "なぜ当社なのですか。",
          lastAnswer: "事業投資を通じて社会実装まで担いたいからです。",
          lastTopic: "motivation_fit",
          currentTurnMeta: null,
          nextAction: "feedback",
        },
        messages: [
          { role: "assistant", content: "Q1" },
          { role: "user", content: "A1" },
        ],
      },
    });
    saveInterviewFeedbackSheetMock.mockResolvedValue({ id: "history-1" });
    createInterviewUpstreamStreamMock.mockResolvedValue(new Response("ok"));
  });

  it("uses the dedicated feedback endpoint and reserves six credits up front", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
      method: "POST",
    });

    await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(reserveCreditsMock).toHaveBeenCalledWith(
      "user-1",
      6,
      "interview_feedback",
      "company-1",
      "面接対策講評: テスト株式会社",
    );
    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamPath: "/api/interview/feedback",
        upstreamPayload: expect.objectContaining({
          selected_industry: "商社",
          selected_role: "事業企画",
          role_track: "biz_general",
          interview_format: "standard_behavioral",
          selection_type: "fulltime",
          interview_stage: "final",
          interviewer_type: "executive",
          strictness_mode: "strict",
          academic_summary: "ゼミで産業政策を研究。",
          turn_events: expect.any(Array),
        }),
      }),
    );
  });

  it("returns 503 when interview persistence is unavailable", async () => {
    const { POST } = await import("./route");
    const dbError = new Error("relation does not exist");
    buildInterviewContextMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:feedback",
      missingTables: ["interview_feedback_histories"],
    });

    const response = await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(response.status).toBe(503);
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });

  it("rejects guest users before reserving credits", async () => {
    const { POST } = await import("./route");
    getRequestIdentityMock.mockResolvedValue({ userId: null, guestId: "guest-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("INTERVIEW_AUTH_REQUIRED");
    expect(data.error.userMessage).toBe("ログインが必要です。");
    expect(data.error.action).toBe("ログインしてから、もう一度お試しください。");
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("confirms credits only after interview feedback persistence succeeds", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressTxMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryTxMock.mockResolvedValue([{ id: "history-1" }]);

    await onComplete({
      overall_comment: "講評",
      strengths: ["深掘り"],
      improvements: ["具体性"],
      weakest_turn_id: "turn-4",
      weakest_question_snapshot: "なぜ当社なのですか。",
      weakest_answer_snapshot: "事業に魅力を感じたからです。",
      improved_answer: "改善回答",
      next_preparation: ["準備"],
      consistency_risks: ["他社比較が薄い"],
      weakest_question_type: "motivation",
      scores: { logic: 4, credibility: 3, role_fit: 4, consistency: 3 },
      satisfaction_score: 4,
      score_evidence_by_axis: { logic: ["順序立てて説明"] },
      score_rationale_by_axis: { logic: "構造は明確です。" },
      confidence_by_axis: { logic: "medium" },
    });

    // progress + feedbackHistory + confirm all run inside one transaction.
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(saveInterviewConversationProgressTxMock).toHaveBeenCalledWith(fakeTx, expect.anything());
    expect(saveInterviewFeedbackHistoryTxMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        feedback: expect.objectContaining({
          weakest_turn_id: "turn-4",
          weakest_question_snapshot: "なぜ当社なのですか。",
          weakest_answer_snapshot: "事業に魅力を感じたからです。",
          satisfaction_score: 4,
          score_evidence_by_axis: { logic: ["順序立てて説明"] },
          score_rationale_by_axis: { logic: "構造は明確です。" },
          confidence_by_axis: { logic: "medium" },
        }),
      }),
    );
    expect(confirmReservationInTxMock).toHaveBeenCalledWith(fakeTx, "res-1");
    expect(confirmReservationInTxMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      saveInterviewFeedbackHistoryTxMock.mock.invocationCallOrder[0],
    );
  });

  it("cancels the reservation when feedback persistence fails", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressTxMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryTxMock.mockRejectedValue(new Error("write failed"));

    await expect(
      onComplete({
        overall_comment: "講評",
        strengths: [],
        improvements: [],
        improved_answer: "",
        next_preparation: [],
        consistency_risks: [],
        weakest_question_type: "motivation",
        scores: {},
      }),
    ).rejects.toThrow("write failed");

    expect(confirmReservationInTxMock).not.toHaveBeenCalled();
    expect(cancelReservationMock).toHaveBeenCalledWith("res-1");
  });

  it("cancels the reservation when confirmation fails after feedback persistence", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressTxMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryTxMock.mockResolvedValue([{ id: "history-1" }]);
    confirmReservationInTxMock.mockRejectedValueOnce(new Error("confirm failed"));

    await expect(
      onComplete({
        overall_comment: "講評",
        strengths: [],
        improvements: [],
        improved_answer: "",
        next_preparation: [],
        consistency_risks: [],
        weakest_question_type: "motivation",
        scores: {},
      }),
    ).rejects.toThrow("confirm failed");

    expect(cancelReservationMock).toHaveBeenCalledWith("res-1");
    // Sheet generation is skipped when the charge transaction rolled back.
    expect(saveInterviewFeedbackSheetMock).not.toHaveBeenCalled();
  });

  it("builds and saves the sheet after confirming credits (outside the charge transaction)", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressTxMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryTxMock.mockResolvedValue([{ id: "history-1" }]);

    await onComplete({
      overall_comment: "講評",
      strengths: [],
      improvements: [],
      improved_answer: "",
      next_preparation: [],
      consistency_risks: [],
      weakest_question_type: "motivation",
      scores: {},
    });

    expect(saveInterviewFeedbackSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        historyId: "history-1",
        sheetContent: "# Sheet Markdown",
        sheetDataJson: expect.objectContaining({ companyName: "テスト株式会社" }),
      }),
    );
    // The sheet save runs after the charge (confirm), not before, so it sits
    // outside the refundable transaction.
    expect(saveInterviewFeedbackSheetMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      confirmReservationInTxMock.mock.invocationCallOrder[0],
    );
  });

  it("keeps the credit charged and logs when sheet save fails (sheet is regenerable, no refund)", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressTxMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryTxMock.mockResolvedValue([{ id: "history-1" }]);
    saveInterviewFeedbackSheetMock.mockRejectedValue(new Error("sheet write failed"));

    // The feedback completes successfully despite the sheet failing — the sheet
    // is regenerable, so we never refund a confirmed charge for it.
    await expect(
      onComplete({
        overall_comment: "講評",
        strengths: [],
        improvements: [],
        improved_answer: "",
        next_preparation: [],
        consistency_risks: [],
        weakest_question_type: "motivation",
        scores: {},
      }),
    ).resolves.toBeTruthy();

    expect(confirmReservationInTxMock).toHaveBeenCalledWith(fakeTx, "res-1");
    expect(cancelReservationMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalled();
  });

  it("cancels the reservation when the upstream stream aborts or errors", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onAbort, onError }] = createInterviewUpstreamStreamMock.mock.calls[0];

    await onAbort();
    await onError();

    expect(cancelReservationMock).toHaveBeenCalledWith("res-1");
    expect(cancelReservationMock).toHaveBeenCalledTimes(2);
  });
});
