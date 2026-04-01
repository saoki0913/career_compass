import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  reserveCreditsMock,
  enforceRateLimitLayersMock,
  getMotivationConversationByConditionMock,
  resolveDraftReadyStateMock,
  safeParseConversationContextMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getMotivationConversationByConditionMock: vi.fn(),
  resolveDraftReadyStateMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
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
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: reserveCreditsMock,
  confirmReservation: vi.fn(),
  cancelReservation: vi.fn(),
}));

vi.mock("@/lib/motivation/conversation", () => ({
  getMotivationConversationByCondition: getMotivationConversationByConditionMock,
  resolveDraftReadyState: resolveDraftReadyStateMock,
  safeParseConversationContext: safeParseConversationContextMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: vi.fn(),
}));

function makeCompanyQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: "company-1",
            name: "テスト株式会社",
            industry: "IT",
          },
        ]),
      })),
    })),
  };
}

describe("api/motivation/[companyId]/generate-draft", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    reserveCreditsMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getMotivationConversationByConditionMock.mockReset();
    resolveDraftReadyStateMock.mockReset();
    safeParseConversationContextMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue(makeCompanyQuery());
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getMotivationConversationByConditionMock.mockResolvedValue({
      id: "conversation-1",
      status: "completed",
      conversationContext: JSON.stringify({ draftReady: true }),
      messages: JSON.stringify([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]),
    });
    safeParseConversationContextMock.mockReturnValue({ draftReady: true });
    resolveDraftReadyStateMock.mockReturnValue({ isDraftReady: true, unlockedAt: null });
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
});
