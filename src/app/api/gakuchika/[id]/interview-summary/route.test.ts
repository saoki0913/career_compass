import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbSelectMock,
  dbUpdateMock,
  dbTransactionMock,
  enforceRateLimitLayersMock,
  getCsrfFailureReasonMock,
  getIdentityMock,
  guardDailyTokenLimitMock,
  safeParseConversationStateMock,
  safeParseMessagesMock,
  serializeConversationStateMock,
  generateGakuchikaSummaryWithTelemetryMock,
  computeTotalTokensMock,
  incrementDailyTokenCountMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
  logErrorMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getCsrfFailureReasonMock: vi.fn(),
  getIdentityMock: vi.fn(),
  guardDailyTokenLimitMock: vi.fn(),
  safeParseConversationStateMock: vi.fn(),
  safeParseMessagesMock: vi.fn(),
  serializeConversationStateMock: vi.fn(),
  generateGakuchikaSummaryWithTelemetryMock: vi.fn(),
  computeTotalTokensMock: vi.fn(() => 0),
  incrementDailyTokenCountMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/bff/identity/llm-cost-guard", () => ({
  guardDailyTokenLimit: guardDailyTokenLimitMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/bff/gakuchika/summary-server", () => ({
  generateGakuchikaSummaryWithTelemetry: generateGakuchikaSummaryWithTelemetryMock,
}));

vi.mock("@/lib/llm-cost-limit", () => ({
  computeTotalTokens: computeTotalTokensMock,
  incrementDailyTokenCount: incrementDailyTokenCountMock,
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: getCsrfFailureReasonMock,
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: reserveCreditsMock,
  confirmReservation: confirmReservationMock,
  cancelReservation: cancelReservationMock,
  FEEDBACK_SUMMARY_CREDIT_COST: 6,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

vi.mock("@/bff/gakuchika", () => ({
  getIdentity: getIdentityMock,
  isInterviewReady: (state: { stage?: string; draftText?: string | null } | null) =>
    state?.stage === "interview_ready" && Boolean(state.draftText),
  safeParseConversationState: safeParseConversationStateMock,
  safeParseMessages: safeParseMessagesMock,
  serializeConversationState: serializeConversationStateMock,
}));

function makeSelectResult(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function mockCompletedConversation(draftDocumentId: string) {
  safeParseConversationStateMock.mockReturnValue({
    stage: "interview_ready",
    draftText: "本文",
    draftDocumentId,
    summaryStale: false,
  });
  dbSelectMock
    .mockReturnValueOnce(makeSelectResult([{
      id: "g-1",
      userId: "user-1",
      title: "学園祭",
      summary: JSON.stringify({
        summary: "別セッションのまとめ",
        key_points: [],
        numbers: [],
        strengths: [],
        source_session_id: "c-other",
        source_draft_document_id: "doc-other",
      }),
    }]))
    .mockReturnValueOnce(makeSelectResult([{ id: "c-1", gakuchikaId: "g-1", messages: "[]" }]));
}

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/gakuchika/g-1/interview-summary", {
    method: "POST",
    body: JSON.stringify({ sessionId: "c-1" }),
  });
}

describe("api/gakuchika/[id]/interview-summary", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    getIdentityMock.mockReset();
    guardDailyTokenLimitMock.mockReset();
    safeParseConversationStateMock.mockReset();
    safeParseMessagesMock.mockReset();
    serializeConversationStateMock.mockReset();
    generateGakuchikaSummaryWithTelemetryMock.mockReset();
    computeTotalTokensMock.mockClear();
    incrementDailyTokenCountMock.mockReset();
    dbTransactionMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getCsrfFailureReasonMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    logErrorMock.mockReset();

    getCsrfFailureReasonMock.mockReturnValue(null);
    getIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    guardDailyTokenLimitMock.mockResolvedValue(null);
    enforceRateLimitLayersMock.mockResolvedValue(null);
    safeParseMessagesMock.mockReturnValue([{ role: "user", content: "回答" }]);
    serializeConversationStateMock.mockImplementation((value) => JSON.stringify(value));
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "r-1", newBalance: 44 });
    confirmReservationMock.mockResolvedValue({ confirmed: true });
    cancelReservationMock.mockResolvedValue({ canceled: true, refundedAmount: 6 });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
    dbTransactionMock.mockImplementation(async (callback) => {
      await callback({
        update: dbUpdateMock,
      });
    });
  });

  it("returns an existing summary without a new LLM call or charge when it is fresh", async () => {
    safeParseConversationStateMock.mockReturnValue({
      stage: "interview_ready",
      draftText: "本文",
      draftDocumentId: "doc-1",
      summaryStale: false,
    });
    dbSelectMock
      .mockReturnValueOnce(makeSelectResult([{
        id: "g-1",
        userId: "user-1",
        title: "学園祭",
        summary: JSON.stringify({
          summary: "既存のまとめ",
          key_points: [],
          numbers: [],
          strengths: [],
          source_session_id: "c-1",
          source_draft_document_id: "doc-1",
        }),
      }]))
      .mockReturnValueOnce(makeSelectResult([{ id: "c-1", gakuchikaId: "g-1", messages: "[]" }]));

    const { POST } = await import("@/bff/gakuchika/[id]/interview-summary/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "g-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.summary).toEqual(expect.objectContaining({ summary: "既存のまとめ" }));
    expect(generateGakuchikaSummaryWithTelemetryMock).not.toHaveBeenCalled();
    expect(guardDailyTokenLimitMock).not.toHaveBeenCalled();
    // キャッシュ命中は予約しない（非課金）
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("regenerates and charges 6 credits when LLM generation and save succeed", async () => {
    mockCompletedConversation("doc-current");
    generateGakuchikaSummaryWithTelemetryMock.mockResolvedValue({
      summary: { summary: "新しいまとめ", key_points: [], numbers: [], strengths: [] },
      telemetry: { input_tokens_total: 10, output_tokens_total: 20 },
      source: "llm",
    });
    computeTotalTokensMock.mockReturnValue(30);

    const { POST } = await import("@/bff/gakuchika/[id]/interview-summary/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "g-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.summary).toEqual(expect.objectContaining({ summary: "新しいまとめ" }));
    // 成功時のみ消費: 予約 → 保存 → confirm の順
    expect(reserveCreditsMock).toHaveBeenCalledWith("user-1", 6, "gakuchika_summary", "g-1", expect.any(String));
    expect(dbTransactionMock).toHaveBeenCalled();
    expect(confirmReservationMock).toHaveBeenCalledWith("r-1");
    expect(cancelReservationMock).not.toHaveBeenCalled();
    expect(incrementDailyTokenCountMock).toHaveBeenCalledWith({ userId: "user-1", guestId: null }, 30);
  });

  it("does not charge when the summary is a fallback (LLM unavailable)", async () => {
    mockCompletedConversation("doc-current");
    generateGakuchikaSummaryWithTelemetryMock.mockResolvedValue({
      summary: { summary: "簡易まとめ", key_points: [], numbers: [], strengths: [] },
      telemetry: null,
      source: "fallback",
    });

    const { POST } = await import("@/bff/gakuchika/[id]/interview-summary/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "g-1" }) });

    expect(response.status).toBe(200);
    // fallback は予約をキャンセル（非課金）
    expect(reserveCreditsMock).toHaveBeenCalled();
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
    expect(confirmReservationMock).not.toHaveBeenCalled();
  });

  it("cancels the reservation when confirmation fails (no charge)", async () => {
    mockCompletedConversation("doc-current");
    generateGakuchikaSummaryWithTelemetryMock.mockResolvedValue({
      summary: { summary: "新しいまとめ", key_points: [], numbers: [], strengths: [] },
      telemetry: null,
      source: "llm",
    });
    confirmReservationMock.mockRejectedValue(new Error("confirm failed"));

    const { POST } = await import("@/bff/gakuchika/[id]/interview-summary/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "g-1" }) });

    expect(response.status).toBe(200);
    expect(confirmReservationMock).toHaveBeenCalledWith("r-1");
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
  });

  it("rejects interview summary generation before draft-backed interview readiness", async () => {
    safeParseConversationStateMock.mockReturnValue({
      stage: "interview_ready",
      draftText: null,
      summaryStale: true,
    });
    dbSelectMock
      .mockReturnValueOnce(makeSelectResult([{ id: "g-1", userId: "user-1", title: "学園祭", summary: null }]))
      .mockReturnValueOnce(makeSelectResult([{ id: "c-1", gakuchikaId: "g-1", messages: "[]" }]));

    const { POST } = await import("@/bff/gakuchika/[id]/interview-summary/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "g-1" }) });

    expect(response.status).toBe(409);
    expect(generateGakuchikaSummaryWithTelemetryMock).not.toHaveBeenCalled();
    // 準備不足は予約しない（非課金）
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects missing CSRF before resolving identity", async () => {
    getCsrfFailureReasonMock.mockReturnValue("missing_token");

    const { POST } = await import("@/bff/gakuchika/[id]/interview-summary/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "g-1" }) });

    expect(response.status).toBe(403);
    expect(getIdentityMock).not.toHaveBeenCalled();
    expect(generateGakuchikaSummaryWithTelemetryMock).not.toHaveBeenCalled();
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });
});
