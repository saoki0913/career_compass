import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  dbUpdateMock,
  dbTransactionMock,
  reserveCreditsMock,
  confirmReservationInTxMock,
  cancelReservationMock,
  resolveDraftReadyStateMock,
  safeParseConversationContextMock,
  safeParseMessagesMock,
  getConversationByConditionMock,
  enforceRateLimitLayersMock,
  guardDailyTokenLimitMock,
  getRequestIdentityMock,
  fetchFastApiWithPrincipalMock,
  getViewerPlanMock,
  incrementDailyTokenCountMock,
  getOwnedMotivationCompanyDataMock,
  buildMotivationOwnerConditionMock,
  logErrorMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationInTxMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  resolveDraftReadyStateMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
  safeParseMessagesMock: vi.fn(),
  getConversationByConditionMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  guardDailyTokenLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  fetchFastApiWithPrincipalMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
  incrementDailyTokenCountMock: vi.fn(),
  getOwnedMotivationCompanyDataMock: vi.fn(),
  buildMotivationOwnerConditionMock: vi.fn(() => ({})),
  logErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { update: dbUpdateMock, transaction: dbTransactionMock } }));
vi.mock("@/lib/db/schema", () => ({ motivationConversations: { id: "id" } }));
vi.mock("@/bff/api/error-response", () => ({
  createApiErrorResponse: vi.fn((_req, opts) => NextResponse.json({ code: opts.code }, { status: opts.status })),
}));
vi.mock("@/lib/credits", () => ({
  reserveCredits: reserveCreditsMock,
  confirmReservationInTx: confirmReservationInTxMock,
  cancelReservation: cancelReservationMock,
  FEEDBACK_SUMMARY_CREDIT_COST: 6,
}));
vi.mock("@/lib/motivation/conversation", () => ({
  resolveDraftReadyState: resolveDraftReadyStateMock,
  safeParseConversationContext: safeParseConversationContextMock,
  safeParseMessages: safeParseMessagesMock,
}));
vi.mock("@/lib/motivation/conversation-store", () => ({
  getMotivationConversationByCondition: getConversationByConditionMock,
}));
vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));
vi.mock("@/bff/identity/llm-cost-guard", () => ({ guardDailyTokenLimit: guardDailyTokenLimitMock }));
vi.mock("@/bff/identity/request-identity", () => ({ getRequestIdentity: getRequestIdentityMock }));
vi.mock("@/lib/ai/cost-summary-log", () => ({
  getRequestId: vi.fn(() => "req-1"),
  logAiCreditCostSummary: vi.fn(),
  splitInternalTelemetry: vi.fn((raw) => ({ payload: raw, telemetry: { total_tokens: 10 } })),
}));
vi.mock("@/lib/fastapi/client", () => ({ fetchFastApiWithPrincipal: fetchFastApiWithPrincipalMock }));
vi.mock("@/lib/server/loader-helpers", () => ({ getViewerPlan: getViewerPlanMock }));
vi.mock("@/lib/llm-cost-limit", () => ({
  incrementDailyTokenCount: incrementDailyTokenCountMock,
  computeTotalTokens: vi.fn(() => 10),
}));
vi.mock("@/lib/server/fastapi-detail-message", () => ({ messageFromFastApiDetail: vi.fn(() => "") }));
vi.mock("@/lib/motivation/motivation-input-resolver", () => ({
  getOwnedMotivationCompanyData: getOwnedMotivationCompanyDataMock,
  buildMotivationOwnerCondition: buildMotivationOwnerConditionMock,
}));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

const SUCCESS_PAYLOAD = {
  one_line_core_answer: "DX支援で顧客課題を解く志望",
  strengths: [{ title: "DX関心", description: "実体験に基づく" }],
  improvements: [{ title: "企業理由が抽象的", description: "具体事業に結びつける" }],
  next_preparation: ["具体的な事業名を調べる。"],
  likely_followup_questions: ["なぜ同業他社ではないのか"],
};

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/motivation/c-1/feedback-summary", { method: "POST" });
}

function callRoute(POST: (req: NextRequest, ctx: { params: Promise<{ companyId: string }> }) => Promise<Response>) {
  return POST(makeRequest(), { params: Promise.resolve({ companyId: "c-1" }) });
}

function setDbUpdateSuccess() {
  dbUpdateMock.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) });
  // persist + confirm share one transaction; the callback receives a tx whose
  // `update` is the same mock the route uses for the conversation persist.
  dbTransactionMock.mockImplementation(async (callback) => callback({ update: dbUpdateMock }));
}

function setReadyConversation() {
  getOwnedMotivationCompanyDataMock.mockResolvedValue({ id: "c-1", name: "テスト社", industry: "IT" });
  getConversationByConditionMock.mockResolvedValue({
    id: "conv-1",
    messages: "[]",
    conversationContext: "{}",
    status: "completed",
    generatedDraft: "私はテスト社を志望します。",
    feedbackSummary: null,
  });
  safeParseMessagesMock.mockReturnValue([{ role: "user", content: "回答" }]);
  safeParseConversationContextMock.mockReturnValue({
    selectedRole: "企画職",
    slotSummaries: {},
    slotEvidenceSentences: {},
    draftDocumentId: "doc-1",
  });
  resolveDraftReadyStateMock.mockReturnValue({ isDraftReady: true });
}

async function importRoute() {
  return import("@/bff/motivation/routes/[companyId]/feedback-summary/route");
}

describe("bff/motivation/feedback-summary/route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    guardDailyTokenLimitMock.mockResolvedValue(null);
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getViewerPlanMock.mockResolvedValue("free");
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "r-1" });
    confirmReservationInTxMock.mockResolvedValue({ confirmed: true, balanceAfter: 70 });
    cancelReservationMock.mockResolvedValue({ canceled: true });
    incrementDailyTokenCountMock.mockResolvedValue(undefined);
    setDbUpdateSuccess();
  });

  it("rejects guests (login required) without reserving", async () => {
    getRequestIdentityMock.mockResolvedValue({ userId: null, guestId: "g-1" });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(403);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects when the draft is not ready, without reserving", async () => {
    setReadyConversation();
    resolveDraftReadyStateMock.mockReturnValue({ isDraftReady: false });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(409);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("returns a cached summary without reserving or calling FastAPI", async () => {
    setReadyConversation();
    getConversationByConditionMock.mockResolvedValue({
      id: "conv-1",
      messages: "[]",
      conversationContext: "{}",
      status: "completed",
      generatedDraft: "私はテスト社を志望します。",
      feedbackSummary: { ...SUCCESS_PAYLOAD, source_draft_document_id: "doc-1" },
    });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("charges 6 credits when generation and save succeed", async () => {
    setReadyConversation();
    fetchFastApiWithPrincipalMock.mockResolvedValue({ ok: true, json: async () => SUCCESS_PAYLOAD });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(reserveCreditsMock).toHaveBeenCalledWith("user-1", 6, "motivation_summary", "c-1", expect.any(String));
    expect(dbUpdateMock).toHaveBeenCalled();
    expect(confirmReservationInTxMock).toHaveBeenCalledWith(expect.anything(), "r-1");
    expect(cancelReservationMock).not.toHaveBeenCalled();
  });

  it("does not charge when FastAPI fails", async () => {
    setReadyConversation();
    fetchFastApiWithPrincipalMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(503);
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
    expect(confirmReservationInTxMock).not.toHaveBeenCalled();
  });

  it("does not charge when FastAPI returns an empty (fallback) summary", async () => {
    setReadyConversation();
    fetchFastApiWithPrincipalMock.mockResolvedValue({
      ok: true,
      json: async () => ({ one_line_core_answer: "", strengths: [] }),
    });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(502);
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
    expect(confirmReservationInTxMock).not.toHaveBeenCalled();
  });

  it("rolls back and refunds (503) when DB save fails (no charge)", async () => {
    setReadyConversation();
    fetchFastApiWithPrincipalMock.mockResolvedValue({ ok: true, json: async () => SUCCESS_PAYLOAD });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockRejectedValue(new Error("db down")) })),
    });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(503);
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
    expect(confirmReservationInTxMock).not.toHaveBeenCalled();
  });

  it("rolls back and refunds (503) when the reservation can no longer be confirmed", async () => {
    // atomic: confirm runs inside the persist tx. A non-claimable reservation
    // (already canceled/confirmed, or swept by cleanup) makes the tx throw, so
    // the summary is NOT delivered and the reservation is refunded.
    setReadyConversation();
    fetchFastApiWithPrincipalMock.mockResolvedValue({ ok: true, json: async () => SUCCESS_PAYLOAD });
    confirmReservationInTxMock.mockResolvedValue({ confirmed: false, balanceAfter: null });
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(503);
    expect(confirmReservationInTxMock).toHaveBeenCalledWith(expect.anything(), "r-1");
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
  });

  it("refunds (503) when confirmation throws inside the persist transaction", async () => {
    setReadyConversation();
    fetchFastApiWithPrincipalMock.mockResolvedValue({ ok: true, json: async () => SUCCESS_PAYLOAD });
    confirmReservationInTxMock.mockRejectedValue(new Error("credit store unavailable"));
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(503);
    expect(confirmReservationInTxMock).toHaveBeenCalledWith(expect.anything(), "r-1");
    expect(cancelReservationMock).toHaveBeenCalledWith("r-1");
  });

  it("returns 404 without reserving when the company is not owned", async () => {
    getOwnedMotivationCompanyDataMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(404);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("returns 404 without reserving when the conversation is missing", async () => {
    getOwnedMotivationCompanyDataMock.mockResolvedValue({ id: "c-1", name: "テスト社", industry: "IT" });
    getConversationByConditionMock.mockResolvedValue(undefined);
    const { POST } = await importRoute();
    const res = await callRoute(POST);
    expect(res.status).toBe(404);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });
});
