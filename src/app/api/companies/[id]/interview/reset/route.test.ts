import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  resetInterviewConversationMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  resetInterviewConversationMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("..", () => ({
  buildInterviewContext: buildInterviewContextMock,
  resetInterviewConversation: resetInterviewConversationMock,
}));

vi.mock("../persistence-errors", () => ({
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponse: createInterviewPersistenceUnavailableResponseMock,
}));

vi.mock("@/lib/interview/session", () => ({
  createInitialInterviewTurnState: vi.fn(() => ({
    currentTopic: null,
    coverageState: [],
    coveredTopics: [],
    remainingTopics: [],
    turnCount: 0,
    recentQuestionSummariesV2: [],
    formatPhase: "opening",
    lastQuestion: null,
    lastAnswer: null,
    lastTopic: null,
    currentTurnMeta: null,
    nextAction: "ask",
  })),
  getInterviewStageStatus: vi.fn(() => ({
    currentTopicLabel: null,
    coveredTopics: [],
    remainingTopics: [],
  })),
}));

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
  feedbackHistories: [],
  conversation: {
    id: "conv-1",
    messages: [{ role: "assistant", content: "志望理由を教えてください。" }],
    questionCount: 1,
    stageStatus: { currentTopicLabel: null, coveredTopics: [], remainingTopics: [] },
    turnState: {
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
    },
    turnMeta: null,
    feedback: null,
    questionFlowCompleted: false,
    plan: null,
    isLegacySession: false,
  },
};

const makeRequest = (companyId = "company-1") =>
  new NextRequest(`http://localhost:3000/api/companies/${companyId}/interview/reset`, {
    method: "POST",
  });

describe("api/companies/[id]/interview/reset", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    resetInterviewConversationMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    buildInterviewContextMock.mockResolvedValue(BASE_CONTEXT);
    resetInterviewConversationMock.mockResolvedValue(undefined);
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
  });

  it("resets the conversation and returns setup_pending status for authenticated user", async () => {
    const { POST } = await import("./route");

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.conversation.status).toBe("setup_pending");
    expect(data.conversation.messages).toEqual([]);
    expect(data.conversation.questionCount).toBe(0);
    expect(resetInterviewConversationMock).toHaveBeenCalledWith("company-1", {
      userId: "user-1",
      guestId: null,
    });
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

  it("returns 404 (not 403) when the company context is not found", async () => {
    // This is the owned-company fail-closed pattern: if buildInterviewContext
    // returns null the user has no company record to reset — 404, not 403.
    // 403 would imply the resource exists but the user lacks permission.
    const { POST } = await import("./route");
    buildInterviewContextMock.mockResolvedValue(null);

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "unknown-company" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error.code).toBe("INTERVIEW_COMPANY_NOT_FOUND");
    expect(resetInterviewConversationMock).not.toHaveBeenCalled();
  });
});
