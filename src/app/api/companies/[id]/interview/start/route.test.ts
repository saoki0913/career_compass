import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  ensureInterviewConversationMock,
  saveInterviewConversationProgressMock,
  validateInterviewTurnStateMock,
  createImmediateInterviewStreamMock,
  createInterviewUpstreamStreamMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  ensureInterviewConversationMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
  validateInterviewTurnStateMock: vi.fn(),
  createImmediateInterviewStreamMock: vi.fn(),
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
  saveInterviewConversationProgress: saveInterviewConversationProgressMock,
  validateInterviewTurnState: validateInterviewTurnStateMock,
}));

vi.mock("../stream-utils", () => ({
  createImmediateInterviewStream: createImmediateInterviewStreamMock,
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
    saveInterviewConversationProgressMock.mockReset();
    validateInterviewTurnStateMock.mockReset();
    createImmediateInterviewStreamMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    buildInterviewContextMock.mockResolvedValue({
      company: { id: "company-1", name: "テスト株式会社" },
      companySummary: "企業情報",
      motivationSummary: "志望動機",
      gakuchikaSummary: "ガクチカ",
      esSummary: "ES",
      materials: [],
      setup: {
        selectedIndustry: "商社",
        selectedRole: "総合職",
        selectedRoleSource: "company_override",
        resolvedIndustry: "商社",
        requiresIndustrySelection: false,
        industryOptions: ["商社"],
      },
      feedbackHistories: [],
      conversation: null,
    });
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
        body: JSON.stringify({ selectedIndustry: "商社", selectedRole: "総合職" }),
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
});
