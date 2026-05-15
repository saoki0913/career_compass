import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  dbSelectMock,
  dbUpdateMock,
  dbInsertMock,
  dbDeleteMock,
  dbTransactionMock,
  enqueueDeadlineSyncMock,
  syncDeadlineImmediatelyMock,
  syncDeadlineDeleteImmediatelyMock,
  generateTasksForDeadlineMock,
  inArrayMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  enqueueDeadlineSyncMock: vi.fn(),
  syncDeadlineImmediatelyMock: vi.fn(),
  syncDeadlineDeleteImmediatelyMock: vi.fn(),
  generateTasksForDeadlineMock: vi.fn(),
  inArrayMock: vi.fn(),
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
    delete: dbDeleteMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("@/lib/calendar/sync", () => ({
  enqueueDeadlineDelete: vi.fn(),
  enqueueDeadlineSync: enqueueDeadlineSyncMock,
  syncDeadlineImmediately: syncDeadlineImmediatelyMock,
  syncDeadlineDeleteImmediately: syncDeadlineDeleteImmediatelyMock,
}));

vi.mock("@/lib/server/task-generation", () => ({
  generateTasksForDeadlineWithExecutor: generateTasksForDeadlineMock,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: inArrayMock.mockImplementation(actual.inArray),
  };
});

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
    for: (...args: unknown[]) => Query;
    set: (...args: unknown[]) => Query;
    returning: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.for = vi.fn(() => query as Query);
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
    dbDeleteMock.mockReset();
    dbTransactionMock.mockReset();
    enqueueDeadlineSyncMock.mockReset();
    syncDeadlineImmediatelyMock.mockReset();
    syncDeadlineDeleteImmediatelyMock.mockReset();
    generateTasksForDeadlineMock.mockReset();
    inArrayMock.mockClear();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
    dbTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        insert: dbInsertMock,
        select: dbSelectMock,
        update: dbUpdateMock,
      })
    );
  });

  it("creates the standard tasks with one batch insert", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "other",
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
    expect(generateTasksForDeadlineMock).toHaveBeenCalledTimes(1);
    expect(generateTasksForDeadlineMock).toHaveBeenCalledWith(expect.anything(), {
      deadlineId: "deadline-1",
      deadlineType: "other",
      deadlineDueDate: deadline.dueDate,
      companyId: "company-1",
      applicationId: "app-1",
      userId: "user-1",
      guestId: null,
    });
  });

  it("unmarking completion only reverts auto-completed tasks, not manually completed ones", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "es_submission",
      title: "ES提出",
      description: null,
      memo: null,
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      sourceUrl: null,
      confidence: 0,
      isConfirmed: true,
      completedAt: new Date("2026-03-20T00:00:00.000Z"),
      autoCompletedTaskIds: ["task-1", "task-2"],
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });

    const taskWhereMock = vi.fn().mockResolvedValue([]);
    dbUpdateMock
      .mockReturnValueOnce({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([
              {
                ...deadline,
                completedAt: null,
                autoCompletedTaskIds: null,
                updatedAt: new Date("2026-03-21T00:00:00.000Z"),
              },
            ]),
          })),
        })),
      })
      .mockReturnValueOnce({
        set: vi.fn(() => ({
          where: taskWhereMock,
        })),
      });

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completedAt: null }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    expect(taskWhereMock).toHaveBeenCalledTimes(1);
    expect(inArrayMock).toHaveBeenCalledWith(expect.anything(), ["task-1", "task-2"]);
  });

  it("records only tasks actually completed by the deadline update", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "es_submission",
      title: "ES提出",
      description: null,
      memo: null,
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      sourceUrl: null,
      confidence: 0,
      isConfirmed: true,
      completedAt: null,
      autoCompletedTaskIds: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });

    const deadlineSetMock = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            ...deadline,
            completedAt: new Date("2026-03-21T00:00:00.000Z"),
            autoCompletedTaskIds: ["task-1"],
          },
        ]),
      })),
    }));

    dbUpdateMock
      .mockReturnValueOnce({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "task-1" }]),
          })),
        })),
      })
      .mockReturnValueOnce({
        set: deadlineSetMock,
      });

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completedAt: "2026-03-21T00:00:00.000Z" }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(deadlineSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        autoCompletedTaskIds: ["task-1"],
      }),
    );
  });

  it("unmarking with empty autoCompletedTaskIds does not issue task update", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "es_submission",
      title: "ES提出",
      description: null,
      memo: null,
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      sourceUrl: null,
      confidence: 0,
      isConfirmed: true,
      completedAt: new Date("2026-03-20T00:00:00.000Z"),
      autoCompletedTaskIds: [],
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });

    dbUpdateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              ...deadline,
              completedAt: null,
              autoCompletedTaskIds: null,
              updatedAt: new Date("2026-03-21T00:00:00.000Z"),
            },
          ]),
        })),
      })),
    });

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completedAt: null }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    expect(inArrayMock).not.toHaveBeenCalled();
  });

  it("does not run task generation or sync when the owned deadline update affects no rows", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "other",
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      isConfirmed: false,
      completedAt: null,
      autoCompletedTaskIds: null,
    };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });

    dbUpdateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isConfirmed: true }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("DEADLINE_NOT_FOUND");
    expect(generateTasksForDeadlineMock).not.toHaveBeenCalled();
    expect(syncDeadlineImmediatelyMock).not.toHaveBeenCalled();
  });

  it("keeps confirmation and task generation in the same transaction", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "es_submission",
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      isConfirmed: false,
      completedAt: null,
      autoCompletedTaskIds: null,
    };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });
    dbUpdateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ ...deadline, isConfirmed: true }]),
        })),
      })),
    });
    generateTasksForDeadlineMock.mockRejectedValueOnce(new Error("template insert failed"));

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isConfirmed: true }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("DEADLINE_UPDATE_FAILED");
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(syncDeadlineImmediatelyMock).not.toHaveBeenCalled();
  });

  it("generates tasks from the updated deadline type when confirming and changing type together", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "other",
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      isConfirmed: false,
      completedAt: null,
      autoCompletedTaskIds: null,
    };
    const updatedDeadline = { ...deadline, type: "es_submission", isConfirmed: true };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });
    dbUpdateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([updatedDeadline]),
        })),
      })),
    });
    generateTasksForDeadlineMock.mockResolvedValueOnce(["task-1"]);

    const { PUT } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "es_submission", isConfirmed: true }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(generateTasksForDeadlineMock).toHaveBeenCalledWith(expect.anything(), {
      deadlineId: "deadline-1",
      deadlineType: "es_submission",
      deadlineDueDate: updatedDeadline.dueDate,
      companyId: "company-1",
      applicationId: "app-1",
      userId: "user-1",
      guestId: null,
    });
  });
});

describe("api/deadlines/[id] DELETE", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    dbDeleteMock.mockReset();
    dbTransactionMock.mockReset();
    enqueueDeadlineSyncMock.mockReset();
    syncDeadlineImmediatelyMock.mockReset();
    syncDeadlineDeleteImmediatelyMock.mockReset();
    generateTasksForDeadlineMock.mockReset();
    inArrayMock.mockClear();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
  });

  it("syncs deadline deletion before locally deleting the deadline", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "es_submission",
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      isConfirmed: true,
      completedAt: null,
    };
    const order: string[] = [];

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });
    syncDeadlineDeleteImmediatelyMock.mockImplementation(async () => {
      order.push("sync");
      return { status: "synced" };
    });
    dbDeleteMock.mockImplementation(() => {
      order.push("delete");
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "deadline-1" }]),
        })),
      };
    });

    const { DELETE } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "deadline-1" }) });

    expect(response.status).toBe(200);
    expect(order).toEqual(["sync", "delete"]);
  });

  it("does not delete locally when Google delete retry cannot be queued", async () => {
    const deadline = {
      id: "deadline-1",
      companyId: "company-1",
      applicationId: "app-1",
      type: "es_submission",
      dueDate: new Date("2026-04-01T00:00:00.000Z"),
      isConfirmed: true,
      completedAt: null,
    };

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => makeThenableQuery([deadline])),
    });
    syncDeadlineDeleteImmediatelyMock.mockResolvedValueOnce({ status: "failed", error: "queue down" });

    const { DELETE } = await import("@/app/api/deadlines/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/deadlines/deadline-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "deadline-1" }) });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("DEADLINE_CALENDAR_DELETE_RETRY_UNAVAILABLE");
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });
});
