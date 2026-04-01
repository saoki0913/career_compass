import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  saveInterviewConversationProgressMock,
  validateInterviewTurnStateMock,
  createInterviewUpstreamStreamMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
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
  saveInterviewConversationProgress: saveInterviewConversationProgressMock,
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
    saveInterviewConversationProgressMock.mockReset();
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
      esSummary: "ES",
      materials: [{ label: "企業固有論点", text: "配属理解", kind: "company_seed" }],
      setup: {
        selectedIndustry: "商社",
        selectedRole: "総合職",
        selectedRoleSource: "company_override",
      },
      feedbackHistories: [],
      conversation: {
        id: "conv-1",
        status: "in_progress",
        messages: [
          { role: "assistant", content: "Q1" },
          { role: "user", content: "A1" },
        ],
        turnState: {
          currentStage: "experience",
          totalQuestionCount: 2,
          stageQuestionCounts: {
            industry_reason: 1,
            role_reason: 1,
            opening: 0,
            experience: 0,
            company_understanding: 0,
            motivation_fit: 0,
          },
          completedStages: ["industry_reason", "role_reason"],
          lastQuestionFocus: "役割",
          nextAction: "ask",
        },
        stageStatus: {
          current: "experience",
          completed: ["industry_reason", "role_reason", "opening"],
          pending: ["company_understanding", "motivation_fit", "feedback"],
        },
        questionCount: 2,
        questionStage: "experience",
        questionFlowCompleted: false,
        feedback: null,
      },
    });
    validateInterviewTurnStateMock.mockImplementation((value: unknown) => value);
    createInterviewUpstreamStreamMock.mockResolvedValue(new Response("ok"));
  });

  it("sends the new answer while keeping the server-side conversation as source of truth", async () => {
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
          conversation_history: [
            { role: "assistant", content: "Q1" },
            { role: "user", content: "A1" },
            { role: "user", content: "A2" },
          ],
          selected_industry: "商社",
          selected_role: "総合職",
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
