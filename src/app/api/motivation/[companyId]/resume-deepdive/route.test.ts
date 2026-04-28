import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbUpdateMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
  enforceRateLimitLayersMock,
  getRequestIdentityMock,
  getMotivationConversationByConditionMock,
  getOwnedMotivationCompanyDataMock,
  buildMotivationOwnerConditionMock,
  resolveDraftReadyStateMock,
  safeParseConversationContextMock,
  safeParseMessagesMock,
  safeParseEvidenceCardsMock,
  safeParseScoresMock,
  fetchFastApiInternalMock,
  buildMotivationConversationPayloadMock,
  resolveMotivationInputsMock,
  isMotivationSetupCompleteMock,
  fetchMotivationApplicationJobCandidatesMock,
  fetchProfileContextMock,
  fetchGakuchikaContextMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  getMotivationConversationByConditionMock: vi.fn(),
  getOwnedMotivationCompanyDataMock: vi.fn(),
  buildMotivationOwnerConditionMock: vi.fn(),
  resolveDraftReadyStateMock: vi.fn(),
  safeParseConversationContextMock: vi.fn(),
  safeParseMessagesMock: vi.fn(),
  safeParseEvidenceCardsMock: vi.fn(),
  safeParseScoresMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  buildMotivationConversationPayloadMock: vi.fn(),
  resolveMotivationInputsMock: vi.fn(),
  isMotivationSetupCompleteMock: vi.fn(),
  fetchMotivationApplicationJobCandidatesMock: vi.fn(),
  fetchProfileContextMock: vi.fn(),
  fetchGakuchikaContextMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: dbUpdateMock,
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
  safeParseMessages: safeParseMessagesMock,
  safeParseConversationContext: safeParseConversationContextMock,
  safeParseEvidenceCards: safeParseEvidenceCardsMock,
  safeParseScores: safeParseScoresMock,
  resolveDraftReadyState: resolveDraftReadyStateMock,
}));

vi.mock("@/lib/motivation/conversation-store", () => ({
  getMotivationConversationByCondition: getMotivationConversationByConditionMock,
}));

vi.mock("@/lib/motivation/conversation-payload", () => ({
  buildMotivationConversationPayload: buildMotivationConversationPayloadMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  CONVERSATION_RATE_LAYERS: [],
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

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
  fetchFastApiWithPrincipal: fetchFastApiInternalMock,
}));

vi.mock("@/lib/ai/user-context", () => ({
  fetchProfileContext: fetchProfileContextMock,
  fetchGakuchikaContext: fetchGakuchikaContextMock,
}));

vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: vi.fn().mockResolvedValue("standard"),
}));

vi.mock("@/lib/motivation/motivation-input-resolver", () => ({
  buildMotivationOwnerCondition: buildMotivationOwnerConditionMock,
  getOwnedMotivationCompanyData: getOwnedMotivationCompanyDataMock,
  resolveMotivationInputs: resolveMotivationInputsMock,
  isMotivationSetupComplete: isMotivationSetupCompleteMock,
  fetchMotivationApplicationJobCandidates: fetchMotivationApplicationJobCandidatesMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/ai/cost-summary-log", () => ({
  getRequestId: vi.fn().mockReturnValue("req-test-1"),
  logAiCreditCostSummary: vi.fn(),
  splitInternalTelemetry: vi.fn((raw) => ({ payload: raw, telemetry: null })),
}));

const BASE_CONVERSATION = {
  id: "conversation-1",
  status: "completed",
  generatedDraft: "テスト志望動機の下書きです。",
  conversationContext: JSON.stringify({ draftReady: true }),
  messages: JSON.stringify([
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ]),
  questionCount: 6,
  questionStage: "differentiation",
  motivationScores: null,
  lastEvidenceCards: null,
  stageStatus: null,
};

describe("api/motivation/[companyId]/resume-deepdive", () => {
  beforeEach(() => {
    dbUpdateMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getRequestIdentityMock.mockReset();
    getMotivationConversationByConditionMock.mockReset();
    getOwnedMotivationCompanyDataMock.mockReset();
    buildMotivationOwnerConditionMock.mockReset();
    resolveDraftReadyStateMock.mockReset();
    safeParseConversationContextMock.mockReset();
    safeParseMessagesMock.mockReset();
    safeParseEvidenceCardsMock.mockReset();
    safeParseScoresMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    buildMotivationConversationPayloadMock.mockReset();
    resolveMotivationInputsMock.mockReset();
    isMotivationSetupCompleteMock.mockReset();
    fetchMotivationApplicationJobCandidatesMock.mockReset();
    fetchProfileContextMock.mockReset();
    fetchGakuchikaContextMock.mockReset();
    vi.restoreAllMocks();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getOwnedMotivationCompanyDataMock.mockResolvedValue({
      id: "company-1",
      name: "テスト株式会社",
      industry: "IT",
    });
    buildMotivationOwnerConditionMock.mockReturnValue({ owner: "condition" });
    getMotivationConversationByConditionMock.mockResolvedValue({ ...BASE_CONVERSATION });
    safeParseConversationContextMock.mockReturnValue({
      draftReady: true,
      questionStage: "differentiation",
    });
    safeParseMessagesMock.mockReturnValue([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
    safeParseEvidenceCardsMock.mockReturnValue([]);
    safeParseScoresMock.mockReturnValue(null);
    resolveDraftReadyStateMock.mockReturnValue({ isDraftReady: true, unlockedAt: null });
    resolveMotivationInputsMock.mockReturnValue({
      requiresIndustrySelection: false,
      company: { industry: "IT" },
      conversationContext: {
        selectedIndustrySource: "company_field",
        questionStage: "differentiation",
      },
    });
    isMotivationSetupCompleteMock.mockReturnValue(true);
    fetchMotivationApplicationJobCandidatesMock.mockResolvedValue([]);
    fetchProfileContextMock.mockResolvedValue(null);
    fetchGakuchikaContextMock.mockResolvedValue([]);
    buildMotivationConversationPayloadMock.mockImplementation((args) => ({
      nextQuestion: args?.messages?.at(-1)?.content ?? null,
      isDraftReady: args?.isDraftReady ?? false,
      generatedDraft: args?.generatedDraft ?? null,
      messages: args?.messages ?? [],
      questionCount: args?.questionCount ?? 0,
      scores: args?.scores ?? null,
      evidenceSummary: null,
      evidenceCards: args?.evidenceCards ?? [],
      coachingFocus: args?.coachingFocus ?? null,
      riskFlags: [],
      questionStage: args?.conversationContext?.questionStage ?? "differentiation",
      stageStatus: args?.stageStatusValue ?? null,
      conversationMode: args?.conversationMode ?? "deepdive",
      currentSlot: args?.currentSlot ?? null,
      currentIntent: args?.currentIntent ?? null,
      nextAdvanceCondition: args?.nextAdvanceCondition ?? null,
      progress: args?.progress ?? null,
      causalGaps: args?.causalGaps ?? [],
      conversationContext: args?.conversationContext ?? {},
      setup: {
        selectedIndustry: null,
        selectedRole: null,
        selectedRoleSource: null,
        requiresIndustrySelection: false,
        resolvedIndustry: args?.resolvedIndustry ?? null,
        isComplete: args?.isSetupComplete ?? false,
        hasSavedConversation: true,
        requiresRestart: false,
      },
      error: null,
    }));
  });

  it("returns follow-up question without consuming credits", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          question: "さらに深掘りしたい点はありますか？",
          evidence_summary: null,
          evidence_cards: [],
          coaching_focus: "補足深掘り",
          question_stage: "differentiation",
          conversation_mode: "deepdive",
          current_slot: "company_reason",
          current_intent: "experience_anchor",
          next_advance_condition: "原体験との接続が補えれば十分です。",
          progress: { completed: 6, total: 6 },
          causal_gaps: [],
          stage_status: null,
          captured_context: { draftReady: true, questionStage: "differentiation" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { POST } = await import(
      "@/app/api/motivation/[companyId]/resume-deepdive/route"
    );
    const request = new NextRequest(
      "http://localhost:3000/api/motivation/company-1/resume-deepdive",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ companyId: "company-1" }),
    });

    expect(response.status).toBe(200);
    expect(buildMotivationConversationPayloadMock).toHaveBeenCalled();
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(confirmReservationMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it("returns 409 when no generatedDraft exists", async () => {
    getMotivationConversationByConditionMock.mockResolvedValueOnce({
      ...BASE_CONVERSATION,
      generatedDraft: null,
    });

    const { POST } = await import(
      "@/app/api/motivation/[companyId]/resume-deepdive/route"
    );
    const request = new NextRequest(
      "http://localhost:3000/api/motivation/company-1/resume-deepdive",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ companyId: "company-1" }),
    });

    expect(response.status).toBe(409);
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(fetchFastApiInternalMock).not.toHaveBeenCalled();
  });

  it("returns 503 when FastAPI fails", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "tenant key is not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { POST } = await import(
      "@/app/api/motivation/[companyId]/resume-deepdive/route"
    );
    const request = new NextRequest(
      "http://localhost:3000/api/motivation/company-1/resume-deepdive",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ companyId: "company-1" }),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("FASTAPI_TENANT_KEY_NOT_CONFIGURED");
    expect(body.error.llmErrorType).toBe("tenant_key_not_configured");
    expect(body.error.userMessage).toBe("AI認証設定が未完了です。管理側で設定確認後に再度お試しください。");
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("preserves FastAPI 429 status for concurrency errors", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { code: "sse_concurrency_exceeded", limit: 1 } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { POST } = await import(
      "@/app/api/motivation/[companyId]/resume-deepdive/route"
    );
    const request = new NextRequest(
      "http://localhost:3000/api/motivation/company-1/resume-deepdive",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ companyId: "company-1" }),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("AI_STREAM_CONCURRENCY_EXCEEDED");
    expect(body.error.retryable).toBe(true);
  });

  it("returns structured 503 when principal secret is missing", async () => {
    fetchFastApiInternalMock.mockRejectedValueOnce(
      new Error("CAREER_PRINCIPAL_HMAC_SECRET is not configured"),
    );

    const { POST } = await import(
      "@/app/api/motivation/[companyId]/resume-deepdive/route"
    );
    const request = new NextRequest(
      "http://localhost:3000/api/motivation/company-1/resume-deepdive",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ companyId: "company-1" }),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("FASTAPI_SECRET_NOT_CONFIGURED");
    expect(body.error.userMessage).toBe("AI認証設定が未完了です。管理側で設定確認後に再度お試しください。");
  });

  it("returns 429 when deepdiveResumeCount exceeds limit", async () => {
    safeParseConversationContextMock.mockReturnValueOnce({
      draftReady: true,
      questionStage: "differentiation",
      deepdiveResumeCount: 3,
    });

    const { POST } = await import(
      "@/app/api/motivation/[companyId]/resume-deepdive/route"
    );
    const request = new NextRequest(
      "http://localhost:3000/api/motivation/company-1/resume-deepdive",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ companyId: "company-1" }),
    });

    expect(response.status).toBe(429);
    expect(fetchFastApiInternalMock).not.toHaveBeenCalled();
  });
});
