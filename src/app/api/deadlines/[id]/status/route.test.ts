import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  dbTransactionMock,
  txSelectMock,
  txUpdateMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txUpdateMock: vi.fn(),
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
    transaction: dbTransactionMock,
  },
}));

function makeSelectLimitQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          for: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

function makeUpdateWhereReturningQuery(result: unknown[]) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeUpdateReturningQuery(result: unknown[]) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("api/deadlines/[id]/status", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbTransactionMock.mockReset();
    txSelectMock.mockReset();
    txUpdateMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        select: txSelectMock,
        update: txUpdateMock,
      }),
    );
  });

  it("records auto-completed task ids when status override completes a deadline", async () => {
    txSelectMock
      .mockReturnValueOnce(makeSelectLimitQuery([
        {
          id: "deadline-1",
          completedAt: null,
          statusOverride: null,
          autoCompletedTaskIds: null,
        },
      ]));

    const taskUpdate = makeUpdateWhereReturningQuery([{ id: "task-1" }, { id: "task-2" }]);
    const deadlineUpdate = makeUpdateReturningQuery([{ id: "deadline-1" }]);
    txUpdateMock.mockReturnValueOnce(taskUpdate).mockReturnValueOnce(deadlineUpdate);

    const { PUT } = await import("@/app/api/deadlines/[id]/status/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1/status", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(deadlineUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        statusOverride: "completed",
        autoCompletedTaskIds: ["task-1", "task-2"],
      }),
    );
  });

  it("returns 404 when the owned deadline condition finds no row", async () => {
    txSelectMock.mockReturnValueOnce(makeSelectLimitQuery([]));

    const { PUT } = await import("@/app/api/deadlines/[id]/status/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1/status", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("DEADLINE_NOT_FOUND");
    expect(txUpdateMock).not.toHaveBeenCalled();
  });
});
