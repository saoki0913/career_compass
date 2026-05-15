import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  dbSelectMock,
  dbUpdateMock,
  dbDeleteMock,
  dbTransactionMock,
  txSelectMock,
  txUpdateMock,
  unblockSuccessorMock,
  reblockSuccessorsMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txUpdateMock: vi.fn(),
  unblockSuccessorMock: vi.fn(),
  reblockSuccessorsMock: vi.fn(),
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
    delete: dbDeleteMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/lib/server/task-dependency", () => ({
  unblockSuccessor: unblockSuccessorMock,
  reblockSuccessors: reblockSuccessorsMock,
}));

function makeSelectTaskQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeSelectForUpdateQuery(result: unknown[]) {
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

function makeUpdateReturningQuery(result: unknown[]) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("api/tasks/[id]", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbDeleteMock.mockReset();
    dbTransactionMock.mockReset();
    txSelectMock.mockReset();
    txUpdateMock.mockReset();
    unblockSuccessorMock.mockReset();
    reblockSuccessorsMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        select: txSelectMock,
        update: txUpdateMock,
      }),
    );
  });

  it("updates task status and dependency state in the same transaction", async () => {
    const existingTask = {
      id: "task-1",
      userId: "user-1",
      guestId: null,
      status: "open",
      completedAt: null,
    };
    const updatedTask = {
      ...existingTask,
      status: "done",
      completedAt: new Date("2026-05-14T00:00:00.000Z"),
    };

    dbSelectMock.mockReturnValueOnce(makeSelectTaskQuery([existingTask]));
    txSelectMock.mockReturnValueOnce(makeSelectForUpdateQuery([existingTask]));
    txUpdateMock.mockReturnValueOnce(makeUpdateReturningQuery([updatedTask]));

    const { PUT } = await import("@/app/api/tasks/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "task-1" }) });

    expect(response.status).toBe(200);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(unblockSuccessorMock).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ update: txUpdateMock }),
      expect.anything(),
    );
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("does not update dependencies when the owned task update affects no rows", async () => {
    const existingTask = {
      id: "task-1",
      userId: "user-1",
      guestId: null,
      status: "open",
      completedAt: null,
    };

    dbSelectMock.mockReturnValueOnce(makeSelectTaskQuery([existingTask]));
    txSelectMock.mockReturnValueOnce(makeSelectForUpdateQuery([existingTask]));
    txUpdateMock.mockReturnValueOnce(makeUpdateReturningQuery([]));

    const { PUT } = await import("@/app/api/tasks/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "task-1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("TASK_UPDATE_NOT_FOUND");
    expect(unblockSuccessorMock).not.toHaveBeenCalled();
    expect(reblockSuccessorsMock).not.toHaveBeenCalled();
  });
});
