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
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/app/api/_shared/llm-cost-guard", () => ({
  guardDailyTokenLimit: guardDailyTokenLimitMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/app/api/gakuchika/summary-server", () => ({
  generateGakuchikaSummaryWithTelemetry: generateGakuchikaSummaryWithTelemetryMock,
}));

vi.mock("@/lib/llm-cost-limit", () => ({
  computeTotalTokens: computeTotalTokensMock,
  incrementDailyTokenCount: incrementDailyTokenCountMock,
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: getCsrfFailureReasonMock,
}));

vi.mock("@/app/api/gakuchika", () => ({
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

    getCsrfFailureReasonMock.mockReturnValue(null);
    getIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    guardDailyTokenLimitMock.mockResolvedValue(null);
    enforceRateLimitLayersMock.mockResolvedValue(null);
    safeParseMessagesMock.mockReturnValue([{ role: "user", content: "回答" }]);
    serializeConversationStateMock.mockImplementation((value) => JSON.stringify(value));
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

  it("returns an existing summary without a new LLM call when it is fresh", async () => {
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

    const { POST } = await import("@/app/api/gakuchika/[id]/interview-summary/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/interview-summary", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.summary).toEqual(expect.objectContaining({ summary: "既存のまとめ" }));
    expect(generateGakuchikaSummaryWithTelemetryMock).not.toHaveBeenCalled();
    expect(guardDailyTokenLimitMock).not.toHaveBeenCalled();
  });

  it("regenerates instead of returning another session's cached summary", async () => {
    safeParseConversationStateMock.mockReturnValue({
      stage: "interview_ready",
      draftText: "本文",
      draftDocumentId: "doc-current",
      summaryStale: false,
    });
    generateGakuchikaSummaryWithTelemetryMock.mockResolvedValue({
      summary: {
        summary: "新しいまとめ",
        key_points: [],
        numbers: [],
        strengths: [],
      },
      telemetry: { input_tokens_total: 10, output_tokens_total: 20 },
    });
    computeTotalTokensMock.mockReturnValue(30);
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

    const { POST } = await import("@/app/api/gakuchika/[id]/interview-summary/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/interview-summary", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.summary).toEqual(expect.objectContaining({ summary: "新しいまとめ" }));
    expect(generateGakuchikaSummaryWithTelemetryMock).toHaveBeenCalledWith(
      "学園祭",
      "本文",
      [{ role: "user", content: "回答" }],
    );
    expect(computeTotalTokensMock).toHaveBeenCalledWith({ input_tokens_total: 10, output_tokens_total: 20 });
    expect(incrementDailyTokenCountMock).toHaveBeenCalledWith(
      { userId: "user-1", guestId: null },
      30,
    );
    expect(guardDailyTokenLimitMock).toHaveBeenCalled();
    expect(enforceRateLimitLayersMock).toHaveBeenCalled();
    expect(dbTransactionMock).toHaveBeenCalled();
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

    const { POST } = await import("@/app/api/gakuchika/[id]/interview-summary/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/interview-summary", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );

    expect(response.status).toBe(409);
    expect(generateGakuchikaSummaryWithTelemetryMock).not.toHaveBeenCalled();
  });

  it("rejects missing CSRF before resolving identity", async () => {
    getCsrfFailureReasonMock.mockReturnValue("missing_token");

    const { POST } = await import("@/app/api/gakuchika/[id]/interview-summary/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/interview-summary", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );

    expect(response.status).toBe(403);
    expect(getIdentityMock).not.toHaveBeenCalled();
    expect(generateGakuchikaSummaryWithTelemetryMock).not.toHaveBeenCalled();
  });
});
