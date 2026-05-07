import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbSelectMock,
  dbInsertMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    delete: dbDeleteMock,
  },
}));

vi.mock("@/lib/datetime/jst", () => ({
  getJstHour: vi.fn(() => 9),
  startOfJstDayAsUtc: vi.fn(() => new Date("2026-03-26T15:00:00.000Z")),
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

describe("api/notifications/batch POST", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
    dbDeleteMock.mockReset();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  it("uses preloaded settings for daily summary without per-user query loops", async () => {
    const profiles = [
      {
        userId: "user-1",
        dailySummary: true,
        dailySummaryHourJst: 9,
      },
      {
        userId: "user-2",
        dailySummary: false,
        dailySummaryHourJst: 9,
      },
    ];
    const deadlineCounts = [{ userId: "user-1", count: 2 }];
    const existing: unknown[] = [];

    const selectResults = [profiles, deadlineCounts, existing];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    dbInsertMock.mockReturnValue({
      values: vi.fn(() => Promise.resolve(undefined)),
    });

    const { POST } = await import("@/app/api/notifications/batch/route");
    const request = new NextRequest("http://localhost:3000/api/notifications/batch", {
      method: "POST",
      headers: { authorization: "Bearer cron-secret", "content-type": "application/json" },
      body: JSON.stringify({ type: "daily_summary" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.created).toBe(1);
    expect(dbSelectMock).toHaveBeenCalledTimes(3);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    const insertValuesMock = dbInsertMock.mock.results[0]?.value.values as
      | { mock: { calls: Array<[Array<{ userId: string; type: string }>] > } }
      | undefined;
    const insertedRows = insertValuesMock?.mock.calls[0]?.[0];
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows?.[0]).toMatchObject({
      userId: "user-1",
      type: "daily_summary",
    });
  });
});
