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

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    orderBy: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
    leftJoin: (...args: unknown[]) => Query;
    innerJoin: (...args: unknown[]) => Query;
    groupBy: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.orderBy = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.leftJoin = vi.fn(() => query as Query);
  query.innerJoin = vi.fn(() => query as Query);
  query.groupBy = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

describe("api/companies/[id]/applications GET", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
  });

  it("aggregates deadlines in one joined query per request", async () => {
    const company = { id: "company-1", userId: "user-1" };
    const applications = [
      {
        id: "app-1",
        companyId: "company-1",
        type: "main",
        phase: JSON.stringify(["ES提出"]),
        sortOrder: 0,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: "app-2",
        companyId: "company-1",
        type: "other",
        phase: null,
        sortOrder: 1,
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
    ];
    const joinedRows = [
      {
        application: applications[0],
        deadline: {
          id: "deadline-1",
          title: "ES提出",
          dueDate: new Date("2026-04-01T00:00:00.000Z"),
          type: "es_submission",
          completedAt: null,
        },
      },
      {
        application: applications[0],
        deadline: {
          id: "deadline-2",
          title: "面接",
          dueDate: new Date("2026-05-01T00:00:00.000Z"),
          type: "interview_1",
          completedAt: null,
        },
      },
      {
        application: applications[1],
        deadline: null,
      },
    ];

    const selectResults = [[company], joinedRows];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    const { GET } = await import("@/app/api/companies/[id]/applications/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/applications");
    const response = await GET(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.applications).toHaveLength(2);
    expect(data.applications[0].deadlineCount).toBe(2);
    expect(data.applications[0].upcomingDeadlineCount).toBe(2);
    expect(data.applications[0].nearestDeadline.id).toBe("deadline-1");
    expect(data.applications[1].deadlineCount).toBe(0);
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });
});
