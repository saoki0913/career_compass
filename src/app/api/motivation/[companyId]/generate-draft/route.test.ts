import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbUpdateMock,
  dbInsertMock,
  dbTransactionMock,
  reserveCreditsMock,
  confirmReservationInTxMock,
  cancelReservationMock,
  enforceRateLimitLayersMock,
  getRequestIdentityMock,
  getMotivationConversationByConditionMock,
  getOwnedMotivationCompanyDataMock,
  buildMotivationOwnerConditionMock,
  resolveDraftReadyStateMock,
  safeParseConversationContextMock,
  safeParseMessagesMock,
  fetchFastApiInternalMock,
  buildMotivationUserEvidenceCardsMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationInTxMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  getMotivationConversationByConditionMock: vi.fn(),
  getOwnedMotivationCompanyDataMock: vi.fn(),
  buildMotivationOwnerConditionMock: vi.fn(),
  resolveDraftReadyStateMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
  safeParseMessagesMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  buildMotivationUserEvidenceCardsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
    insert: dbInsertMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: reserveCreditsMock,
  confirmReservationInTx: confirmReservationInTxMock,
  cancelReservation: cancelReservationMock,
}));

vi.mock("@/lib/motivation/conversation", () => ({
  resolveDraftReadyState: resolveDraftReadyStateMock,
  safeParseConversationContext: safeParseConversationContextMock,
  safeParseMessages: safeParseMessagesMock,
}));

vi.mock("@/lib/motivation/conversation-store", () => ({
  getMotivationConversationByCondition: getMotivationConversationByConditionMock,
}));

vi.mock("@/lib/motivation/conversation-payload", () => ({
  buildMotivationUserEvidenceCards: buildMotivationUserEvidenceCardsMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/bff/identity/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/llm-cost-limit", () => ({
  incrementDailyTokenCount: vi.fn().mockResolvedValue(undefined),
  computeTotalTokens: vi.fn().mockReturnValue(0),
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
  fetchFastApiWithPrincipal: fetchFastApiInternalMock,
}));

vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: vi.fn().mockResolvedValue("standard"),
}));
vi.mock("@/lib/motivation/motivation-input-resolver", () => ({
  buildMotivationOwnerCondition: buildMotivationOwnerConditionMock,
  getOwnedMotivationCompanyData: getOwnedMotivationCompanyDataMock,
}));

describe("api/motivation/[companyId]/generate-draft", () => {
  beforeEach(() => {
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    dbTransactionMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationInTxMock.mockReset();
    cancelReservationMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getRequestIdentityMock.mockReset();
    getMotivationConversationByConditionMock.mockReset();
    getOwnedMotivationCompanyDataMock.mockReset();
    buildMotivationOwnerConditionMock.mockReset();
    resolveDraftReadyStateMock.mockReset();
    safeParseConversationContextMock.mockReset();
    safeParseMessagesMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    buildMotivationUserEvidenceCardsMock.mockReset();
    vi.restoreAllMocks();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    dbTransactionMock.mockImplementation(async (callback) => callback({
      update: dbUpdateMock,
      insert: dbInsertMock,
    }));
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    confirmReservationInTxMock.mockResolvedValue({ confirmed: true, balanceAfter: 70 });
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getOwnedMotivationCompanyDataMock.mockResolvedValue({
      id: "company-1",
      name: "テスト株式会社",
      industry: "IT",
    });
    buildMotivationOwnerConditionMock.mockReturnValue({ owner: "condition" });
    getMotivationConversationByConditionMock.mockResolvedValue({
      id: "conversation-1",
      status: "completed",
      conversationContext: JSON.stringify({ draftReady: true }),
      messages: JSON.stringify([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]),
    });
    safeParseConversationContextMock.mockReturnValue({
      draftReady: true,
      selectedIndustry: "IT",
      selectedRole: "企画職",
      questionStage: "differentiation",
      slotSummaries: {
        company_reason: "DX支援を通じて顧客課題に向き合える点に惹かれています。",
      },
      slotEvidenceSentences: {
        company_reason: ["DX支援を通じて顧客課題に向き合える点に惹かれています。"],
      },
    });
    safeParseMessagesMock.mockReturnValue([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
    resolveDraftReadyStateMock.mockReturnValue({ isDraftReady: true, unlockedAt: null });
    buildMotivationUserEvidenceCardsMock.mockReturnValue([
      {
        sourceId: "U1",
        title: "企業を選ぶ理由",
        contentType: "user_context",
        excerpt: "DX支援を通じて顧客課題に向き合える点に惹かれています。",
        sourceUrl: "",
        relevanceLabel: "会話で確認",
      },
    ]);
  });

  it("returns 429 without reserving credits or calling backend when rate limited", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    enforceRateLimitLayersMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            userMessage: "リクエストが多すぎます。",
            action: "42秒待ってから再試行してください。",
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "42" } },
      ),
    );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });

    expect(response.status).toBe(429);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 409 when the conversation is not draft ready yet", async () => {
    resolveDraftReadyStateMock.mockReturnValueOnce({ isDraftReady: false, unlockedAt: null });

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });

    expect(response.status).toBe(409);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("returns draft with documentId and sets postDraftAwaitingResume after success", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: "志望動機の下書きです。",
          char_count: 120,
          key_points: ["企業理解", "自己接続"],
          company_keywords: ["DX支援"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toBe("志望動機の下書きです。");
    expect(payload.documentId).toEqual(expect.any(String));
    expect(payload.draftDocumentId).toBe(payload.documentId);
    expect(payload.nextQuestion).toBeNull();
    expect(payload.userEvidenceCards).toHaveLength(1);
    expect(fetchFastApiInternalMock).toHaveBeenCalledTimes(1);
    expect(fetchFastApiInternalMock).toHaveBeenCalledWith(
      "/api/motivation/generate-draft",
      expect.objectContaining({
        body: expect.any(String),
      }),
    );
    const callBody = JSON.parse(fetchFastApiInternalMock.mock.calls[0][1].body as string);
    expect(callBody.slot_summaries).toEqual({
      company_reason: "DX支援を通じて顧客課題に向き合える点に惹かれています。",
    });
    expect(callBody.slot_evidence_sentences).toEqual({
      company_reason: ["DX支援を通じて顧客課題に向き合える点に惹かれています。"],
    });
    expect(callBody.selected_role).toBe("企画職");
    expect(callBody.is_regeneration).toBe(false);
    expect(dbInsertMock).toHaveBeenCalled();
    expect(dbUpdateMock).toHaveBeenCalled();
    const updateSet = dbUpdateMock.mock.results.at(-1)?.value.set;
    expect(updateSet).toBeDefined();
    expect(confirmReservationInTxMock).toHaveBeenCalledWith(expect.anything(), "res-1");
  });

  it("passes through 422 from FastAPI as 422 with user-facing message and cancels reservation", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: [
            {
              type: "too_long",
              loc: ["body", "conversation_history"],
              msg: "List should have at most 40 items after validation, not 41",
            },
          ],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.userMessage).toBe("会話が長すぎます。新しい会話を開始してください。");
    expect(cancelReservationMock).toHaveBeenCalledWith("res-1");
    expect(confirmReservationInTxMock).not.toHaveBeenCalled();
  });

  it("creates an ES document and persists draftDocumentId without fetching next-question", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: "志望動機の下書きです。",
          char_count: 120,
          key_points: ["企業理解"],
          company_keywords: ["DX支援"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.documentId).toEqual(expect.any(String));
    expect(payload.nextQuestion).toBeNull();
    expect(dbInsertMock).toHaveBeenCalled();
    expect(dbTransactionMock).toHaveBeenCalled();
    expect(fetchFastApiInternalMock).toHaveBeenCalledTimes(1);
    expect(fetchFastApiInternalMock.mock.calls[0][0]).toBe("/api/motivation/generate-draft");
    expect(dbInsertMock.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: payload.documentId,
        userId: "user-1",
        guestId: undefined,
        companyId: "company-1",
        type: "es",
        status: "draft",
        content: expect.stringContaining("志望動機の下書きです。"),
      }),
    );
    expect(dbUpdateMock.mock.results.at(-1)?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedDraft: "志望動機の下書きです。",
        conversationContext: expect.objectContaining({
          draftDocumentId: payload.documentId,
          postDraftAwaitingResume: true,
        }),
      }),
    );
  });

  it("rolls back and refunds (503) when the reservation can no longer be confirmed", async () => {
    // atomic: confirm runs inside the persist tx. A non-claimable reservation
    // (already canceled/confirmed, or swept by cleanup) makes the tx throw, so
    // the document is NOT delivered and the reservation is refunded.
    confirmReservationInTxMock.mockResolvedValueOnce({ confirmed: false, balanceAfter: null });
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: "志望動機の下書きです。",
          char_count: 120,
          key_points: ["企業理解"],
          company_keywords: ["DX支援"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.documentId).toBeUndefined();
    expect(dbTransactionMock).toHaveBeenCalled();
    expect(cancelReservationMock).toHaveBeenCalledWith("res-1");
  });

  it("refunds (503) when confirmation throws inside the persist transaction", async () => {
    confirmReservationInTxMock.mockRejectedValueOnce(new Error("credit store unavailable"));
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: "志望動機の下書きです。",
          char_count: 120,
          key_points: ["企業理解"],
          company_keywords: ["DX支援"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft/route");
    const request = new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ companyId: "company-1" }) });

    expect(response.status).toBe(503);
    expect(cancelReservationMock).toHaveBeenCalledWith("res-1");
  });
});
