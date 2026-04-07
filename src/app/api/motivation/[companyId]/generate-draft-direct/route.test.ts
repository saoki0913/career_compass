import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  dbUpdateMock,
  dbInsertMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
  enforceRateLimitLayersMock,
  getMotivationConversationByConditionMock,
  safeParseConversationContextMock,
  fetchFastApiInternalMock,
  fetchProfileContextMock,
  fetchGakuchikaContextMock,
  resolveMotivationRoleContextMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getMotivationConversationByConditionMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  fetchProfileContextMock: vi.fn(),
  fetchGakuchikaContextMock: vi.fn(),
  resolveMotivationRoleContextMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
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

vi.mock("@/lib/motivation/conversation", () => ({
  DEFAULT_CONFIRMED_FACTS: {},
  DEFAULT_MOTIVATION_CONTEXT: {},
  getMotivationConversationByCondition: getMotivationConversationByConditionMock,
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

vi.mock("@/lib/constants/es-review-role-catalog", () => ({
  resolveMotivationRoleContext: resolveMotivationRoleContextMock,
}));

function makeSelectChain(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
      leftJoin: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    })),
  };
}

describe("api/motivation/[companyId]/generate-draft-direct", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getMotivationConversationByConditionMock.mockReset();
    safeParseConversationContextMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    fetchProfileContextMock.mockReset();
    fetchGakuchikaContextMock.mockReset();
    resolveMotivationRoleContextMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    let selectCall = 0;
    dbSelectMock.mockImplementation(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return makeSelectChain([{ id: "company-1", name: "テスト株式会社", industry: "IT" }]);
      }
      return makeSelectChain([]);
    });
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
    getMotivationConversationByConditionMock.mockResolvedValue({
      id: "conversation-1",
      messages: "[]",
      questionCount: 0,
      conversationContext: "{}",
    });
    safeParseConversationContextMock.mockReturnValue({});
    fetchProfileContextMock.mockResolvedValue({ target_job_types: [] });
    fetchGakuchikaContextMock.mockResolvedValue([]);
    resolveMotivationRoleContextMock.mockReturnValue({
      roleCandidates: ["企画職"],
      industrySource: "company_field",
    });
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
});
