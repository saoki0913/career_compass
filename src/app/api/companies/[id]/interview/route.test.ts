import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock(".", () => ({
  buildInterviewContext: buildInterviewContextMock,
}));

vi.mock("./persistence-errors", () => ({
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponse: createInterviewPersistenceUnavailableResponseMock,
}));

vi.mock("@/lib/credits", () => ({
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST: 6,
  INTERVIEW_CONTINUE_CREDIT_COST: 1,
  INTERVIEW_START_CREDIT_COST: 2,
  INTERVIEW_TURN_CREDIT_COST: 1,
}));

describe("api/companies/[id]/interview", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
    buildInterviewContextMock.mockResolvedValue({
      company: { id: "company-1", name: "テスト株式会社", industry: "商社" },
      companySummary: "テスト株式会社 / 商社",
      motivationSummary: "志望動機",
      gakuchikaSummary: null,
      academicSummary: null,
      researchSummary: null,
      esSummary: null,
      materials: [{ label: "志望動機", text: "志望動機", kind: "motivation" }],
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
      conversation: null,
    });
  });

  it("returns model metadata that matches the interview backend defaults", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview"),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toEqual({
      plan: "GPT-5.4",
      question: "Claude Haiku 4.5",
      feedback: "Claude Sonnet 4.6",
    });
    expect(data.questionModel).toBe("Claude Haiku 4.5");
    expect(data.feedbackModel).toBe("Claude Sonnet 4.6");
    expect(data.billingCosts).toEqual({
      start: 2,
      turn: 1,
      continue: 1,
      feedback: 6,
    });
    expect(data.materialReadiness).toMatchObject({
      status: "partial",
      items: expect.arrayContaining([
        expect.objectContaining({ key: "motivation", ready: true }),
        expect.objectContaining({ key: "gakuchika", ready: false }),
      ]),
    });
    expect(data.sessionState).toMatchObject({
      status: "setup_pending",
      isActive: false,
      questionCount: 0,
    });
  });

  it("returns 503 when interview persistence schema is unavailable", async () => {
    const { GET } = await import("./route");
    const dbError = new Error("relation does not exist");
    const normalized = {
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:get",
      missingTables: ["interview_conversations"],
    };
    buildInterviewContextMock.mockRejectedValue(dbError);
    normalizeInterviewPersistenceErrorMock.mockReturnValue(normalized);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/interview"),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    expect(response.status).toBe(503);
    expect(normalizeInterviewPersistenceErrorMock).toHaveBeenCalledWith(dbError, {
      companyId: "company-1",
      operation: "interview:get",
    });
    expect(createInterviewPersistenceUnavailableResponseMock).toHaveBeenCalled();
  });
});
