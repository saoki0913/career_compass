import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbUpdateMock,
  dbInsertMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
  enforceRateLimitLayersMock,
  getRequestIdentityMock,
  safeParseConversationContextMock,
  fetchFastApiInternalMock,
  fetchProfileContextMock,
  fetchGakuchikaContextMock,
  ensureMotivationConversationMock,
  fetchMotivationApplicationJobCandidatesMock,
  getOwnedMotivationCompanyDataMock,
  resolveMotivationInputsMock,
  resolveMotivationRoleSelectionSourceMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  fetchProfileContextMock: vi.fn(),
  fetchGakuchikaContextMock: vi.fn(),
  ensureMotivationConversationMock: vi.fn(),
  fetchMotivationApplicationJobCandidatesMock: vi.fn(),
  getOwnedMotivationCompanyDataMock: vi.fn(),
  resolveMotivationInputsMock: vi.fn(),
  resolveMotivationRoleSelectionSourceMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: reserveCreditsMock,
  confirmReservation: confirmReservationMock,
  cancelReservation: cancelReservationMock,
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/motivation/conversation", () => ({
  DEFAULT_CONFIRMED_FACTS: {},
  DEFAULT_MOTIVATION_CONTEXT: {
    openSlots: [
      "industry_reason",
      "company_reason",
      "self_connection",
      "desired_work",
      "value_contribution",
      "differentiation",
    ],
  },
  mergeDraftReadyContext: vi.fn((value) => value),
  safeParseConversationContext: safeParseConversationContextMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
}));

vi.mock("@/lib/ai/user-context", () => ({
  fetchProfileContext: fetchProfileContextMock,
  fetchGakuchikaContext: fetchGakuchikaContextMock,
}));

vi.mock("@/lib/motivation/motivation-input-resolver", () => ({
  ensureMotivationConversation: ensureMotivationConversationMock,
  fetchMotivationApplicationJobCandidates: fetchMotivationApplicationJobCandidatesMock,
  getOwnedMotivationCompanyData: getOwnedMotivationCompanyDataMock,
  resolveMotivationInputs: resolveMotivationInputsMock,
  resolveMotivationRoleSelectionSource: resolveMotivationRoleSelectionSourceMock,
}));

describe("api/motivation/[companyId]/generate-draft-direct", () => {
  beforeEach(() => {
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getRequestIdentityMock.mockReset();
    safeParseConversationContextMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    fetchProfileContextMock.mockReset();
    fetchGakuchikaContextMock.mockReset();
    ensureMotivationConversationMock.mockReset();
    fetchMotivationApplicationJobCandidatesMock.mockReset();
    getOwnedMotivationCompanyDataMock.mockReset();
    resolveMotivationInputsMock.mockReset();
    resolveMotivationRoleSelectionSourceMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getOwnedMotivationCompanyDataMock.mockResolvedValue({
      id: "company-1",
      name: "テスト株式会社",
      industry: "IT",
    });
    ensureMotivationConversationMock.mockResolvedValue({
      id: "conversation-1",
      messages: "[]",
      questionCount: 0,
      conversationContext: "{}",
    });
    safeParseConversationContextMock.mockReturnValue({});
    fetchProfileContextMock.mockResolvedValue({
      university: "テスト大学",
      target_job_types: ["企画職"],
      target_industries: ["IT"],
    });
    fetchGakuchikaContextMock.mockResolvedValue([]);
    fetchMotivationApplicationJobCandidatesMock.mockResolvedValue(["企画職"]);
    resolveMotivationInputsMock.mockReturnValue({
      requiresIndustrySelection: false,
      company: { industry: "IT" },
      conversationContext: { selectedIndustrySource: "company_field" },
      companyRoleCandidates: ["企画職"],
    });
    resolveMotivationRoleSelectionSourceMock.mockReturnValue("profile");
  });

  it("returns a temporary draft without creating an ES document", async () => {
    fetchFastApiInternalMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            draft: "会話なしの下書きです。",
            char_count: 120,
            key_points: ["企業理解"],
            company_keywords: ["DX支援"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            question: "この志望動機でさらに補強したい観点はどこですか？",
            evidence_cards: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft-direct/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft-direct", {
        method: "POST",
        body: JSON.stringify({ charLimit: 400, selectedRole: "企画職" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ companyId: "company-1" }) },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.documentId).toBeNull();
  });

  it("returns 409 before consuming credits when profile-only material is too thin", async () => {
    fetchProfileContextMock.mockResolvedValueOnce({ target_job_types: [] });
    fetchGakuchikaContextMock.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/motivation/[companyId]/generate-draft-direct/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/motivation/company-1/generate-draft-direct", {
        method: "POST",
        body: JSON.stringify({ charLimit: 400, selectedRole: "企画職" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ companyId: "company-1" }) },
    );

    expect(response.status).toBe(409);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(fetchFastApiInternalMock).not.toHaveBeenCalled();
  });
});
