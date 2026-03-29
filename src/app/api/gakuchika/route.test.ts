import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  dbSelectMock,
  dbInsertMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: authGetSessionMock,
    },
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: getGuestUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
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

describe("api/gakuchika GET", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
  });

  it("loads latest conversations in the main contents query", async () => {
    const profile = [{ plan: "free" }];
    const contents = [
      {
        id: "gk-1",
        userId: "user-1",
        guestId: null,
        summary: "summary-1",
        sortOrder: 0,
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
        conversationStatus: "done",
        conversationStarScores: JSON.stringify({ situation: 2, task: 2, action: 2, result: 2 }),
        conversationQuestionCount: 4,
      },
      {
        id: "gk-2",
        userId: "user-1",
        guestId: null,
        summary: "summary-2",
        sortOrder: 1,
        updatedAt: new Date("2026-03-03T00:00:00.000Z"),
        conversationStatus: "active",
        conversationStarScores: null,
        conversationQuestionCount: 1,
      },
    ];

    const selectResults = [profile, contents];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    const { GET } = await import("@/app/api/gakuchika/route");
    const request = new NextRequest("http://localhost:3000/api/gakuchika");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gakuchikas).toHaveLength(2);
    expect(data.gakuchikas[0].conversationStatus).toBe("done");
    expect(data.gakuchikas[0].questionCount).toBe(4);
    expect(data.gakuchikas[1].conversationStatus).toBe("active");
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });
});
