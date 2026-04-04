import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  listInterviewTurnEventsMock,
  saveInterviewConversationProgressMock,
  saveInterviewTurnEventMock,
  normalizeInterviewPlanValueMock,
  validateInterviewTurnStateMock,
  createInterviewUpstreamStreamMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  listInterviewTurnEventsMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
  saveInterviewTurnEventMock: vi.fn(),
  normalizeInterviewPlanValueMock: vi.fn(),
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
  listInterviewTurnEvents: listInterviewTurnEventsMock,
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

describe("api/companies/[id]/interview/stream", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    listInterviewTurnEventsMock.mockReset();
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewTurnEventMock.mockReset();
    normalizeInterviewPlanValueMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
    buildInterviewContextMock.mockResolvedValue({
      company: { id: "company-1", name: "テスト株式会社" },
      companySummary: "企業情報",
      motivationSummary: "志望動機",
      gakuchikaSummary: "ガクチカ",
      academicSummary: "ゼミで海外市場を研究。",
      researchSummary: null,
      esSummary: "ES",
      materials: [{ label: "企業固有論点", text: "配属理解", kind: "company_seed" }],
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
      },
      feedbackHistories: [],
      conversation: {
        id: "conv-1",
        status: "in_progress",
        messages: [
          { role: "assistant", content: "自己紹介をお願いします。" },
          { role: "user", content: "A1" },
        ],
        plan: {
          interviewType: "new_grad_behavioral",
          priorityTopics: ["自己紹介", "志望動機"],
          openingTopic: "自己紹介",
          mustCoverTopics: ["志望動機"],
          riskTopics: ["企業理解の浅さ"],
          suggestedTimeflow: ["導入", "深掘り"],
        },
        turnMeta: {
          topic: "自己紹介",
          turnAction: "deepen",
          focusReason: "人物把握",
          depthFocus: "概要",
          followupStyle: "broad",
          shouldMoveNext: false,
          interviewSetupNote: "初回は人物像を確認します。",
        },
        turnState: {
          turnCount: 1,
          currentTopic: "自己紹介",
          coverageState: [],
          coveredTopics: ["自己紹介"],
          remainingTopics: ["志望動機"],
          recentQuestionSummariesV2: [],
          formatPhase: "opening",
          lastQuestion: "自己紹介をお願いします。",
          lastAnswer: "A1",
          lastTopic: "自己紹介",
          currentTurnMeta: null,
          nextAction: "ask",
        },
        stageStatus: {
          currentTopicLabel: "自己紹介",
          coveredTopics: ["自己紹介"],
          remainingTopics: ["志望動機"],
        },
        questionCount: 1,
        questionFlowCompleted: false,
        feedback: null,
      },
    });
    validateInterviewTurnStateMock.mockImplementation((value: unknown) => value);
    normalizeInterviewPlanValueMock.mockImplementation((value: unknown) => value);
    listInterviewTurnEventsMock.mockResolvedValue([]);
    createInterviewUpstreamStreamMock.mockResolvedValue(new Response("ok"));
  });

  it("sends the new answer while keeping the persisted conversation as source of truth", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/companies/company-1/interview/stream", {
      method: "POST",
      body: JSON.stringify({ answer: "A2" }),
      headers: { "content-type": "application/json" },
    });

    await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(createInterviewUpstreamStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamPath: "/api/interview/turn",
        upstreamPayload: expect.objectContaining({
          academic_summary: "ゼミで海外市場を研究。",
          selected_industry: "商社",
          selected_role: "事業企画",
          role_track: "biz_general",
          interview_format: "standard_behavioral",
          interview_plan: expect.objectContaining({
            openingTopic: "自己紹介",
          }),
          conversation_history: [
            { role: "assistant", content: "自己紹介をお願いします。" },
            { role: "user", content: "A1" },
            { role: "user", content: "A2" },
          ],
        }),
      }),
    );
  });

  it("rejects guest users before sending an interview answer", async () => {
    const { POST } = await import("./route");
    getRequestIdentityMock.mockResolvedValue({ userId: null, guestId: "guest-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/stream", {
        method: "POST",
        body: JSON.stringify({ answer: "A2" }),
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

  it("records a turn event after persisting the streamed turn", async () => {
    const { POST } = await import("./route");
    validateInterviewTurnStateMock.mockImplementation(() => ({
      turnCount: 2,
      currentTopic: "志望動機",
      coverageState: [],
      coveredTopics: ["自己紹介"],
      remainingTopics: ["志望動機"],
      recentQuestionSummariesV2: [{ turnId: "turn-2" }],
      formatPhase: "standard_main",
      lastQuestion: "なぜ当社ですか。",
      lastAnswer: "A2",
      lastTopic: "志望動機",
      currentTurnMeta: null,
      nextAction: "ask",
    }));

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/stream", {
        method: "POST",
        body: JSON.stringify({ answer: "A2" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    await onComplete({
      question: "なぜ当社ですか。",
      question_stage: "motivation_fit",
      turn_state: {},
      turn_meta: { topic: "志望動機", turn_action: "deepen" },
    });

    expect(saveInterviewTurnEventMock).toHaveBeenCalled();
    expect(saveInterviewTurnEventMock.mock.calls[0]?.[0]).toMatchObject({
      companyId: "company-1",
      answer: "A2",
    });
  });

  it("returns 503 when interview persistence is unavailable", async () => {
    const { POST } = await import("./route");
    const dbError = new Error("relation does not exist");
    buildInterviewContextMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:stream",
      missingTables: ["interview_conversations"],
    });

    const response = await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/stream", {
        method: "POST",
        body: JSON.stringify({ answer: "A2" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(response.status).toBe(503);
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });
});
