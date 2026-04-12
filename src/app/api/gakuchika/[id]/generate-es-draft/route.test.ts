import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbSelectMock,
  dbUpdateMock,
  dbInsertMock,
  reserveCreditsMock,
  confirmReservationMock,
  cancelReservationMock,
  enforceRateLimitLayersMock,
  getIdentityMock,
  isDraftReadyMock,
  safeParseConversationStateMock,
  safeParseMessagesMock,
  serializeConversationStateMock,
  fetchFastApiInternalMock,
  normalizeEsDraftSingleParagraphMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  reserveCreditsMock: vi.fn(),
  confirmReservationMock: vi.fn(),
  cancelReservationMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getIdentityMock: vi.fn(),
  isDraftReadyMock: vi.fn(),
  safeParseConversationStateMock: vi.fn(),
  safeParseMessagesMock: vi.fn(),
  serializeConversationStateMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  normalizeEsDraftSingleParagraphMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: reserveCreditsMock,
  confirmReservation: confirmReservationMock,
  cancelReservation: cancelReservationMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  DRAFT_RATE_LAYERS: [],
}));

vi.mock("@/app/api/gakuchika", () => ({
  getIdentity: getIdentityMock,
  isDraftReady: isDraftReadyMock,
  safeParseConversationState: safeParseConversationStateMock,
  safeParseMessages: safeParseMessagesMock,
  serializeConversationState: serializeConversationStateMock,
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
}));

vi.mock("@/lib/server/es-draft-normalize", () => ({
  normalizeEsDraftSingleParagraph: normalizeEsDraftSingleParagraphMock,
}));

vi.mock("@/lib/server/fastapi-detail-message", () => ({
  messageFromFastApiDetail: vi.fn(() => null),
}));

vi.mock("@/lib/es-review/es-document-section-titles", () => ({
  buildGakuchikaEsSectionTitle: vi.fn(() => "ガクチカ"),
}));

describe("api/gakuchika/[id]/generate-es-draft", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    reserveCreditsMock.mockReset();
    confirmReservationMock.mockReset();
    cancelReservationMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getIdentityMock.mockReset();
    isDraftReadyMock.mockReset();
    safeParseConversationStateMock.mockReset();
    safeParseMessagesMock.mockReset();
    serializeConversationStateMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    normalizeEsDraftSingleParagraphMock.mockReset();

    const companyQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "g-1",
              title: "学園祭実行委員",
              content: "模擬店エリア運営",
              userId: "user-1",
              guestId: null,
            },
          ]),
        })),
      })),
    };
    const conversationQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "c-1",
                gakuchikaId: "g-1",
                status: "in_progress",
                starScores: JSON.stringify({ ready_for_draft: true }),
                messages: JSON.stringify([
                  { role: "assistant", content: "質問" },
                  { role: "user", content: "大学3年の学園祭実行委員として模擬店導線改善に取り組みました。" },
                  { role: "assistant", content: "課題は何でしたか。" },
                  { role: "user", content: "昼のピーク時に待機列が交差して回遊しにくい点が課題でした。" },
                  { role: "assistant", content: "何をしましたか。" },
                  { role: "user", content: "私は会場図を見直し、待機列と案内役の配置を再設計しました。" },
                  { role: "assistant", content: "結果はどうでしたか。" },
                  { role: "user", content: "ピーク時の詰まりが減り、参加団体から回りやすくなったと言われました。" },
                ]),
                updatedAt: new Date(),
              },
            ]),
          })),
        })),
      })),
    };
    dbSelectMock.mockReturnValueOnce(companyQuery).mockReturnValueOnce(conversationQuery);
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    getIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    enforceRateLimitLayersMock.mockResolvedValue(null);
    reserveCreditsMock.mockResolvedValue({ success: true, reservationId: "res-1" });
    isDraftReadyMock.mockReturnValue(true);
    safeParseConversationStateMock.mockReturnValue({
      stage: "draft_ready",
      focusKey: "result",
      progressLabel: "ESを作成できます",
      answerHint: "結果の前後差まで書けています。",
      inputRichnessMode: "almost_draftable",
      missingElements: [],
      draftQualityChecks: {
        task_clarity: true,
        action_ownership: true,
        role_required: true,
        role_clarity: true,
        result_traceability: true,
        learning_reusability: false,
      },
      causalGaps: [],
      completionChecks: {},
      readyForDraft: true,
      draftReadinessReason: "ES本文の材料は揃っています。",
      draftText: null,
      strengthTags: ["ownership_visible"],
      issueTags: ["learning_missing"],
      deepdiveRecommendationTags: ["learning_transfer"],
      credibilityRiskTags: [],
      deepdiveStage: null,
      deepdiveComplete: false,
      completionReasons: [],
      askedFocuses: ["context", "task", "action", "result"],
      resolvedFocuses: ["context", "task", "action", "result"],
      deferredFocuses: ["learning"],
      blockedFocuses: [],
      focusAttemptCounts: { task: 1, action: 1, result: 1 },
      lastQuestionSignature: "result:1",
      extendedDeepDiveRound: 0,
    });
    safeParseMessagesMock.mockReturnValue([
      { id: "1", role: "assistant", content: "質問" },
      { id: "2", role: "user", content: "大学3年の学園祭実行委員として模擬店導線改善に取り組みました。" },
      { id: "3", role: "assistant", content: "課題は何でしたか。" },
      { id: "4", role: "user", content: "昼のピーク時に待機列が交差して回遊しにくい点が課題でした。" },
      { id: "5", role: "assistant", content: "何をしましたか。" },
      { id: "6", role: "user", content: "私は会場図を見直し、待機列と案内役の配置を再設計しました。" },
      { id: "7", role: "assistant", content: "結果はどうでしたか。" },
      { id: "8", role: "user", content: "ピーク時の詰まりが減り、参加団体から回りやすくなったと言われました。" },
    ]);
    serializeConversationStateMock.mockReturnValue("{\"stage\":\"draft_ready\"}");
    normalizeEsDraftSingleParagraphMock.mockImplementation((value: string) => value);
    fetchFastApiInternalMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          draft: "私は学園祭実行委員として模擬店エリアの導線改善に取り組みました。",
          char_count: 34,
          followup_suggestion: "更に深掘りする",
          draft_diagnostics: {
            strength_tags: ["ownership_visible"],
            issue_tags: ["learning_missing"],
            deepdive_recommendation_tags: ["learning_transfer"],
            credibility_risk_tags: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  it("passes structured draft material to FastAPI", async () => {
    const { POST } = await import("@/app/api/gakuchika/[id]/generate-es-draft/route");
    const request = new NextRequest("http://localhost:3000/api/gakuchika/g-1/generate-es-draft", {
      method: "POST",
      body: JSON.stringify({ charLimit: 400 }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "g-1" }) });

    expect(response.status).toBe(200);
    expect(fetchFastApiInternalMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchFastApiInternalMock.mock.calls[0][1].body as string);
    expect(payload.known_facts).toContain("大学3年の学園祭実行委員");
    expect(payload.draft_material).toEqual(
      expect.objectContaining({
        input_richness_mode: "almost_draftable",
        missing_elements: [],
        draft_quality_checks: expect.objectContaining({
          action_ownership: true,
          result_traceability: true,
        }),
        deferred_focuses: ["learning"],
        issue_tags: ["learning_missing"],
        draft_readiness_reason: "ES本文の材料は揃っています。",
      }),
    );
    expect(confirmReservationMock).toHaveBeenCalledWith("res-1");
  });
});
