import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

function makeTaskStatsSubquery() {
  const taskStats = {
    deadlineId: {},
    totalTasks: {},
    completedTasks: {},
  };

  const as = vi.fn(() => taskStats);
  const groupBy = vi.fn(() => ({ as }));
  const where = vi.fn(() => ({ groupBy }));
  const secondInnerJoin = vi.fn(() => ({ where }));
  const firstInnerJoin = vi.fn(() => ({ innerJoin: secondInnerJoin }));
  const from = vi.fn(() => ({ innerJoin: firstInnerJoin }));

  return {
    query: { from },
    spies: { from, firstInnerJoin, secondInnerJoin, where, groupBy, as },
    taskStats,
  };
}

function makeDeadlineRowsQuery(result: unknown[]) {
  const where = vi.fn().mockResolvedValue(result);
  const leftJoin = vi.fn(() => ({ where }));
  const innerJoin = vi.fn(() => ({ leftJoin }));
  const from = vi.fn(() => ({ innerJoin }));

  return {
    query: { from },
    spies: { from, innerJoin, leftJoin, where },
  };
}

describe("deadline-loaders query shape", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it("pre-aggregates task counts before joining dashboard deadlines", async () => {
    const source = await readFile(new URL("./deadline-loaders.ts", import.meta.url), "utf8");

    expect(source).toContain('.as("task_stats")');
    expect(source).toContain(".innerJoin(deadlines, eq(tasks.deadlineId, deadlines.id))");
    expect(source).toContain(".innerJoin(companies, eq(deadlines.companyId, companies.id))");
    expect(source).toContain(".where(and(ownerCondition, eq(deadlines.isConfirmed, true)))");
    expect(source).toContain(".groupBy(tasks.deadlineId)");
    expect(source).toContain(".leftJoin(taskStats, eq(taskStats.deadlineId, deadlines.id))");
    expect(source).not.toContain("(select count(*)");
  });

  it("returns task counts from the pre-aggregated join", async () => {
    const taskStatsSubquery = makeTaskStatsSubquery();
    const rowsQuery = makeDeadlineRowsQuery([
      {
        deadline: {
          id: "deadline-1",
          type: "es",
          title: "ES提出",
          dueDate: new Date("2026-05-10T00:00:00.000Z"),
          statusOverride: null,
          isConfirmed: true,
          completedAt: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        companyId: "company-1",
        companyName: "OpenAI",
        totalTasks: 3,
        completedTasks: 1,
      },
    ]);

    dbSelectMock.mockReturnValueOnce(taskStatsSubquery.query).mockReturnValueOnce(rowsQuery.query);

    const { getDeadlinesDashboardData } = await import("@/lib/server/deadline-loaders");
    const result = await getDeadlinesDashboardData({ userId: "user-1", guestId: null });

    expect(taskStatsSubquery.spies.where).toHaveBeenCalledTimes(1);
    expect(taskStatsSubquery.spies.groupBy).toHaveBeenCalledTimes(1);
    expect(rowsQuery.spies.leftJoin).toHaveBeenCalledTimes(1);
    expect(result.deadlines[0]).toMatchObject({
      id: "deadline-1",
      totalTasks: 3,
      completedTasks: 1,
      status: "in_progress",
    });
    expect(result.summary).toMatchObject({
      total: 1,
      inProgress: 1,
      completionRate: 0,
    });
  });
});
