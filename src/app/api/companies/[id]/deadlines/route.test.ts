import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  dbSelectMock,
  dbInsertMock,
  syncDeadlineImmediatelyMock,
  generateTasksForDeadlineMock,
  logErrorMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  syncDeadlineImmediatelyMock: vi.fn(),
  generateTasksForDeadlineMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/calendar/sync", () => ({
  syncDeadlineImmediately: syncDeadlineImmediatelyMock,
}));

vi.mock("@/lib/server/task-generation", () => ({
  generateTasksForDeadline: generateTasksForDeadlineMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

function makeSelectLimitQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeInsertReturningQuery(result: unknown[]) {
  return {
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(result),
    })),
  };
}

const storedDeadline = {
  id: "deadline-1",
  companyId: "company-1",
  type: "es_submission",
  title: "ES提出",
  description: null,
  memo: null,
  dueDate: new Date("2026-06-01T03:00:00.000Z"),
  isConfirmed: true,
  confidence: null,
  sourceUrl: null,
  googleSyncStatus: "suppressed",
  googleSyncError: null,
  completedAt: null,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

describe("api/companies/[id]/deadlines POST", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
    syncDeadlineImmediatelyMock.mockReset();
    generateTasksForDeadlineMock.mockReset();
    logErrorMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: null, guestId: "guest-1" });
    dbSelectMock
      .mockReturnValueOnce(makeSelectLimitQuery([{ id: "company-1", userId: null, guestId: "guest-1" }]))
      .mockReturnValueOnce(makeSelectLimitQuery([storedDeadline]));
    dbInsertMock.mockReturnValue(makeInsertReturningQuery([storedDeadline]));
    generateTasksForDeadlineMock.mockResolvedValue(["task-1"]);
  });

  it("creates template tasks with the guest owner for a guest deadline", async () => {
    const { POST } = await import("@/app/api/companies/[id]/deadlines/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/deadlines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "es_submission",
        title: "ES提出",
        dueDate: "2026-06-01T00:00:00.000Z",
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deadline.id).toBe("deadline-1");
    expect(generateTasksForDeadlineMock).toHaveBeenCalledWith({
      deadlineId: expect.any(String),
      deadlineType: "es_submission",
      deadlineDueDate: new Date("2026-06-01T03:00:00.000Z"),
      companyId: "company-1",
      applicationId: null,
      userId: null,
      guestId: "guest-1",
    });
  });

  it("still creates the deadline when template task generation fails", async () => {
    generateTasksForDeadlineMock.mockRejectedValueOnce(new Error("task template insert failed"));

    const { POST } = await import("@/app/api/companies/[id]/deadlines/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/deadlines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "es_submission",
        title: "ES提出",
        dueDate: "2026-06-01T00:00:00.000Z",
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deadline.id).toBe("deadline-1");
    expect(logErrorMock).toHaveBeenCalledWith(
      "deadline-task-generation-failed",
      expect.any(Error),
      expect.objectContaining({
        deadlineId: expect.any(String),
        companyId: "company-1",
        deadlineType: "es_submission",
        userId: null,
        guestId: "guest-1",
      }),
    );
  });

  it("returns structured validation errors and resolves identity once", async () => {
    const { POST } = await import("@/app/api/companies/[id]/deadlines/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/deadlines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "invalid_type",
        title: "ES提出",
        dueDate: "2026-06-01T00:00:00.000Z",
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe("DEADLINE_INVALID_TYPE");
    expect(data.error.userMessage).toBeTruthy();
    expect(data.requestId).toBeTruthy();
    expect(getRequestIdentityMock).toHaveBeenCalledTimes(1);
  });
});
