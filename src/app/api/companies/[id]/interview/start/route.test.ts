import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  ensureInterviewConversationMock,
  normalizeInterviewPlanValueMock,
  resetInterviewConversationMock,
  saveInterviewConversationProgressMock,
  saveInterviewTurnEventMock,
  validateInterviewTurnStateMock,
  createInterviewUpstreamStreamMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  ensureInterviewConversationMock: vi.fn(),
  normalizeInterviewPlanValueMock: vi.fn(),
  resetInterviewConversationMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
  saveInterviewTurnEventMock: vi.fn(),
  validateInterviewTurnStateMock: vi.fn(),
  createInterviewUpstreamStreamMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("../shared", () => ({
  buildInterviewContext: buildInterviewContextMock,
  ensureInterviewConversation: ensureInterviewConversationMock,
  normalizeInterviewPlanValue: normalizeInterviewPlanValueMock,
  resetInterviewConversation: resetInterviewConversationMock,
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

describe("api/companies/[id]/interview/start", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    ensureInterviewConversationMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    resetInterviewConversationMock.mockReset();
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewTurnEventMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    buildInterviewContextMock.mockResolvedValue({
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
      conversation: null,
    });
    ensureInterviewConversationMock.mockResolvedValue({ id: "conv-1" });
    normalizeInterviewPlanValueMock.mockImplementation((value: unknown) => value);
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
  });

  it("returns 503 when conversation persistence is unavailable during start", async () => {
    const { POST } = await import("./route");
    const dbError = new Error("relation does not exist");
    const normalized = {
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:start",
      missingTables: ["interview_conversations"],
    };
    ensureInterviewConversationMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue(normalized);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
        method: "POST",
        body: JSON.stringify({
          selectedIndustry: "商社",
          selectedRole: "総合職",
          roleTrack: "biz_general",
          interviewFormat: "standard_behavioral",
          selectionType: "fulltime",
          interviewStage: "mid",
          interviewerType: "line_manager",
          strictnessMode: "standard",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(response.status).toBe(503);
    expect(normalizeInterviewPersistenceErrorMock).toHaveBeenCalledWith(dbError, {
      companyId: "company-1",
      operation: "interview:start",
    });
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });

  it("rejects guest users before starting interview setup", async () => {
    const { POST } = await import("./route");
    getRequestIdentityMock.mockResolvedValue({ userId: null, guestId: "guest-1" });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
        method: "POST",
        body: JSON.stringify({
          selectedIndustry: "商社",
          selectedRole: "総合職",
          interviewFormat: "standard_behavioral",
          selectionType: "fulltime",
          interviewStage: "mid",
          interviewerType: "line_manager",
          strictnessMode: "standard",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("INTERVIEW_AUTH_REQUIRED");
    expect(data.error.userMessage).toBe("ログインが必要です。");
    expect(data.error.action).toBe("ログインしてから、もう一度お試しください。");
    expect(buildInterviewContextMock).not.toHaveBeenCalled();
  });

  it("requires the v2 setup fields before starting", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
        method: "POST",
        body: JSON.stringify({ selectedIndustry: "商社", selectedRole: "事業企画" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("sends the full setup and academic summary to the new start flow", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
        method: "POST",
        body: JSON.stringify({
          selectedIndustry: "商社",
          selectedRole: "事業企画",
          roleTrack: "biz_general",
          interviewFormat: "standard_behavioral",
          selectionType: "fulltime",
          interviewStage: "mid",
          interviewerType: "line_manager",
          strictnessMode: "standard",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamPath: "/api/interview/start",
        upstreamPayload: expect.objectContaining({
          selected_industry: "商社",
          selected_role: "事業企画",
          role_track: "biz_general",
          interview_format: "standard_behavioral",
          selection_type: "fulltime",
          interview_stage: "mid",
          interviewer_type: "line_manager",
          strictness_mode: "standard",
          academic_summary: "ゼミで地域金融を研究。",
        }),
      }),
    );
  });

  it("resets an existing conversation before starting a new interview", async () => {
    const { POST } = await import("./route");
    buildInterviewContextMock.mockResolvedValueOnce({
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
        id: "legacy-conv",
        messages: [{ role: "assistant", content: "旧質問" }],
        questionCount: 1,
        stageStatus: { currentTopicLabel: null, coveredTopics: [], remainingTopics: [] },
        turnState: {
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
        },
        turnMeta: null,
        feedback: null,
        questionFlowCompleted: false,
        plan: null,
        isLegacySession: false,
      },
    });

    await POST(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
        method: "POST",
        body: JSON.stringify({
          selectedIndustry: "商社",
          selectedRole: "事業企画",
          roleTrack: "biz_general",
          interviewFormat: "standard_behavioral",
          selectionType: "fulltime",
          interviewStage: "mid",
          interviewerType: "line_manager",
          strictnessMode: "standard",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(resetInterviewConversationMock).toHaveBeenCalledWith("company-1", { userId: "user-1", guestId: null });
    expect(createInterviewUpstreamStreamMock).toHaveBeenCalled();
  });
});
