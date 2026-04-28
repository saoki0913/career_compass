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
  buildMotivationUserEvidenceCardsMock,
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
  buildMotivationUserEvidenceCardsMock: vi.fn(),
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

vi.mock("@/app/api/_shared/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/llm-cost-limit", () => ({
  incrementDailyTokenCount: vi.fn().mockResolvedValue(undefined),
  computeTotalTokens: vi.fn().mockReturnValue(0),
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

vi.mock("@/lib/motivation/conversation-payload", () => ({
  buildMotivationUserEvidenceCards: buildMotivationUserEvidenceCardsMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
  fetchFastApiWithPrincipal: fetchFastApiInternalMock,
}));

vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: vi.fn().mockResolvedValue("standard"),
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
    buildMotivationUserEvidenceCardsMock.mockReset();

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
    fetchGakuchikaContextMock.mockResolvedValue([
      {
        title: "学園祭運営",
        source_status: "structured_summary",
        strengths: [{ title: "課題整理力" }],
        action_text: "申請フローを整理しました。",
        result_text: "確認漏れを減らしました。",
      },
    ]);
    fetchMotivationApplicationJobCandidatesMock.mockResolvedValue(["企画職"]);
    resolveMotivationInputsMock.mockReturnValue({
      requiresIndustrySelection: false,
      company: { industry: "IT" },
      conversationContext: { selectedIndustrySource: "company_field" },
      companyRoleCandidates: ["企画職"],
    });
    resolveMotivationRoleSelectionSourceMock.mockReturnValue("profile");
    buildMotivationUserEvidenceCardsMock.mockReturnValue([
      {
        sourceId: "U1",
        title: "登録済みの強み",
        contentType: "user_context",
        excerpt: "課題整理力",
        sourceUrl: "",
        relevanceLabel: "プロフィール/ガクチカ",
      },
    ]);
  });

  it("returns a temporary draft without creating an ES document", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: "会話なしの下書きです。",
          char_count: 120,
          key_points: ["企業理解"],
          company_keywords: ["DX支援"],
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
    expect(payload.nextQuestion).toBeNull();
    expect(payload.userEvidenceCards).toHaveLength(1);
    expect(buildMotivationUserEvidenceCardsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draftSource: "profile_only",
        userAnchorStrengths: ["課題整理力"],
        userAnchorEpisodes: expect.arrayContaining(["学園祭運営"]),
        profileAnchorIndustries: ["IT"],
        profileAnchorJobTypes: ["企画職"],
      }),
    );
    expect(fetchFastApiInternalMock).toHaveBeenCalledTimes(1);
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
