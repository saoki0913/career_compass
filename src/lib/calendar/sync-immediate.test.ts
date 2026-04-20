import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCalendarSettingsRecordMock,
  cancelPendingJobsForEntityMock,
  enqueueCalendarSyncJobMock,
  getDeadlineForSyncMock,
  updateDeadlineSyncStateMock,
  updateWorkBlockSyncStateMock,
  canSyncToGoogleMock,
  executeDeleteMock,
  executeUpsertMock,
} = vi.hoisted(() => ({
  getCalendarSettingsRecordMock: vi.fn(),
  cancelPendingJobsForEntityMock: vi.fn(),
  enqueueCalendarSyncJobMock: vi.fn(),
  getDeadlineForSyncMock: vi.fn(),
  updateDeadlineSyncStateMock: vi.fn(),
  updateWorkBlockSyncStateMock: vi.fn(),
  canSyncToGoogleMock: vi.fn(),
  executeDeleteMock: vi.fn(),
  executeUpsertMock: vi.fn(),
}));

vi.mock("@/lib/calendar/connection", () => ({
  getCalendarSettingsRecord: getCalendarSettingsRecordMock,
}));

vi.mock("@/lib/calendar/sync-persistence", () => ({
  cancelPendingJobsForEntity: cancelPendingJobsForEntityMock,
  enqueueCalendarSyncJob: enqueueCalendarSyncJobMock,
  getDeadlineForSync: getDeadlineForSyncMock,
  updateDeadlineSyncState: updateDeadlineSyncStateMock,
  updateWorkBlockSyncState: updateWorkBlockSyncStateMock,
}));

vi.mock("@/lib/calendar/sync-provider", () => ({
  canSyncToGoogle: canSyncToGoogleMock,
  executeDelete: executeDeleteMock,
  executeUpsert: executeUpsertMock,
}));

describe("calendar/sync-immediate", () => {
  beforeEach(() => {
    getCalendarSettingsRecordMock.mockReset();
    cancelPendingJobsForEntityMock.mockReset();
    enqueueCalendarSyncJobMock.mockReset();
    getDeadlineForSyncMock.mockReset();
    updateDeadlineSyncStateMock.mockReset();
    updateWorkBlockSyncStateMock.mockReset();
    canSyncToGoogleMock.mockReset();
    executeDeleteMock.mockReset();
    executeUpsertMock.mockReset();
  });

  it("returns synced when syncDeadlineImmediately succeeds", async () => {
    const { syncDeadlineImmediately } = await import("@/lib/calendar/sync-immediate");

    getCalendarSettingsRecordMock.mockResolvedValue({ targetCalendarId: "calendar-1" });
    getDeadlineForSyncMock.mockResolvedValue({
      id: "deadline-1",
      isConfirmed: true,
      googleCalendarId: null,
      googleEventId: null,
    });
    canSyncToGoogleMock.mockReturnValue(true);
    executeUpsertMock.mockResolvedValue({
      googleCalendarId: "calendar-1",
      googleEventId: "event-1",
    });

    await expect(syncDeadlineImmediately("user-1", "deadline-1")).resolves.toEqual({ status: "synced" });
  });

  it("returns skipped for unconfirmed deadlines", async () => {
    const { syncDeadlineImmediately } = await import("@/lib/calendar/sync-immediate");

    getCalendarSettingsRecordMock.mockResolvedValue({ targetCalendarId: "calendar-1" });
    getDeadlineForSyncMock.mockResolvedValue({
      id: "deadline-1",
      isConfirmed: false,
      googleCalendarId: null,
      googleEventId: null,
    });

    await expect(syncDeadlineImmediately("user-1", "deadline-1")).resolves.toEqual({
      status: "skipped",
      reason: "not_confirmed",
    });
    expect(executeUpsertMock).not.toHaveBeenCalled();
  });

  it("returns skipped when sync is disabled", async () => {
    const { syncDeadlineImmediately } = await import("@/lib/calendar/sync-immediate");

    getCalendarSettingsRecordMock.mockResolvedValue({ targetCalendarId: "calendar-1" });
    getDeadlineForSyncMock.mockResolvedValue({
      id: "deadline-1",
      isConfirmed: true,
      googleCalendarId: null,
      googleEventId: null,
    });
    canSyncToGoogleMock.mockReturnValue(false);

    await expect(syncDeadlineImmediately("user-1", "deadline-1")).resolves.toEqual({
      status: "skipped",
      reason: "sync_disabled",
    });
    expect(cancelPendingJobsForEntityMock).toHaveBeenCalledWith("user-1", "deadline", "deadline-1");
  });

  it("falls back to queue when syncDeadlineImmediately fails", async () => {
    const { syncDeadlineImmediately } = await import("@/lib/calendar/sync-immediate");

    getCalendarSettingsRecordMock.mockResolvedValue({ targetCalendarId: "calendar-1" });
    getDeadlineForSyncMock.mockResolvedValue({
      id: "deadline-1",
      isConfirmed: true,
      googleCalendarId: null,
      googleEventId: null,
    });
    canSyncToGoogleMock.mockReturnValue(true);
    executeUpsertMock.mockRejectedValue(new Error("timeout"));

    await expect(syncDeadlineImmediately("user-1", "deadline-1")).resolves.toEqual({
      status: "failed",
      error: "timeout",
    });
    expect(updateDeadlineSyncStateMock).toHaveBeenCalledWith(
      "deadline-1",
      expect.objectContaining({
        googleSyncStatus: "pending",
        googleSyncError: "timeout",
      }),
    );
    expect(enqueueCalendarSyncJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        entityType: "deadline",
        entityId: "deadline-1",
        action: "upsert",
      }),
    );
  });

  it("returns synced when syncWorkBlockImmediately succeeds", async () => {
    const { syncWorkBlockImmediately } = await import("@/lib/calendar/sync-immediate");

    getCalendarSettingsRecordMock.mockResolvedValue({ targetCalendarId: "calendar-1" });
    canSyncToGoogleMock.mockReturnValue(true);
    executeUpsertMock.mockResolvedValue({
      googleCalendarId: "calendar-1",
      googleEventId: "event-1",
    });

    await expect(syncWorkBlockImmediately("user-1", "work-1")).resolves.toEqual({ status: "synced" });
  });

  it("falls back to queue when syncWorkBlockImmediately fails", async () => {
    const { syncWorkBlockImmediately } = await import("@/lib/calendar/sync-immediate");

    getCalendarSettingsRecordMock.mockResolvedValue({ targetCalendarId: "calendar-1" });
    canSyncToGoogleMock.mockReturnValue(true);
    executeUpsertMock.mockRejectedValue(new Error("google unavailable"));

    await expect(syncWorkBlockImmediately("user-1", "work-1")).resolves.toEqual({
      status: "failed",
      error: "google unavailable",
    });
    expect(updateWorkBlockSyncStateMock).toHaveBeenCalledWith(
      "work-1",
      expect.objectContaining({
        googleSyncStatus: "pending",
        googleSyncError: "google unavailable",
      }),
    );
    expect(enqueueCalendarSyncJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        entityType: "work_block",
        entityId: "work-1",
        action: "upsert",
      }),
    );
  });

  it("returns synced when syncDeadlineDeleteImmediately succeeds", async () => {
    const { syncDeadlineDeleteImmediately } = await import("@/lib/calendar/sync-immediate");

    getDeadlineForSyncMock.mockResolvedValue({
      id: "deadline-1",
      googleCalendarId: "calendar-1",
      googleEventId: "event-1",
    });
    executeDeleteMock.mockResolvedValue(undefined);

    await expect(syncDeadlineDeleteImmediately("user-1", "deadline-1")).resolves.toEqual({ status: "synced" });
  });

  it("returns skipped when syncWorkBlockDeleteImmediately has no google ids", async () => {
    const { syncWorkBlockDeleteImmediately } = await import("@/lib/calendar/sync-immediate");

    await expect(
      syncWorkBlockDeleteImmediately({
        userId: "user-1",
        eventId: "work-1",
        googleCalendarId: null,
        googleEventId: null,
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "not_synced",
    });
    expect(executeDeleteMock).not.toHaveBeenCalled();
  });
});
