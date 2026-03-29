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
    transaction: vi.fn(async (fn: (tx: { insert: typeof dbInsertMock }) => Promise<unknown>) =>
      fn({ insert: dbInsertMock })
    ),
  },
}));

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    orderBy: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
    leftJoin: (...args: unknown[]) => Query;
    groupBy: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.orderBy = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.leftJoin = vi.fn(() => query as Query);
  query.groupBy = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

describe("api/documents/[id]/threads GET", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
  });

  it("returns message counts from a single grouped query", async () => {
    const doc = { id: "doc-1", userId: "user-1", guestId: null };
    const threads = [
      {
        id: "thread-1",
        title: "A",
        status: "active",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        messageCount: 3,
      },
      {
        id: "thread-2",
        title: "B",
        status: "resolved",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        messageCount: 1,
      },
    ];

    const selectResults = [[doc], threads];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    const { GET } = await import("@/app/api/documents/[id]/threads/route");
    const request = new NextRequest("http://localhost:3000/api/documents/doc-1/threads");
    const response = await GET(request, { params: Promise.resolve({ id: "doc-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toHaveLength(2);
    expect(data.threads[0].messageCount).toBe(3);
    expect(data.threads[1].messageCount).toBe(1);
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });
});
