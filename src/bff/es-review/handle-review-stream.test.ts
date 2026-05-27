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
  confirmInTxMock,
  fetchFastApiWithPrincipalMock,
  getViewerPlanMock,
  incrementDailyTokenCountMock,
  requireOwnerMutationRequestMock,
} = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    transaction: vi.fn(),
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
  confirmInTxMock: vi.fn(),
  fetchFastApiWithPrincipalMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
  incrementDailyTokenCountMock: vi.fn(),
  requireOwnerMutationRequestMock: vi.fn(),
}));

const fakeTx = { __tx: true } as never;

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/bff/api/mutation-guard", () => ({
  requireOwnerMutationRequest: requireOwnerMutationRequestMock,
}));
vi.mock("@/lib/ai/user-context", () => ({
  fetchProfileContext: fetchProfileContextMock,
  fetchGakuchikaContext: fetchGakuchikaContextMock,
  extractOtherDocumentSections: extractOtherDocumentSectionsMock,
}));
vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));
vi.mock("@/bff/identity/owner-access", () => ({
  getOwnedDocument: getOwnedDocumentMock,
}));
vi.mock("@/bff/identity/llm-cost-guard", () => ({
  guardDailyTokenLimit: guardDailyTokenLimitMock,
}));
vi.mock("@/lib/rate-limit-spike", () => ({
  REVIEW_RATE_LAYERS: [],
  enforceRateLimitLayers: enforceRateLimitLayersMock,
}));
vi.mock("@/bff/billing/es-review-stream-policy", () => ({
  esReviewStreamPolicy: {
    precheck: precheckMock,
    reserve: reserveMock,
    cancel: cancelMock,
    confirmInTx: confirmInTxMock,
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
    dbMock.transaction.mockReset();
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
    confirmInTxMock.mockReset();
    fetchFastApiWithPrincipalMock.mockReset();
    getViewerPlanMock.mockReset();
    incrementDailyTokenCountMock.mockReset();
    requireOwnerMutationRequestMock.mockReset();

    const limitBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ plan: "free" }]),
    };
    dbMock.select.mockReturnValue(limitBuilder);
    // The confirm path now runs inside db.transaction; the mock invokes the
    // callback with a fake tx so confirmInTx is exercised.
    dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx));
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
    requireOwnerMutationRequestMock.mockReturnValue({ ok: true });
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

  it("rejects unsafe mutation requests before identity, billing, or FastAPI work", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    const guardResponse = Response.json(
      {
        error: {
          code: "CSRF_VALIDATION_FAILED",
          userMessage: "安全確認に失敗しました。",
          action: "ページを再読み込みしてください。",
          retryable: false,
        },
      },
      { status: 403 },
    );
    requireOwnerMutationRequestMock.mockReturnValueOnce({ ok: false, response: guardResponse });

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "志望理由です",
          sectionTitle: "志望動機",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );

    expect(response.status).toBe(403);
    expect(getRequestIdentityMock).not.toHaveBeenCalled();
    expect(precheckMock).not.toHaveBeenCalled();
    expect(reserveMock).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("calls FastAPI review stream with ai-stream principal", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");

    const request = new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
      method: "POST",
      body: JSON.stringify({
        content: "志望理由です",
        sectionTitle: "志望動機",
        sectionCharLimit: 400,
        hasCompanyRag: true,
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
        body: expect.not.stringContaining("hasCompanyRag"),
      }),
    );
  });

  it("rejects invalid content before reserving credits", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "短い",
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );

    expect(response.status).toBe(400);
    expect(precheckMock).not.toHaveBeenCalled();
    expect(reserveMock).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("returns document 404 before billing reservation", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    getOwnedDocumentMock.mockResolvedValueOnce(null);

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/missing-doc/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "志望理由です",
          sectionTitle: "志望動機",
          sectionCharLimit: 400,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "missing-doc" }) },
      "/api/es/review/stream",
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("DOCUMENT_NOT_FOUND");
    expect(precheckMock).not.toHaveBeenCalled();
    expect(reserveMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("returns token limit failures before validation, billing, and FastAPI", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    guardDailyTokenLimitMock.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "TOKEN_LIMIT_SERVICE_UNAVAILABLE",
            userMessage: "現在、AI機能を一時的に利用できません。",
            action: "数分後にもう一度お試しください。クレジットは消費されていません。",
            retryable: true,
          },
          requestId: "req-token",
        },
        { status: 503, headers: { "X-Request-Id": "req-token" } },
      ),
    );

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
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("TOKEN_LIMIT_SERVICE_UNAVAILABLE");
    expect(body.code).toBeUndefined();
    expect(guardDailyTokenLimitMock).toHaveBeenCalledWith({ userId: "user-1", guestId: null }, request);
    expect(precheckMock).not.toHaveBeenCalled();
    expect(reserveMock).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range section char limit before reserving credits", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");

    const response = await handleReviewStream(
      new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
        method: "POST",
        body: JSON.stringify({
          content: "志望理由です",
          sectionTitle: "志望動機",
          sectionCharLimit: 1501,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
      "/api/es/review/stream",
    );

    expect(response.status).toBe(400);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("returns billing gate 503 before calling FastAPI when credit reservation is unavailable", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    reserveMock.mockResolvedValueOnce({
      reservationId: null,
      errorResponse: Response.json(
        {
          error: {
            code: "BILLING_GATE_UNAVAILABLE",
            userMessage: "課金状態の確認に失敗しました。",
            retryable: true,
          },
        },
        { status: 503 },
      ),
    });

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
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: "BILLING_GATE_UNAVAILABLE",
        retryable: true,
      },
    });
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("confirms the reservation only after the stream completes", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"complete","result":{"rewrites":["改善後の本文"],"billing_outcome":{"success":true,"billable":true,"schema_version":1}}}\n\n'));
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

    expect(confirmInTxMock).toHaveBeenCalledOnce();
    expect(confirmInTxMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ documentId: "doc-1" }),
      expect.objectContaining({ kind: "billable_success" }),
      "res-1",
    );
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("cancels the reservation when credit confirmation fails after a valid complete event", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    confirmInTxMock.mockRejectedValueOnce(new Error("credit store unavailable"));
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"complete","result":{"rewrites":["改善後の本文"],"billing_outcome":{"success":true,"billable":true,"schema_version":1}}}\n\n'));
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

    expect(confirmInTxMock).toHaveBeenCalledOnce();
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "stream_ended_without_complete",
    );
    expect(text).toContain("ストリーミング処理中にエラーが発生しました");
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

    expect(confirmInTxMock).not.toHaveBeenCalled();
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
          detail: { error: "provider stack: secret token leaked", error_type: "provider_failure" },
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
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBe("req-1");
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "fastapi_not_ok",
    );
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      error: {
        code: "ES_REVIEW_UPSTREAM_FAILED",
        userMessage: "AI添削を完了できませんでした。時間を置いて、もう一度お試しください。",
        llmErrorType: "provider_failure",
      },
      requestId: "req-1",
    });
    expect(JSON.stringify(body)).not.toContain("provider stack");
    expect(JSON.stringify(body)).not.toContain("internal_telemetry");
  });

  it("cancels the reservation and returns structured JSON when upstream is 404", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      Response.json({ detail: "Not Found" }, { status: 404 }),
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
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      error: {
        code: "ES_REVIEW_UPSTREAM_FAILED",
        userMessage: "入力内容や設定を確認して、もう一度お試しください。",
      },
      requestId: "req-1",
    });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "fastapi_not_ok",
    );
    expect(confirmInTxMock).not.toHaveBeenCalled();
  });

  it("returns structured 503 when FastAPI principal secret is missing", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockRejectedValue(
      new Error("CAREER_PRINCIPAL_HMAC_SECRET is not configured"),
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
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBe("req-1");
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "fastapi_fetch_exception",
    );
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      error: {
        code: "ES_REVIEW_AI_AUTH_NOT_CONFIGURED",
        userMessage: "AI機能を利用できませんでした。",
      },
      requestId: "req-1",
    });
  });

  it("returns structured 500 and cancels the reservation when FastAPI fetch throws", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockRejectedValue(new Error("fetch failed"));

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
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-Id")).toBe("req-1");
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "fastapi_fetch_exception",
    );
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      error: {
        code: "ES_REVIEW_STREAM_INTERNAL_ERROR",
        userMessage: "ES添削を開始できませんでした。",
      },
      requestId: "req-1",
    });
  });

  it("confirms when complete event has billing_outcome and valid rewrites", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"complete","result":{"rewrites":["改善後の本文"],"billing_outcome":{"success":true,"billable":true,"schema_version":1}}}\n\n',
              ),
            );
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

    expect(confirmInTxMock).toHaveBeenCalledOnce();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("does not confirm credits when complete event is explicitly non-billable", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"complete","result":{"rewrites":["改善後の本文"],"billing_outcome":{"success":true,"billable":false,"schema_version":1}}}\n\n',
              ),
            );
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

    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(incrementDailyTokenCountMock).not.toHaveBeenCalled();
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "stream_ended_without_complete",
    );
    expect(text).toContain("添削結果の形式が不正です");
  });

  it("rejects legacy complete events that wrap result under data", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"complete","data":{"result":{"rewrites":["改善後の本文"],"billing_outcome":{"success":true,"billable":true,"schema_version":1}}}}\n\n',
              ),
            );
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

    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "stream_ended_without_complete",
    );
    expect(text).toContain("添削結果の形式が不正です");
  });

  it("cancels reservation on SSE error without confirming credits", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"error","message":"上流で失敗しました","code":"UPSTREAM_FAILED","retryable":true}\n\n',
              ),
            );
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

    expect(text).toContain('"type":"error"');
    expect(text).toContain("上流で失敗しました");
    expect(confirmInTxMock).not.toHaveBeenCalled();
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
      "res-1",
      "stream_ended_without_complete",
    );
  });

  it("publishes only the ES review public SSE contract", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                [
                  'data: {"type":"progress","step":"rewrite","progress":44,"label":"debug /backend/path requestId=req-upstream"}',
                  'data: {"type":"string_chunk","path":"streaming_rewrite","text":"改善"}',
                  'data: {"type":"array_item_complete","path":"keyword_sources.0","value":{"source_id":"src-internal","source_url":"https://example.com","content_type":"corporate_site","title":"source","excerpt":"evidence"}}',
                  'data: {"type":"complete","requestId":"req-upstream","result":{"rewrites":["改善後の本文"],"billing_outcome":{"success":true,"billable":true,"schema_version":1},"template_review":{"template_type":"self_pr","variants":[{"text":"改善後の本文","source_id":"variant-src","debug":"variant-debug"}],"keyword_sources":[{"source_id":"src-internal","source_url":"https://example.com","content_type":"corporate_site","title":"source","excerpt":"evidence"}]},"review_meta":{"grounding_mode":"none","rewrite_attempt_count":3,"repair_dispatches":["retry"],"fallback_reason":"debug","token_usage":{"input_tokens":1},"rewrite_attempt_trace":[{"step":"internal"}],"ai_smell_warnings":[{"code":"x"}]}},"internal_telemetry":{"input_tokens":10}}',
                  "",
                ].join("\n\n"),
              ),
            );
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

    expect(text).toContain('"type":"rewrite_delta"');
    expect(text).toContain('"type":"source_added"');
    expect(text).toContain('"type":"complete"');
    expect(text).toContain("改善後の本文");
    expect(text).not.toContain("source_id");
    expect(text).not.toContain("req-upstream");
    expect(text).not.toContain("rewrite_attempt_count");
    expect(text).not.toContain("repair_dispatches");
    expect(text).not.toContain("fallback_reason");
    expect(text).not.toContain("token_usage");
    expect(text).not.toContain("rewrite_attempt_trace");
    expect(text).not.toContain("ai_smell_warnings");
    expect(text).not.toContain("internal_telemetry");
    expect(text).not.toContain("/backend/path");
    expect(text).not.toContain("variant-src");
    expect(text).not.toContain("variant-debug");
  });

  it("sanitizes proxy-generated ES review stream errors", async () => {
    const { handleReviewStream } = await import("./handle-review-stream");
    fetchFastApiWithPrincipalMock.mockResolvedValue(new Response(null, { status: 200 }));

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

    expect(text).toContain('"type":"error"');
    expect(text).toContain("ES_REVIEW_EMPTY_RESPONSE");
    expect(text).not.toContain("requestId");
    expect(text).not.toContain("req-1");
  });
});
