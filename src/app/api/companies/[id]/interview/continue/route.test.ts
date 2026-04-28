import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  normalizeInterviewPlanValueMock,
  saveInterviewConversationProgressMock,
  saveInterviewTurnEventMock,
  validateInterviewTurnStateMock,
  createInterviewUpstreamStreamMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  normalizeInterviewPlanValueMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
  saveInterviewTurnEventMock: vi.fn(),
  validateInterviewTurnStateMock: vi.fn(),
  createInterviewUpstreamStreamMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/app/api/_shared/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn(async () => null),
}));

vi.mock("..", () => ({
  buildInterviewContext: buildInterviewContextMock,
  normalizeInterviewPlanValue: normalizeInterviewPlanValueMock,
  saveInterviewConversationProgress: saveInterviewConversationProgressMock,
  saveInterviewTurnEvent: saveInterviewTurnEventMock,
  validateInterviewTurnState: validateInterviewTurnStateMock,
}));

vi.mock("../stream-utils", () => ({
  createInterviewUpstreamStream: createInterviewUpstreamStreamMock,
}));

vi.mock("../persistence-errors", () => ({
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponse: createInterviewPersistenceUnavailableResponseMock,
}));

vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST: 6,
  INTERVIEW_CONTINUE_CREDIT_COST: 1,
  reserveCredits: reserveCreditsMock,
  confirmReservation: confirmReservationMock,
  cancelReservation: cancelReservationMock,
}));

const BASE_TURN_STATE = {
  currentTopic: null,
  coverageState: [],
  coveredTopics: [],
  remainingTopics: [],
  turnCount: 1,
  recentQuestionSummariesV2: [],
  formatPhase: "opening" as const,
  lastQuestion: null,
  lastAnswer: null,
  lastTopic: null,
  currentTurnMeta: null,
  nextAction: "ask" as const,
};

const BASE_CONTEXT = {
  company: { id: "company-1", name: "テスト株式会社" },
  companySummary: "企業情報",
  motivationSummary: "志望動機",
  gakuchikaSummary: "ガクチカ",
  academicSummary: "ゼミで地域金融を研究。",
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
    interviewStage: "mid",
    interviewerType: "line_manager",
    strictnessMode: "standard",
    resolvedIndustry: "商社",
    requiresIndustrySelection: false,
    industryOptions: ["商社"],
  },
  feedbackHistories: [
    {
      id: "fb-1",
      overallComment: "良い回答でした。",
      scores: { company_fit: 4, role_fit: 3, specificity: 3, logic: 4, persuasiveness: 3, consistency: 4, credibility: 3 },
      strengths: ["具体性"],
      improvements: ["論理性"],
      improvedAnswer: "改善例",
      nextPreparation: ["深掘り練習"],
      consistencyRisks: [],
      weakestQuestionType: null,
      weakestTurnId: null,
      weakestQuestionSnapshot: null,
      weakestAnswerSnapshot: null,
      premiseConsistency: null,
      satisfactionScore: null,
    },
  ],
  conversation: {
    id: "conv-1",
    status: "feedback_completed",
    messages: [
      { role: "assistant", content: "志望理由を教えてください。" },
      { role: "user", content: "顧客課題に近い立場で働きたいです。" },
    ],
    questionCount: 1,
    stageStatus: { currentTopicLabel: null, coveredTopics: [], remainingTopics: [] },
    turnState: BASE_TURN_STATE,
    turnMeta: null,
    feedback: null,
    questionFlowCompleted: false,
    plan: null,
    isLegacySession: false,
  },
};

const makeRequest = () =>
  new NextRequest("http://localhost:3000/api/companies/company-1/interview/continue", {
    method: "POST",
  });

describe("api/companies/[id]/interview/continue", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewTurnEventMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    buildInterviewContextMock.mockResolvedValue(BASE_CONTEXT);
    normalizeInterviewPlanValueMock.mockImplementation((value: unknown) => value);
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-continue-1" });
    createInterviewUpstreamStreamMock.mockReturnValue(
      new Response("data: ok\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
  });

  it("opens an SSE stream for an authenticated user with feedback history", async () => {
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(200);
    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamPath: "/api/interview/continue",
        upstreamPayload: expect.objectContaining({
          company_name: "テスト株式会社",
          conversation_history: BASE_CONTEXT.conversation.messages,
        }),
      }),
    );
  });

  it("rejects unauthenticated requests with 401", async () => {
    const { POST } = await import("./route");
    getRequestIdentityMock.mockResolvedValue({ userId: null, guestId: "guest-1" });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("INTERVIEW_AUTH_REQUIRED");
    expect(buildInterviewContextMock).not.toHaveBeenCalled();
  });

  it("returns 503 when persistence is unavailable during context load", async () => {
    const { POST } = await import("./route");
    const dbError = new Error("relation does not exist");
    const normalized = {
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:continue",
      missingTables: ["interview_conversations"],
    };
    buildInterviewContextMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue(normalized);

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(503);
    expect(normalizeInterviewPersistenceErrorMock).toHaveBeenCalledWith(dbError, {
      companyId: "company-1",
      operation: "interview:continue",
    });
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });

  it("returns 402 when the user has insufficient credits", async () => {
    const { POST } = await import("./route");
    reserveCreditsMock.mockResolvedValue({ success: false, reservationId: "", newBalance: 0 });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(402);
    expect(data.error.code).toBe("INTERVIEW_INSUFFICIENT_CREDITS");
    expect(reserveCreditsMock).toHaveBeenCalledWith(
      "user-1",
      1,
      "interview",
      "company-1",
      "面接対策続き: テスト株式会社",
    );
    expect(createInterviewUpstreamStreamMock).not.toHaveBeenCalled();
  });

  it("rejects non-feedback-completed sessions before reserving credits", async () => {
    const { POST } = await import("./route");
    buildInterviewContextMock.mockResolvedValueOnce({
      ...BASE_CONTEXT,
      conversation: {
        ...BASE_CONTEXT.conversation,
        status: "in_progress",
      },
    });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error.code).toBe("INTERVIEW_FEEDBACK_SESSION_REQUIRED");
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(createInterviewUpstreamStreamMock).not.toHaveBeenCalled();
  });

  it("rejects legacy feedback sessions before reserving credits", async () => {
    const { POST } = await import("./route");
    buildInterviewContextMock.mockResolvedValueOnce({
      ...BASE_CONTEXT,
      conversation: {
        ...BASE_CONTEXT.conversation,
        isLegacySession: true,
      },
    });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(409);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(createInterviewUpstreamStreamMock).not.toHaveBeenCalled();
  });

  it("confirms one reserved credit only after the continued question is persisted", async () => {
    const { POST } = await import("./route");

    await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    await onComplete({
      question: "講評で弱かった点をもう一度確認します。",
      turn_state: { turnCount: 2, currentTopic: "motivation_fit", nextAction: "ask" },
    });

    expect(saveInterviewConversationProgressMock.mock.invocationCallOrder[0]).toBeLessThan(
      confirmReservationMock.mock.invocationCallOrder[0],
    );
    expect(saveInterviewTurnEventMock.mock.invocationCallOrder[0]).toBeLessThan(
      confirmReservationMock.mock.invocationCallOrder[0],
    );
    expect(confirmReservationMock).toHaveBeenCalledWith("res-continue-1");
  });
});
