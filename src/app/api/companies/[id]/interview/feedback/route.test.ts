import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  saveInterviewConversationProgressMock,
  saveInterviewFeedbackHistoryMock,
  createInterviewUpstreamStreamMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
  normalizeInterviewPersistenceErrorMock,
  createInterviewPersistenceUnavailableResponseMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  saveInterviewConversationProgressMock: vi.fn(),
  saveInterviewFeedbackHistoryMock: vi.fn(),
  createInterviewUpstreamStreamMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
  createInterviewPersistenceUnavailableResponseMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("../shared", () => ({
  buildInterviewContext: buildInterviewContextMock,
  saveInterviewConversationProgress: saveInterviewConversationProgressMock,
  saveInterviewFeedbackHistory: saveInterviewFeedbackHistoryMock,
}));

vi.mock("../stream-utils", () => ({
  createInterviewUpstreamStream: createInterviewUpstreamStreamMock,
  normalizeFeedback: vi.fn((value: unknown) => value),
}));

vi.mock("@/lib/credits", () => ({
  DEFAULT_INTERVIEW_SESSION_CREDIT_COST: 6,
  reserveCredits: reserveCreditsMock,
  confirmReservation: confirmReservationMock,
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
    saveInterviewConversationProgressMock.mockReset();
    saveInterviewFeedbackHistoryMock.mockReset();
    createInterviewUpstreamStreamMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
    createInterviewPersistenceUnavailableResponseMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    createInterviewPersistenceUnavailableResponseMock.mockReturnValue(
      Response.json({ error: { code: "INTERVIEW_PERSISTENCE_UNAVAILABLE" } }, { status: 503 }),
    );
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
      },
      feedbackHistories: [],
      conversation: {
        id: "conv-1",
        questionCount: 10,
        stageStatus: { current: "feedback", completed: [], pending: [] },
        turnState: {
          currentStage: "feedback",
          totalQuestionCount: 10,
          stageQuestionCounts: {
            industry_reason: 1,
            role_reason: 1,
            opening: 1,
            experience: 3,
            company_understanding: 2,
            motivation_fit: 2,
          },
          completedStages: [
            "industry_reason",
            "role_reason",
            "opening",
            "experience",
            "company_understanding",
            "motivation_fit",
          ],
          lastQuestionFocus: "初期貢献",
          nextAction: "feedback",
        },
        messages: [
          { role: "assistant", content: "Q1" },
          { role: "user", content: "A1" },
        ],
      },
    });
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

  it("confirms credits only after interview feedback persistence succeeds", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryMock.mockResolvedValue([{ id: "history-1" }]);

    await onComplete({
      overallComment: "講評",
      strengths: ["深掘り"],
      improvements: ["具体性"],
      improvedAnswer: "改善回答",
      preparationPoints: ["準備"],
      scores: { logic: 4 },
    });

    expect(saveInterviewConversationProgressMock).toHaveBeenCalled();
    expect(saveInterviewFeedbackHistoryMock).toHaveBeenCalled();
    expect(confirmReservationMock).toHaveBeenCalledWith("res-1");
    expect(confirmReservationMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      saveInterviewFeedbackHistoryMock.mock.invocationCallOrder[0],
    );
  });

  it("does not confirm credits when feedback persistence fails", async () => {
    const { POST } = await import("./route");

    await POST(
      new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "company-1" }) },
    );

    const [{ onComplete }] = createInterviewUpstreamStreamMock.mock.calls[0];
    saveInterviewConversationProgressMock.mockResolvedValue(undefined);
    saveInterviewFeedbackHistoryMock.mockRejectedValue(new Error("write failed"));

    await expect(
      onComplete({
        overallComment: "講評",
        strengths: [],
        improvements: [],
        improvedAnswer: "",
        preparationPoints: [],
        scores: {},
      }),
    ).rejects.toThrow("write failed");

    expect(confirmReservationMock).not.toHaveBeenCalled();
  });
});
