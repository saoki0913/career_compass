import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbSelectMock,
  dbUpdateMock,
  getIdentityMock,
  verifyGakuchikaAccessMock,
  getQuestionFromFastAPIMock,
  serializeConversationStateMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  getIdentityMock: vi.fn(),
  verifyGakuchikaAccessMock: vi.fn(),
  getQuestionFromFastAPIMock: vi.fn(),
  serializeConversationStateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

vi.mock("@/app/api/_shared/llm-cost-guard", () => ({
  guardDailyTokenLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/llm-cost-limit", () => ({
  computeTotalTokens: vi.fn(() => 0),
  incrementDailyTokenCount: vi.fn(),
}));

vi.mock("@/app/api/gakuchika", () => ({
  getIdentity: getIdentityMock,
  verifyGakuchikaAccess: verifyGakuchikaAccessMock,
  getQuestionFromFastAPI: getQuestionFromFastAPIMock,
  getGakuchikaNextAction: (state: { stage?: string; draftText?: string | null } | null) => {
    if (!state) return "ask";
    if (state.stage === "interview_ready") return "show_interview_ready";
    if (state.stage === "draft_ready") return state.draftText ? "continue_deep_dive" : "show_generate_draft_cta";
    return "ask";
  },
  isInterviewReady: (state: { stage?: string; draftText?: string | null } | null) =>
    state?.stage === "interview_ready" && Boolean(state.draftText),
  safeParseMessages: (json: string) => JSON.parse(json),
  safeParseConversationState: (json: string) => JSON.parse(json),
  serializeConversationState: serializeConversationStateMock,
}));

describe("api/gakuchika/[id]/conversation/resume", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    getIdentityMock.mockReset();
    verifyGakuchikaAccessMock.mockReset();
    getQuestionFromFastAPIMock.mockReset();
    serializeConversationStateMock.mockReset();

    getIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    verifyGakuchikaAccessMock.mockResolvedValue(true);
    serializeConversationStateMock.mockImplementation((value) => JSON.stringify(value));

    const gakuchikaQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "g-1",
              title: "学園祭",
              content: "導線改善",
              charLimitType: "400",
            },
          ]),
        })),
      })),
    };
    const conversationQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "c-1",
              gakuchikaId: "g-1",
              status: "in_progress",
              questionCount: 4,
              messages: JSON.stringify([
                { id: "m-1", role: "assistant", content: "結果はどうでしたか。" },
                { id: "m-2", role: "user", content: "混雑が減りました。" },
              ]),
              starScores: JSON.stringify({
                stage: "draft_ready",
                readyForDraft: true,
                draftText: "生成済みのES本文",
                pausedQuestion: "なぜその改善方法を選んだのですか。",
                extendedDeepDiveRound: 0,
              }),
            },
          ]),
        })),
      })),
    };
    const sessionsQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([
            {
              id: "c-1",
              status: "in_progress",
              starScores: JSON.stringify({ stage: "deep_dive_active" }),
              questionCount: 4,
              createdAt: new Date("2026-04-26T00:00:00Z"),
            },
          ]),
        })),
      })),
    };
    dbSelectMock
      .mockReturnValueOnce(gakuchikaQuery)
      .mockReturnValueOnce(conversationQuery)
      .mockReturnValueOnce(sessionsQuery);
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
  });

  it("resumes from persisted pausedQuestion without generating a second question", async () => {
    const { POST } = await import("@/app/api/gakuchika/[id]/conversation/resume/route");
    const request = new NextRequest("http://localhost:3000/api/gakuchika/g-1/conversation/resume", {
      method: "POST",
      body: JSON.stringify({ sessionId: "c-1" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "g-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getQuestionFromFastAPIMock).not.toHaveBeenCalled();
    expect(body.nextQuestion).toBe("なぜその改善方法を選んだのですか。");
    expect(body.conversationState.stage).toBe("deep_dive_active");
    expect(body.conversationState.pausedQuestion).toBeNull();
    expect(body.messages.at(-1)).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: "なぜその改善方法を選んだのですか。",
      }),
    );
  });

  it("ignores stale pausedQuestion when draft_ready has no draft text and asks FastAPI in es_building mode", async () => {
    dbSelectMock.mockReset();
    const gakuchikaQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "g-1",
              title: "学園祭",
              content: "導線改善",
              charLimitType: "400",
            },
          ]),
        })),
      })),
    };
    const conversationQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "c-1",
              gakuchikaId: "g-1",
              status: "in_progress",
              questionCount: 4,
              messages: JSON.stringify([
                { id: "m-1", role: "assistant", content: "結果はどうでしたか。" },
                { id: "m-2", role: "user", content: "混雑が減りました。" },
              ]),
              starScores: JSON.stringify({
                stage: "draft_ready",
                readyForDraft: true,
                draftText: null,
                pausedQuestion: "古い深掘り質問です。",
                extendedDeepDiveRound: 0,
              }),
            },
          ]),
        })),
      })),
    };
    const sessionsQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([]),
        })),
      })),
    };
    dbSelectMock
      .mockReturnValueOnce(gakuchikaQuery)
      .mockReturnValueOnce(conversationQuery)
      .mockReturnValueOnce(sessionsQuery);
    getQuestionFromFastAPIMock.mockResolvedValue({
      question: "追加で結果の数字を教えてください。",
      error: null,
      conversationState: {
        stage: "es_building",
        readyForDraft: true,
        draftText: null,
        pausedQuestion: null,
      },
      nextAction: "ask",
      telemetry: null,
    });

    const { POST } = await import("@/app/api/gakuchika/[id]/conversation/resume/route");
    const request = new NextRequest("http://localhost:3000/api/gakuchika/g-1/conversation/resume", {
      method: "POST",
      body: JSON.stringify({ sessionId: "c-1" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "g-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getQuestionFromFastAPIMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      4,
      expect.objectContaining({
        stage: "es_building",
        readyForDraft: true,
        draftText: null,
      }),
      expect.any(String),
      expect.anything(),
    );
    expect(body.nextQuestion).toBe("追加で結果の数字を教えてください。");
    expect(body.conversationState.stage).toBe("es_building");
  });
});
