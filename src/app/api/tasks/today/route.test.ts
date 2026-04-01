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

function makeOpenTasksQuery(result: unknown[]) {
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

describe("api/tasks/today", () => {
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
    const { GET } = await import("@/app/api/tasks/today/route");
    getRequestIdentityMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost:3000/api/tasks/today"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("TODAY_TASK_AUTH_REQUIRED");
  });

  it("returns an empty state when there are no open tasks", async () => {
    const { GET } = await import("@/app/api/tasks/today/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(makeOpenTasksQuery([]));

    const response = await GET(new NextRequest("http://localhost:3000/api/tasks/today"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      mode: null,
      task: null,
      message: "タスクがありません",
    });
  });

  it("returns the highest-priority deep-dive task when no urgent deadlines exist", async () => {
    const { GET } = await import("@/app/api/tasks/today/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });

    const openTasks = [
      {
        task: {
          id: "task-2",
          title: "自己分析を進める",
          type: "self_analysis",
          status: "open",
          applicationId: null,
          createdAt: new Date("2026-03-14T09:00:00.000Z"),
        },
        company: {
          id: "company-2",
          name: "Beta",
          createdAt: new Date("2026-03-12T00:00:00.000Z"),
          userId: "user-1",
          guestId: null,
        },
        application: {
          id: null,
          name: null,
          userId: null,
          guestId: null,
        },
        deadline: {
          id: null,
          title: null,
          dueDate: null,
          userId: null,
          guestId: null,
        },
      },
      {
        task: {
          id: "task-1",
          title: "ESを仕上げる",
          type: "es",
          status: "open",
          applicationId: null,
          createdAt: new Date("2026-03-15T09:00:00.000Z"),
        },
        company: {
          id: "company-1",
          name: "Alpha",
          createdAt: new Date("2026-03-10T00:00:00.000Z"),
          userId: "user-1",
          guestId: null,
        },
        application: {
          id: null,
          name: null,
          userId: null,
          guestId: null,
        },
        deadline: {
          id: null,
          title: null,
          dueDate: null,
          userId: null,
          guestId: null,
        },
      },
    ];

    dbSelectMock
      .mockReturnValueOnce(makeOpenTasksQuery(openTasks))
      .mockReturnValueOnce(makeUrgentDeadlinesQuery([]));

    const response = await GET(new NextRequest("http://localhost:3000/api/tasks/today"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mode).toBe("DEEP_DIVE");
    expect(data.task.id).toBe("task-1");
    expect(data.task.company).toEqual({
      id: "company-1",
      name: "Alpha",
    });
  });

  it("returns a structured 500 response in development", async () => {
    const { GET } = await import("@/app/api/tasks/today/route");
    process.env.NODE_ENV = "development";
    getRequestIdentityMock.mockRejectedValue(new Error("session lookup exploded"));

    const response = await GET(new NextRequest("http://localhost:3000/api/tasks/today"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.code).toBe("TODAY_TASK_FETCH_FAILED");
    expect(data.requestId).toEqual(expect.any(String));
    expect(data).not.toHaveProperty("debug");
  });
});
