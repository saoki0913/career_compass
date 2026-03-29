import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getRequestIdentityMock, dbSelectMock } = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

function makeUpcomingDeadlinesQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

describe("api/deadlines/upcoming", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    dbSelectMock.mockReset();
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns 401 when the request has no valid identity", async () => {
    const { GET } = await import("@/app/api/deadlines/upcoming/route");
    getRequestIdentityMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost:3000/api/deadlines/upcoming"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("UPCOMING_DEADLINES_AUTH_REQUIRED");
  });

  it("returns an empty list when the user has no companies", async () => {
    const { GET } = await import("@/app/api/deadlines/upcoming/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(makeUpcomingDeadlinesQuery([]));

    const response = await GET(new NextRequest("http://localhost:3000/api/deadlines/upcoming?days=7"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      deadlines: [],
      count: 0,
      periodDays: 7,
    });
  });

  it("defaults invalid days values and serializes due dates", async () => {
    const { GET } = await import("@/app/api/deadlines/upcoming/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });

    const deadlineDate = new Date("2026-03-20T12:00:00.000Z");
    dbSelectMock
      .mockReturnValueOnce(
        makeUpcomingDeadlinesQuery([
          {
            deadline: {
              id: "deadline-1",
              companyId: "company-1",
              type: "es_submission",
              title: "ES提出",
              description: null,
              dueDate: deadlineDate,
              isConfirmed: true,
              confidence: "high",
              sourceUrl: null,
              completedAt: null,
            },
            companyName: "Alpha",
          },
        ])
      );

    const response = await GET(new NextRequest("http://localhost:3000/api/deadlines/upcoming?days=0"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.periodDays).toBe(7);
    expect(data.count).toBe(1);
    expect(response.headers.get("server-timing")).toContain("identity;");
    expect(response.headers.get("server-timing")).toContain("db;");
    expect(data.deadlines[0]).toMatchObject({
      id: "deadline-1",
      company: "Alpha",
      dueDate: deadlineDate.toISOString(),
    });
  });

  it("includes the underlying debug message for development 500 responses", async () => {
    const { GET } = await import("@/app/api/deadlines/upcoming/route");
    process.env.NODE_ENV = "development";
    getRequestIdentityMock.mockRejectedValue(new Error("identity resolution exploded"));

    const response = await GET(new NextRequest("http://localhost:3000/api/deadlines/upcoming"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.code).toBe("UPCOMING_DEADLINES_FETCH_FAILED");
    expect(data.debug.developerMessage).toBe("identity resolution exploded");
  });
});
