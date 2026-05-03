import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  dbUpdateMock,
  dbInsertMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

const existingSettings = {
  id: "settings-1",
  userId: "user-1",
  deadlineReminder: true,
  deadlineNear: true,
  companyFetch: true,
  esReview: true,
  dailySummary: true,
  reminderTiming: [{ type: "day_before" }],
  dailySummaryHourJst: 9,
  deadlineReminderOverrides: null,
};

function makePutRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/settings/notifications", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function mockSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  dbSelectMock.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function mockUpdate() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  dbUpdateMock.mockReturnValue({ set });
  return { set, where };
}

describe("api/settings/notifications PUT", () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("rejects malformed reminder timing before writing jsonb", async () => {
    mockSelectRows([existingSettings]);
    const { PUT } = await import("./route");

    const response = await PUT(makePutRequest({
      reminderTiming: [{ type: "hour_before", hours: "3" }],
    }));

    expect(response.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("rejects malformed deadline reminder overrides before writing jsonb", async () => {
    mockSelectRows([existingSettings]);
    const { PUT } = await import("./route");

    const response = await PUT(makePutRequest({
      deadlineReminderOverrides: ["7d"],
    }));

    expect(response.status).toBe(400);
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("writes validated jsonb values as objects and arrays, not JSON strings", async () => {
    mockSelectRows([existingSettings]);
    mockSelectRows([{
      ...existingSettings,
      reminderTiming: [{ type: "hour_before", hours: 3 }],
      deadlineReminderOverrides: { es_submission: ["7d", "3d"] },
    }]);
    const { set } = mockUpdate();
    const { PUT } = await import("./route");

    const response = await PUT(makePutRequest({
      reminderTiming: [{ type: "hour_before", hours: 3 }],
      deadlineReminderOverrides: { es_submission: ["7d", "3d"] },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      reminderTiming: [{ type: "hour_before", hours: 3 }],
      deadlineReminderOverrides: { es_submission: ["7d", "3d"] },
    }));
    expect(data.settings.reminderTiming).toEqual([{ type: "hour_before", hours: 3 }]);
    expect(data.settings.deadlineReminderOverrides).toEqual({ es_submission: ["7d", "3d"] });
  });
});
