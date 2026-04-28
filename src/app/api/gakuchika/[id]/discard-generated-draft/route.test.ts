import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbSelectMock,
  dbUpdateMock,
  dbTransactionMock,
  getCsrfFailureReasonMock,
  getIdentityMock,
  safeParseConversationStateMock,
  serializeConversationStateMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  getCsrfFailureReasonMock: vi.fn(),
  getIdentityMock: vi.fn(),
  safeParseConversationStateMock: vi.fn(),
  serializeConversationStateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/app/api/gakuchika", () => ({
  getIdentity: getIdentityMock,
  safeParseConversationState: safeParseConversationStateMock,
  serializeConversationState: serializeConversationStateMock,
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: getCsrfFailureReasonMock,
}));

function makeSelectResult(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeUpdateMock() {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]),
      })),
    })),
  };
}

describe("api/gakuchika/[id]/discard-generated-draft", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbTransactionMock.mockReset();
    getCsrfFailureReasonMock.mockReset();
    getIdentityMock.mockReset();
    safeParseConversationStateMock.mockReset();
    serializeConversationStateMock.mockReset();

    getCsrfFailureReasonMock.mockReturnValue(null);
    getIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    serializeConversationStateMock.mockImplementation((value) => JSON.stringify(value));
    dbUpdateMock.mockImplementation(makeUpdateMock);
    dbTransactionMock.mockImplementation(async (callback) => {
      await callback({ update: dbUpdateMock });
    });
  });

  it("soft-deletes only the draft document produced by the same conversation", async () => {
    safeParseConversationStateMock.mockReturnValue({
      stage: "interview_ready",
      readyForDraft: true,
      draftText: "本文",
      draftDocumentId: "doc-1",
      summaryStale: false,
      pausedQuestion: "追加で教えてください。",
    });
    dbSelectMock
      .mockReturnValueOnce(makeSelectResult([{ id: "g-1", userId: "user-1", title: "テスト" }]))
      .mockReturnValueOnce(makeSelectResult([{ id: "c-1", gakuchikaId: "g-1", starScores: "{}" }]))
      .mockReturnValueOnce(makeSelectResult([{
        id: "doc-1",
        userId: "user-1",
        type: "es",
        status: "draft",
        title: "テスト ガクチカ",
        content: "本文",
      }]));

    const { POST } = await import("@/app/api/gakuchika/[id]/discard-generated-draft/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/discard-generated-draft", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1", documentId: "doc-1" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversationState).toEqual(
      expect.objectContaining({
        stage: "draft_ready",
        draftText: null,
        draftDocumentId: null,
        summaryStale: true,
      }),
    );
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a draft document owned by another user", async () => {
    safeParseConversationStateMock.mockReturnValue({
      stage: "interview_ready",
      draftText: "本文",
      draftDocumentId: "doc-2",
    });
    dbSelectMock
      .mockReturnValueOnce(makeSelectResult([{ id: "g-1", userId: "user-1", title: "テスト" }]))
      .mockReturnValueOnce(makeSelectResult([{ id: "c-1", gakuchikaId: "g-1", starScores: "{}" }]))
      .mockReturnValueOnce(makeSelectResult([{
        id: "doc-2",
        userId: "user-2",
        type: "es",
        status: "draft",
        title: "テスト ガクチカ",
        content: "本文",
      }]));

    const { POST } = await import("@/app/api/gakuchika/[id]/discard-generated-draft/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/discard-generated-draft", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1", documentId: "doc-2" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );

    expect(response.status).toBe(404);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects missing CSRF before resolving identity", async () => {
    getCsrfFailureReasonMock.mockReturnValue("missing_token");

    const { POST } = await import("@/app/api/gakuchika/[id]/discard-generated-draft/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gakuchika/g-1/discard-generated-draft", {
        method: "POST",
        body: JSON.stringify({ sessionId: "c-1", documentId: "doc-1" }),
      }),
      { params: Promise.resolve({ id: "g-1" }) },
    );

    expect(response.status).toBe(403);
    expect(getIdentityMock).not.toHaveBeenCalled();
  });
});
