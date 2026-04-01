import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

function makeInnerJoinOrderByQuery(result: unknown[]) {
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

function makeTasksSelectQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      leftJoin: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn().mockResolvedValue(result),
            })),
          })),
        })),
      })),
    })),
  };
}

function makeUrgentDeadlinesQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeCountQuery(count: number) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ count }]),
      innerJoin: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count }]),
      })),
      limit: vi.fn().mockResolvedValue([{ onboardingCompleted: true }]),
    })),
  };
}

describe("app-loaders", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it("returns upcoming deadlines with joined company names", async () => {
    const { getUpcomingDeadlinesData } = await import("@/lib/server/app-loaders");

    dbSelectMock.mockReturnValueOnce(
      makeInnerJoinOrderByQuery([
        {
          deadline: {
            id: "deadline-1",
            companyId: "company-1",
            type: "es",
            title: "ES提出",
            description: "締切",
            dueDate: new Date("2026-03-29T00:00:00.000Z"),
            isConfirmed: true,
            confidence: 0.9,
            sourceUrl: "https://example.com",
            completedAt: null,
          },
          companyName: "OpenAI",
        },
      ])
    );

    const result = await getUpcomingDeadlinesData({ userId: "user-1", guestId: null }, 7);

    expect(result.count).toBe(1);
    expect(result.deadlines[0]).toMatchObject({
      id: "deadline-1",
      companyId: "company-1",
      company: "OpenAI",
      title: "ES提出",
      type: "es",
      isConfirmed: true,
      confidence: 0.9,
      sourceUrl: "https://example.com",
    });
  });

  it("selects today's task using preloaded application counts", async () => {
    const { getTodayTaskData } = await import("@/lib/server/app-loaders");

    dbSelectMock
      .mockReturnValueOnce(
        makeTasksSelectQuery([
          {
            task: {
              id: "task-1",
              applicationId: "app-1",
              deadlineId: "deadline-1",
              type: "es",
              status: "open",
              dueDate: null,
              completedAt: null,
              createdAt: new Date("2026-03-26T00:00:00.000Z"),
              updatedAt: new Date("2026-03-26T00:00:00.000Z"),
              sortOrder: 0,
            },
            company: {
              id: "company-1",
              name: "OpenAI",
              createdAt: new Date("2026-03-01T00:00:00.000Z"),
              userId: "user-1",
              guestId: null,
            },
            application: {
              id: "app-1",
              name: "本選考",
              userId: "user-1",
              guestId: null,
            },
            deadline: {
              id: "deadline-1",
              title: "ES提出",
              dueDate: new Date("2026-03-28T00:00:00.000Z"),
              userId: "user-1",
              guestId: null,
            },
          },
          {
            task: {
              id: "task-2",
              applicationId: "app-1",
              deadlineId: "deadline-1",
              type: "other",
              status: "open",
              dueDate: null,
              completedAt: null,
              createdAt: new Date("2026-03-27T00:00:00.000Z"),
              updatedAt: new Date("2026-03-27T00:00:00.000Z"),
              sortOrder: 1,
            },
            company: {
              id: "company-1",
              name: "OpenAI",
              createdAt: new Date("2026-03-01T00:00:00.000Z"),
              userId: "user-1",
              guestId: null,
            },
            application: {
              id: "app-1",
              name: "本選考",
              userId: "user-1",
              guestId: null,
            },
            deadline: {
              id: "deadline-1",
              title: "ES提出",
              dueDate: new Date("2026-03-28T00:00:00.000Z"),
              userId: "user-1",
              guestId: null,
            },
          },
        ])
      )
      .mockReturnValueOnce(
        makeUrgentDeadlinesQuery([
          {
            id: "deadline-1",
            applicationId: "app-1",
            dueDate: new Date("2026-03-28T00:00:00.000Z"),
          },
        ])
      );

    const result = await getTodayTaskData({ userId: "user-1", guestId: null });

    expect(result.mode).toBe("DEADLINE");
    expect(result.task).toMatchObject({
      id: "task-1",
      application: {
        id: "app-1",
        name: "本選考",
      },
      company: {
        id: "company-1",
        name: "OpenAI",
      },
      deadline: {
        id: "deadline-1",
        title: "ES提出",
      },
    });
  });

  it("returns company, motivation, and profile activation steps for logged-in users", async () => {
    const { getActivationData } = await import("@/lib/server/app-loaders");

    dbSelectMock
      .mockReturnValueOnce(makeCountQuery(1))
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: "company-1" }]),
            })),
          })),
        })),
      })
      .mockReturnValueOnce(makeCountQuery(1))
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ onboardingCompleted: false }]),
          })),
        })),
      });

    const result = await getActivationData({ userId: "user-1", guestId: null });

    expect(result.steps.company).toMatchObject({
      done: true,
      href: "/companies/new",
    });
    expect(result.steps.motivation).toMatchObject({
      done: true,
      href: "/companies/company-1/motivation",
    });
    expect(result.steps.profile).toMatchObject({
      done: false,
      href: "/onboarding",
    });
    expect(result.nextAction).toEqual({
      href: "/onboarding",
      label: result.steps.profile.label,
    });
  });

  it("asks guests to log in before the profile step", async () => {
    const { getActivationData } = await import("@/lib/server/app-loaders");

    dbSelectMock
      .mockReturnValueOnce(makeCountQuery(1))
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: "company-1" }]),
            })),
          })),
        })),
      })
      .mockReturnValueOnce(makeCountQuery(0));

    const result = await getActivationData({ userId: null, guestId: "guest-1" });

    expect(result.steps.profile).toMatchObject({
      done: false,
      href: "/login?redirect=/onboarding",
    });
    expect(result.nextAction).toEqual({
      href: "/companies/company-1/motivation",
      label: result.steps.motivation.label,
    });
  });
});
