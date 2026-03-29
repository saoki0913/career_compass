import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  dbSelectMock,
  dbUpdateMock,
  dbInsertMock,
  enqueueDeadlineSyncMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  enqueueDeadlineSyncMock: vi.fn(),
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
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/calendar/sync", () => ({
  enqueueDeadlineDelete: vi.fn(),
  enqueueDeadlineSync: enqueueDeadlineSyncMock,
}));

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
    set: (...args: unknown[]) => Query;
    returning: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.set = vi.fn(() => query as Query);
  query.returning = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

describe("api/deadlines/[id] PUT", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    enqueueDeadlineSyncMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
  });

  it("creates the standard tasks with one batch insert", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      isConfirmed: false,
      completedAt: null,
    };

    const selectResults = [[deadline], [{ id: "company-1", userId: "user-1" }], [{ id: "company-1", userId: "user-1" }]];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              ...deadline,
              type: "other",
              title: "締切",
              description: null,
              memo: null,
              sourceUrl: null,
              confidence: 0,
              completedAt: null,
              createdAt: new Date("2026-03-01T00:00:00.000Z"),
              updatedAt: new Date("2026-03-01T00:00:00.000Z"),
            },
          ]),
        })),
      })),
    });

    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    });

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isConfirmed: true }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    const insertValuesMock = dbInsertMock.mock.results[0]?.value.values as
      | { mock: { calls: Array<[Array<{ title: string }>] > } }
      | undefined;
    const insertedRows = insertValuesMock?.mock.calls[0]?.[0];
    expect(insertedRows).toHaveLength(3);
    expect(insertedRows?.[0]?.title).toBe("ES作成");
  });
});
