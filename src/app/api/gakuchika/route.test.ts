import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  dbSelectMock,
  dbExecuteMock,
  dbInsertMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbExecuteMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    execute: dbExecuteMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/gakuchika/summary", () => ({
  getGakuchikaSummaryKind: vi.fn(() => "bullet"),
  getGakuchikaSummaryPreview: vi.fn(() => "preview"),
}));

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    orderBy: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.orderBy = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

function makeRejectedThenableQuery(error: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    orderBy: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.orderBy = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.reject(error).then(resolve, reject)) as Query["then"];
  return query as Query;
}

const csrfHeaders = {
  origin: "http://localhost:3000",
  cookie: "csrf_token=test-csrf",
  "x-csrf-token": "test-csrf",
  "content-type": "application/json",
};

describe("normalizeGakuchikaListConversationStatus", () => {
  it("accepts in_progress and completed", async () => {
    const { normalizeGakuchikaListConversationStatus } = await import("@/app/api/gakuchika/route");
    expect(normalizeGakuchikaListConversationStatus("in_progress", 0)).toBe("in_progress");
    expect(normalizeGakuchikaListConversationStatus("completed", 0)).toBe("completed");
  });

  it("returns null when no valid status and no questions", async () => {
    const { normalizeGakuchikaListConversationStatus } = await import("@/app/api/gakuchika/route");
    expect(normalizeGakuchikaListConversationStatus(null, 0)).toBe(null);
    expect(normalizeGakuchikaListConversationStatus("", 0)).toBe(null);
    expect(normalizeGakuchikaListConversationStatus("bogus", 0)).toBe(null);
  });

  it("falls back to in_progress when questionCount>0", async () => {
    const { normalizeGakuchikaListConversationStatus } = await import("@/app/api/gakuchika/route");
    expect(normalizeGakuchikaListConversationStatus(null, 3)).toBe("in_progress");
    expect(normalizeGakuchikaListConversationStatus("bogus", 1)).toBe("in_progress");
  });
});

describe("api/gakuchika", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    dbSelectMock.mockReset();
    dbExecuteMock.mockReset();
    dbInsertMock.mockReset();
  });

  it("loads latest conversations via batch fetch and normalizes status", async () => {
    const profile = [{ plan: "free" }];
    const contents = [
      {
        id: "gk-1",
        userId: "user-1",
        guestId: null,
        title: "T1",
        content: "C1",
        charLimitType: "400" as const,
        summary: "summary-1",
        linkedCompanyIds: null,
        sortOrder: 0,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
      {
        id: "gk-2",
        userId: "user-1",
        guestId: null,
        title: "T2",
        content: "C2",
        charLimitType: "400" as const,
        summary: "summary-2",
        linkedCompanyIds: null,
        sortOrder: 1,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-03T00:00:00.000Z"),
      },
    ];
    const conversations = [
      {
        gakuchika_id: "gk-1",
        status: "completed",
        star_scores: JSON.stringify({ stage: "interview_ready" }),
        question_count: 4,
      },
      {
        gakuchika_id: "gk-2",
        status: "in_progress",
        star_scores: null,
        question_count: 1,
      },
    ];

    const selectResults = [profile, contents];
    let selectCallIndex = 0;
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));
    dbExecuteMock.mockResolvedValue(conversations);

    const { GET } = await import("@/app/api/gakuchika/route");
    const request = new NextRequest("http://localhost:3000/api/gakuchika");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gakuchikas).toHaveLength(2);
    expect(data.gakuchikas[0].conversationStatus).toBe("completed");
    expect(data.gakuchikas[0].questionCount).toBe(4);
    expect(data.gakuchikas[1].conversationStatus).toBe("in_progress");
    expect(getRequestIdentityMock).toHaveBeenCalledWith(request, expect.objectContaining({
      sessionErrorMode: "throw",
    }));
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("infers in_progress when questionCount>0 but raw status is invalid", async () => {
    const profile = [{ plan: "free" }];
    const contents = [
      {
        id: "gk-x",
        userId: "user-1",
        guestId: null,
        title: "T",
        content: "C",
        charLimitType: "400" as const,
        summary: null,
        linkedCompanyIds: null,
        sortOrder: 0,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
    ];
    const conversations = [
      {
        gakuchika_id: "gk-x",
        status: "bogus",
        star_scores: null,
        question_count: 2,
      },
    ];
    const selectResults = [profile, contents];
    let selectCallIndex = 0;
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));
    dbExecuteMock.mockResolvedValue(conversations);

    const { GET } = await import("@/app/api/gakuchika/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/gakuchika"));
    const data = await response.json();
    expect(data.gakuchikas[0].conversationStatus).toBe("in_progress");
    expect(data.gakuchikas[0].questionCount).toBe(2);
  });

  it("creates a gakuchika for an authenticated user resolved via shared request identity", async () => {
    const now = new Date("2026-03-31T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const inserted = [
      {
        id: "gk-new",
        userId: "user-1",
        guestId: null,
        title: "学園祭での改善",
        content: "模擬店のオペレーションを改善した。",
        charLimitType: "400",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ];

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock
      .mockImplementationOnce(() => ({
        from: vi.fn(() => makeThenableQuery([{ plan: "free" }])),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => makeThenableQuery([{ count: 0 }])),
      }));
    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(inserted),
      })),
    });

    const { POST } = await import("@/app/api/gakuchika/route");
    const request = new NextRequest("http://localhost:3000/api/gakuchika", {
      method: "POST",
      body: JSON.stringify({
        title: "学園祭での改善",
        content: "模擬店のオペレーションを改善した。",
        charLimitType: "400",
      }),
      headers: csrfHeaders,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getRequestIdentityMock).toHaveBeenCalledWith(request, expect.objectContaining({
      sessionErrorMode: "throw",
    }));
    expect(data.gakuchika.id).toBe("gk-new");
    expect(data.gakuchika.userId).toBeUndefined();
    expect(data.gakuchika.guestId).toBeUndefined();

    vi.useRealTimers();
  });

  it("returns a structured 401 when list identity is missing", async () => {
    getRequestIdentityMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/gakuchika/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/gakuchika"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(data.requestId).toBeTruthy();
    expect(data.error).toMatchObject({
      code: "GAKUCHIKA_LIST_AUTH_REQUIRED",
      userMessage: "ログインが必要です。",
      action: "ログインしてから、もう一度お試しください。",
      retryable: false,
    });
  });

  it("returns a structured 500 when list loading fails", async () => {
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock
      .mockImplementationOnce(() => ({
        from: vi.fn(() => makeThenableQuery([{ plan: "free" }])),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => makeRejectedThenableQuery(new Error("db failed"))),
      }));

    const { GET } = await import("@/app/api/gakuchika/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/gakuchika"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(data.error).toMatchObject({
      code: "GAKUCHIKA_LIST_FETCH_FAILED",
      userMessage: "ガクチカ一覧を読み込めませんでした。",
      action: "時間を置いて、もう一度読み込んでください。",
      retryable: true,
    });
    expect(JSON.stringify(data)).not.toContain("Internal server error");
  });

  it("returns a structured 400 before quota checks when create body is invalid", async () => {
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });

    const { POST } = await import("@/app/api/gakuchika/route");
    const response = await POST(new NextRequest("http://localhost:3000/api/gakuchika", {
      method: "POST",
      body: JSON.stringify({ title: "", content: "内容" }),
      headers: csrfHeaders,
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatchObject({
      code: "GAKUCHIKA_TITLE_REQUIRED",
      userMessage: "テーマは必須です。",
    });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});
