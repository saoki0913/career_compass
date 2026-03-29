import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  dbSelectMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  dbSelectMock: vi.fn(),
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
  },
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

describe("api/notifications GET", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
  });

  it("returns unreadCount from the aggregate count query", async () => {
    const notifications = [
      {
        id: "notification-1",
        userId: "user-1",
        guestId: null,
        type: "daily_summary",
        title: "今日のサマリー",
        message: "message",
        data: null,
        isRead: false,
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        expiresAt: null,
      },
    ];
    const unreadCountRows = [{ unreadCount: 3 }];

    const selectResults = [notifications, unreadCountRows];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    const { GET } = await import("@/app/api/notifications/route");
    const request = new NextRequest("http://localhost:3000/api/notifications?limit=10");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notifications).toHaveLength(1);
    expect(data.unreadCount).toBe(3);
  });
});
