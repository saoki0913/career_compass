import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertValuesMock,
  updateValuesMock,
  executeMock,
  deleteWhereMock,
  selectQueue,
  getCalendarSettingsRecordMock,
  getValidGoogleCalendarAccessTokenMock,
  createCalendarEventMock,
  deleteCalendarEventMock,
} = vi.hoisted(() => ({
  insertValuesMock: vi.fn(),
  updateValuesMock: vi.fn(),
  executeMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  selectQueue: [] as unknown[],
  getCalendarSettingsRecordMock: vi.fn(),
  getValidGoogleCalendarAccessTokenMock: vi.fn(),
  createCalendarEventMock: vi.fn(),
  deleteCalendarEventMock: vi.fn(),
}));

function buildSelectChain(result: unknown) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  };

  return chain;
}

const dbMock = {
  select: vi.fn(() => buildSelectChain(selectQueue.shift() ?? [])),
  update: vi.fn(() => ({
    set: vi.fn((values) => {
      updateValuesMock(values);
      return {
        where: vi.fn(async () => undefined),
      };
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async (values) => {
      insertValuesMock(values);
      return undefined;
    }),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(async (value) => {
      deleteWhereMock(value);
      return undefined;
    }),
  })),
  execute: executeMock,
};

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/calendar/connection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calendar/connection")>("@/lib/calendar/connection");
  return {
    ...actual,
    getCalendarSettingsRecord: getCalendarSettingsRecordMock,
    getValidGoogleCalendarAccessToken: getValidGoogleCalendarAccessTokenMock,
  };
});

vi.mock("@/lib/calendar/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calendar/google")>("@/lib/calendar/google");
  return {
    ...actual,
    createCalendarEvent: createCalendarEventMock,
    deleteCalendarEvent: deleteCalendarEventMock,
  };
});

describe("calendar/sync", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertValuesMock.mockReset();
    updateValuesMock.mockReset();
    executeMock.mockReset();
    deleteWhereMock.mockReset();
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    dbMock.insert.mockClear();
    dbMock.delete.mockClear();
    getCalendarSettingsRecordMock.mockReset();
    getValidGoogleCalendarAccessTokenMock.mockReset();
    createCalendarEventMock.mockReset();
    deleteCalendarEventMock.mockReset();
  });

  it("enqueues confirmed deadlines against the selected target calendar", async () => {
    const { enqueueDeadlineSync } = await import("@/lib/calendar/sync");

    getCalendarSettingsRecordMock.mockResolvedValue({
      provider: "google",
      targetCalendarId: "calendar-selected",
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.freebusy",
      ]),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });
    selectQueue.push([
      {
        id: "deadline-1",
        userId: "user-1",
        title: "ES提出",
        dueDate: new Date("2026-03-20T09:00:00.000Z"),
        sourceUrl: "https://example.com",
        isConfirmed: true,
        googleCalendarId: null,
        googleEventId: null,
        googleSyncStatus: "idle",
        companyName: "OpenAI",
      },
    ]);

    await enqueueDeadlineSync("user-1", "deadline-1");

    expect(updateValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        googleSyncStatus: "pending",
        googleSyncError: null,
        googleSyncSuppressedAt: null,
      })
    );
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        entityType: "deadline",
        entityId: "deadline-1",
        action: "upsert",
        targetCalendarId: "calendar-selected",
        status: "pending",
      })
    );
  });

  it("uses the stored Google event identity when unconfirmed deadlines must be deleted", async () => {
    const { enqueueDeadlineSync } = await import("@/lib/calendar/sync");

    getCalendarSettingsRecordMock.mockResolvedValue({
      provider: "google",
      targetCalendarId: "calendar-selected",
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.freebusy",
      ]),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });
    selectQueue.push([
      {
        id: "deadline-1",
        userId: "user-1",
        title: "ES提出",
        dueDate: new Date("2026-03-20T09:00:00.000Z"),
        sourceUrl: "https://example.com",
        isConfirmed: false,
        googleCalendarId: "calendar-old",
        googleEventId: "google-event-1",
        googleSyncStatus: "synced",
        companyName: "OpenAI",
      },
    ]);

    await enqueueDeadlineSync("user-1", "deadline-1");

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "deadline",
        entityId: "deadline-1",
        action: "delete",
        targetCalendarId: "calendar-old",
        googleEventId: "google-event-1",
      })
    );
  });

  it("marks a job failed and notifies the user after the third retry", async () => {
    const { processCalendarSyncBatch } = await import("@/lib/calendar/sync");

    executeMock.mockResolvedValue([
      {
        id: "job-1",
        user_id: "user-1",
        entity_type: "deadline",
        entity_id: "deadline-1",
        action: "upsert",
        target_calendar_id: "calendar-selected",
        google_event_id: null,
        attempts: 2,
      },
    ]);
    getCalendarSettingsRecordMock.mockResolvedValue({
      provider: "google",
      targetCalendarId: "calendar-selected",
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.freebusy",
      ]),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });
    getValidGoogleCalendarAccessTokenMock.mockResolvedValue({
      accessToken: "access-token",
      status: { connected: true, needsReconnect: false },
    });
    selectQueue.push([
      {
        id: "deadline-1",
        userId: "user-1",
        title: "ES提出",
        dueDate: new Date("2026-03-20T09:00:00.000Z"),
        sourceUrl: "https://example.com",
        isConfirmed: true,
        googleCalendarId: null,
        googleEventId: null,
        googleSyncStatus: "pending",
        companyName: "OpenAI",
      },
    ]);
    createCalendarEventMock.mockRejectedValue(new Error("Google API is unavailable"));

    const result = await processCalendarSyncBatch(1);

    expect(result.claimed).toBe(1);
    expect(result.results).toEqual([{ id: "job-1", status: "failed" }]);
    expect(updateValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        attempts: 3,
        lastError: "Google API is unavailable",
      })
    );
    expect(updateValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        googleSyncStatus: "failed",
        googleSyncError: "Google API is unavailable",
      })
    );
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "calendar_sync_failed",
        title: "Googleカレンダー同期に失敗しました",
        message: "Google API is unavailable",
      })
    );
  });
});
