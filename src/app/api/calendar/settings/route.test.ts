import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  ensureCalendarSettingsRecordMock,
  getCalendarSyncSummaryMock,
  cancelPendingCalendarSyncJobsForUserMock,
  dbUpdateWhereMock,
  dbSelectLimitMock,
  buildCalendarConnectionStatusMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  ensureCalendarSettingsRecordMock: vi.fn(),
  getCalendarSyncSummaryMock: vi.fn(),
  cancelPendingCalendarSyncJobsForUserMock: vi.fn(),
  dbUpdateWhereMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
  buildCalendarConnectionStatusMock: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: dbUpdateWhereMock,
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbSelectLimitMock,
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/calendar/connection", () => ({
  buildCalendarConnectionStatus: buildCalendarConnectionStatusMock,
  ensureCalendarSettingsRecord: ensureCalendarSettingsRecordMock,
  parseStoredJsonArray: vi.fn((value: string | null) => (value ? JSON.parse(value) : [])),
}));

vi.mock("@/lib/calendar/sync", () => ({
  cancelPendingCalendarSyncJobsForUser: cancelPendingCalendarSyncJobsForUserMock,
  getCalendarSyncSummary: getCalendarSyncSummaryMock,
}));

describe("api/calendar/settings", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    ensureCalendarSettingsRecordMock.mockReset();
    getCalendarSyncSummaryMock.mockReset();
    cancelPendingCalendarSyncJobsForUserMock.mockReset();
    dbUpdateWhereMock.mockReset();
    dbSelectLimitMock.mockReset();
    buildCalendarConnectionStatusMock.mockReset();

    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    buildCalendarConnectionStatusMock.mockReturnValue({
      connected: true,
      needsReconnect: false,
      connectedEmail: "user@example.com",
      connectedAt: "2026-03-15T00:00:00.000Z",
      grantedScopes: [],
      missingScopes: [],
    });
    getCalendarSyncSummaryMock.mockResolvedValue({
      pendingCount: 0,
      failedCount: 0,
      lastFailureReason: null,
    });
    ensureCalendarSettingsRecordMock.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      provider: "app",
      targetCalendarId: null,
      freebusyCalendarIds: null,
      preferredTimeSlots: null,
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify([]),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });
    dbUpdateWhereMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValue([
      {
        id: "settings-1",
        userId: "user-1",
        provider: "app",
        targetCalendarId: null,
        freebusyCalendarIds: null,
        preferredTimeSlots: null,
        googleRefreshToken: "encrypted-refresh-token",
        googleGrantedScopes: JSON.stringify([]),
        googleCalendarEmail: "user@example.com",
        googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
        googleCalendarNeedsReconnect: false,
      },
    ]);
  });

  it("rejects enabling Google without an explicit target calendar", async () => {
    const { PUT } = await import("@/app/api/calendar/settings/route");

    const request = new NextRequest("http://localhost:3000/api/calendar/settings", {
      method: "PUT",
      body: JSON.stringify({
        provider: "google",
        freebusyCalendarIds: ["calendar-1"],
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe("CALENDAR_SETTINGS_TARGET_REQUIRED");
  });

  it("cancels pending jobs when switching back to the app calendar", async () => {
    const { PUT } = await import("@/app/api/calendar/settings/route");

    ensureCalendarSettingsRecordMock.mockResolvedValueOnce({
      id: "settings-1",
      userId: "user-1",
      provider: "google",
      targetCalendarId: "calendar-1",
      freebusyCalendarIds: JSON.stringify(["calendar-1"]),
      preferredTimeSlots: null,
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify([]),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        id: "settings-1",
        userId: "user-1",
        provider: "app",
        targetCalendarId: null,
        freebusyCalendarIds: null,
        preferredTimeSlots: null,
        googleRefreshToken: "encrypted-refresh-token",
        googleGrantedScopes: JSON.stringify([]),
        googleCalendarEmail: "user@example.com",
        googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
        googleCalendarNeedsReconnect: false,
      },
    ]);

    const request = new NextRequest("http://localhost:3000/api/calendar/settings", {
      method: "PUT",
      body: JSON.stringify({
        provider: "app",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(cancelPendingCalendarSyncJobsForUserMock).toHaveBeenCalledWith("user-1");
  });
});
