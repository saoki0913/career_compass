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
  resolveDraftReadyStateMock,
  safeParseConversationContextMock,
  safeParseMessagesMock,
  fetchFastApiInternalMock,
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
  resolveDraftReadyStateMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
  safeParseMessagesMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
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
  getMotivationConversationByCondition: getMotivationConversationByConditionMock,
  resolveDraftReadyState: resolveDraftReadyStateMock,
  safeParseConversationContext: safeParseConversationContextMock,
  safeParseMessages: safeParseMessagesMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
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
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getMotivationConversationByConditionMock.mockReset();
    resolveDraftReadyStateMock.mockReset();
    safeParseConversationContextMock.mockReset();
    safeParseMessagesMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue(makeCompanyQuery());
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
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
    safeParseConversationContextMock.mockReturnValue({
      draftReady: true,
      selectedIndustry: "IT",
      selectedRole: "企画職",
      questionStage: "differentiation",
    });
    safeParseMessagesMock.mockReturnValue([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
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

  it("returns a deepdive follow-up question after draft generation succeeds", async () => {
    fetchFastApiInternalMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            draft: "志望動機の下書きです。",
            char_count: 120,
            key_points: ["企業理解", "自己接続"],
            company_keywords: ["DX支援"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            question: "この志望動機をさらに強めるために、原体験のどの点を補足したいですか？",
            draft_ready: true,
            evidence_summary: "参考情報",
            evidence_cards: [],
            coaching_focus: "補足深掘り",
            question_stage: "self_connection",
            conversation_mode: "deepdive",
            current_slot: "self_connection",
            current_intent: "experience_anchor",
            next_advance_condition: "原体験とのつながりが1つ補えれば十分です。",
            progress: { completed: 6, total: 6, current_slot: "self_connection", current_slot_label: "自分との接続", current_intent: "experience_anchor", next_advance_condition: "原体験とのつながりが1つ補えれば十分です。", mode: "deepdive" },
            causal_gaps: [{ id: "self_connection_gap", slot: "self_connection", reason: "経験との接続が弱い", promptHint: "過去の経験や価値観とのつながりを補う" }],
            stage_status: { current: "self_connection", completed: ["industry_reason"], pending: ["value_contribution"] },
            captured_context: {
              draftReady: true,
              selectedIndustry: "IT",
              selectedRole: "企画職",
              questionStage: "self_connection",
            },
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
    expect(payload.nextQuestion).toBe("この志望動機をさらに強めるために、原体験のどの点を補足したいですか？");
    expect(payload.conversationMode).toBe("deepdive");
    expect(payload.currentSlot).toBe("self_connection");
    expect(payload.coachingFocus).toBe("補足深掘り");
  });

  it("keeps the generated draft as conversation state without creating an ES document immediately", async () => {
    fetchFastApiInternalMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            draft: "志望動機の下書きです。",
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
            question: "次に補強したい点はどこですか？",
            evidence_cards: [],
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
    expect(payload.documentId).toBeNull();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });
});
