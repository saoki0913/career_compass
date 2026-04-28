import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbMock,
  fetchProfileContextMock,
  fetchGakuchikaContextMock,
  extractOtherDocumentSectionsMock,
  getRequestIdentityMock,
  getOwnedDocumentMock,
  guardDailyTokenLimitMock,
  enforceRateLimitLayersMock,
  precheckMock,
  reserveMock,
  cancelMock,
  confirmMock,
  fetchFastApiWithPrincipalMock,
  getViewerPlanMock,
  incrementDailyTokenCountMock,
} = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
  fetchProfileContextMock: vi.fn(),
  fetchGakuchikaContextMock: vi.fn(),
  extractOtherDocumentSectionsMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  getOwnedDocumentMock: vi.fn(),
  guardDailyTokenLimitMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  precheckMock: vi.fn(),
  reserveMock: vi.fn(),
  cancelMock: vi.fn(),
  confirmMock: vi.fn(),
  fetchFastApiWithPrincipalMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
  incrementDailyTokenCountMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/ai/user-context", () => ({
  fetchProfileContext: fetchProfileContextMock,
  fetchGakuchikaContext: fetchGakuchikaContextMock,
  extractOtherDocumentSections: extractOtherDocumentSectionsMock,
}));
vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));
vi.mock("@/app/api/_shared/owner-access", () => ({
  getOwnedDocument: getOwnedDocumentMock,
}));
vi.mock("@/app/api/_shared/llm-cost-guard", () => ({
  guardDailyTokenLimit: guardDailyTokenLimitMock,
}));
vi.mock("@/lib/rate-limit-spike", () => ({
  REVIEW_RATE_LAYERS: [],
  enforceRateLimitLayers: enforceRateLimitLayersMock,
}));
vi.mock("@/lib/api-route/billing/es-review-stream-policy", () => ({
  esReviewStreamPolicy: {
    precheck: precheckMock,
    reserve: reserveMock,
    cancel: cancelMock,
    confirm: confirmMock,
  },
}));
vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiWithPrincipal: fetchFastApiWithPrincipalMock,
}));
vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: getViewerPlanMock,
}));
vi.mock("@/lib/llm-cost-limit", () => ({
  incrementDailyTokenCount: incrementDailyTokenCountMock,
  computeTotalTokens: vi.fn(() => 0),
}));
vi.mock("@/lib/ai/cost-summary-log", () => ({
  getRequestId: vi.fn(() => "req-1"),
  logAiCreditCostSummary: vi.fn(),
  splitInternalTelemetry: vi.fn((payload: Record<string, unknown>) => ({
    payload,
    telemetry: null,
  })),
}));

describe("handleReviewStream", () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    fetchProfileContextMock.mockReset();
    fetchGakuchikaContextMock.mockReset();
    extractOtherDocumentSectionsMock.mockReset();
    getRequestIdentityMock.mockReset();
    getOwnedDocumentMock.mockReset();
    guardDailyTokenLimitMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    precheckMock.mockReset();
    reserveMock.mockReset();
    cancelMock.mockReset();
    confirmMock.mockReset();
    fetchFastApiWithPrincipalMock.mockReset();
    getViewerPlanMock.mockReset();
    incrementDailyTokenCountMock.mockReset();

    const limitBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ plan: "free" }]),
    };
    dbMock.select.mockReturnValue(limitBuilder);
    fetchProfileContextMock.mockResolvedValue(null);
    fetchGakuchikaContextMock.mockResolvedValue([]);
    extractOtherDocumentSectionsMock.mockReturnValue([]);
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    getOwnedDocumentMock.mockResolvedValue({
      id: "doc-1",
      companyId: null,
      content: "既存本文",
    });
    guardDailyTokenLimitMock.mockResolvedValue(null);
    enforceRateLimitLayersMock.mockResolvedValue(null);
    precheckMock.mockResolvedValue({ ok: true });
    reserveMock.mockResolvedValue({ reservationId: "res-1" });
    getViewerPlanMock.mockResolvedValue("free");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
  });

  it("calls FastAPI review stream with ai-stream principal", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");

    const request = new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
      method: "POST",
      body: JSON.stringify({
        content: "志望理由です",
        sectionTitle: "志望動機",
        sectionCharLimit: 400,
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleReviewStream(
      request,
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );

    expect(response.status).toBe(200);
    expect(fetchFastApiWithPrincipalMock).toHaveBeenCalledWith(
      "/api/es/review/stream",
      expect.objectContaining({
        principal: {
          scope: "ai-stream",
          actor: { kind: "user", id: "user-1" },
          companyId: null,
          plan: "free",
        },
      }),
    );
  });

  it("confirms the reservation only after the stream completes", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"complete","result":{"rewrites":["改善後の本文"]}}\n\n'));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "志望理由です",
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );

    await response.text();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      expect.objectContaining({ kind: "billable_success" }),
      "res-1",
    );
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("cancels the reservation when the complete event has no valid result payload", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"complete","data":{"ok":true}}\n\n'));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "志望理由です",
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );

    const text = await response.text();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "stream_ended_without_complete",
    );
    expect(text).toContain("添削結果の形式が不正です");
  });

  it("cancels the reservation and strips telemetry when upstream is not ok", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      Response.json(
        {
          detail: { error: "backend failed", error_type: "provider_failure" },
          internal_telemetry: { model: "gpt", input_tokens: 10 },
        },
        { status: 503 },
      ),
    );

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "志望理由です",
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "fastapi_not_ok",
    );
    expect(confirmMock).not.toHaveBeenCalled();
    expect(text).toContain("backend failed");
    expect(text).not.toContain("internal_telemetry");
  });
});
