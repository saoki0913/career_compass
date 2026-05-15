import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getValidGoogleCalendarAccessTokenMock,
  deleteCalendarEventMock,
} = vi.hoisted(() => ({
  getValidGoogleCalendarAccessTokenMock: vi.fn(),
  deleteCalendarEventMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/calendar/connection", () => ({
  buildCalendarConnectionStatus: vi.fn(),
  getCalendarSettingsRecord: vi.fn(),
  getValidGoogleCalendarAccessToken: getValidGoogleCalendarAccessTokenMock,
}));

vi.mock("@/lib/calendar/google", () => ({
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: deleteCalendarEventMock,
  getCalendarEvents: vi.fn(),
  isAppCalendarEvent: vi.fn(),
  stripAppCalendarPrefix: vi.fn(),
  updateCalendarEvent: vi.fn(),
}));

vi.mock("@/lib/calendar/sync-persistence", () => ({
  deleteMissingWorkBlocks: vi.fn(),
  getDeadlineForSync: vi.fn(),
  getWorkBlockForSync: vi.fn(),
  markJobCancelled: vi.fn(),
  markJobCompleted: vi.fn(),
  suppressMissingDeadlines: vi.fn(),
  updateDeadlineSyncState: vi.fn(),
  updateWorkBlockSyncState: vi.fn(),
}));

describe("executeDelete", () => {
  beforeEach(() => {
    getValidGoogleCalendarAccessTokenMock.mockReset();
    deleteCalendarEventMock.mockReset();
  });

  it("throws instead of silently succeeding when Google needs reconnect", async () => {
    getValidGoogleCalendarAccessTokenMock.mockResolvedValue({
      accessToken: null,
      status: { connected: false, needsReconnect: true },
    });

    const { executeDelete } = await import("./sync-provider");

    await expect(executeDelete("user-1", "calendar-1", "event-1")).rejects.toThrow(
      "Googleカレンダーの再連携が必要です。",
    );
    expect(deleteCalendarEventMock).not.toHaveBeenCalled();
  });

  it("deletes through Google when an active access token exists", async () => {
    getValidGoogleCalendarAccessTokenMock.mockResolvedValue({
      accessToken: "token-1",
      status: { connected: true, needsReconnect: false },
    });

    const { executeDelete } = await import("./sync-provider");
    await executeDelete("user-1", "calendar-1", "event-1");

    expect(deleteCalendarEventMock).toHaveBeenCalledWith(
      "token-1",
      "calendar-1",
      "event-1",
      undefined,
    );
  });
});
