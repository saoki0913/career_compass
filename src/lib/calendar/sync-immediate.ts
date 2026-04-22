import { getCalendarSettingsRecord } from "@/lib/calendar/connection";

import type { SyncEntityType } from "./sync-types";
import {
  cancelPendingJobsForEntity,
  enqueueCalendarSyncJob,
  getDeadlineForSync,
  updateDeadlineSyncState,
  updateWorkBlockSyncState,
} from "./sync-persistence";
import { canSyncToGoogle, executeDelete, executeUpsert } from "./sync-provider";

const SYNC_TIMEOUT_MS = 5000;

export type ImmediateSyncResult =
  | { status: "synced" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "同期に失敗しました";
}

function createTimeoutSignal() {
  return AbortSignal.timeout(SYNC_TIMEOUT_MS);
}

async function fallbackUpsert(
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  error: unknown,
) {
  const message = getErrorMessage(error);

  if (entityType === "deadline") {
    await updateDeadlineSyncState(entityId, {
      googleSyncStatus: "pending",
      googleSyncError: message,
    });
  } else {
    await updateWorkBlockSyncState(entityId, {
      googleSyncStatus: "pending",
      googleSyncError: message,
    });
  }

  const settings = await getCalendarSettingsRecord(userId);
  if (!settings?.targetCalendarId) {
    return;
  }

  await enqueueCalendarSyncJob({
    userId,
    entityType,
    entityId,
    action: "upsert",
    targetCalendarId: settings.targetCalendarId,
  });
}

/**
 * Immediately sync a deadline to Google Calendar.
 * NEVER throws — all exceptions are caught and returned as { status: "failed" }.
 * Callers: API routes where ownership has already been verified.
 */
export async function syncDeadlineImmediately(
  userId: string,
  deadlineId: string,
): Promise<ImmediateSyncResult> {
  try {
    const settings = await getCalendarSettingsRecord(userId);
    const deadline = await getDeadlineForSync(deadlineId);
    if (!deadline) return { status: "skipped", reason: "not_found" };

    if (!deadline.isConfirmed) {
      if (deadline.googleEventId && deadline.googleCalendarId) {
        try {
          await executeDelete(userId, deadline.googleCalendarId, deadline.googleEventId, createTimeoutSignal());
        } catch {
          await enqueueCalendarSyncJob({
            userId,
            entityType: "deadline",
            entityId: deadline.id,
            action: "delete",
            targetCalendarId: deadline.googleCalendarId,
            googleEventId: deadline.googleEventId,
          });
        }
      }
      return { status: "skipped", reason: "not_confirmed" };
    }

    if (!canSyncToGoogle(settings)) {
      await cancelPendingJobsForEntity(userId, "deadline", deadline.id);
      return { status: "skipped", reason: "sync_disabled" };
    }

    await executeUpsert(userId, "deadline", deadlineId, settings.targetCalendarId!, createTimeoutSignal());
    return { status: "synced" };
  } catch (error) {
    try {
      await fallbackUpsert(userId, "deadline", deadlineId, error);
    } catch {
      // no-op: preserve no-throw contract
    }
    return { status: "failed", error: getErrorMessage(error) };
  }
}

export async function syncDeadlineDeleteImmediately(
  userId: string,
  deadlineId: string,
): Promise<ImmediateSyncResult> {
  try {
    const deadline = await getDeadlineForSync(deadlineId);
    if (!deadline?.googleEventId || !deadline.googleCalendarId) {
      return { status: "skipped", reason: "not_synced" };
    }

    await executeDelete(userId, deadline.googleCalendarId, deadline.googleEventId, createTimeoutSignal());
    return { status: "synced" };
  } catch (error) {
    try {
      const deadline = await getDeadlineForSync(deadlineId);
      if (deadline?.googleEventId && deadline.googleCalendarId) {
        await enqueueCalendarSyncJob({
          userId,
          entityType: "deadline",
          entityId: deadlineId,
          action: "delete",
          targetCalendarId: deadline.googleCalendarId,
          googleEventId: deadline.googleEventId,
        });
      }
    } catch {
      // no-op: preserve no-throw contract
    }

    return { status: "failed", error: getErrorMessage(error) };
  }
}

export async function syncWorkBlockImmediately(
  userId: string,
  eventId: string,
): Promise<ImmediateSyncResult> {
  try {
    const settings = await getCalendarSettingsRecord(userId);
    if (!canSyncToGoogle(settings)) {
      await cancelPendingJobsForEntity(userId, "work_block", eventId);
      return { status: "skipped", reason: "sync_disabled" };
    }

    await executeUpsert(userId, "work_block", eventId, settings.targetCalendarId!, createTimeoutSignal());
    return { status: "synced" };
  } catch (error) {
    try {
      await fallbackUpsert(userId, "work_block", eventId, error);
    } catch {
      // no-op: preserve no-throw contract
    }
    return { status: "failed", error: getErrorMessage(error) };
  }
}

export async function syncWorkBlockDeleteImmediately(params: {
  userId: string;
  eventId: string;
  googleCalendarId: string | null;
  googleEventId: string | null;
}): Promise<ImmediateSyncResult> {
  try {
    if (!params.googleCalendarId || !params.googleEventId) {
      return { status: "skipped", reason: "not_synced" };
    }

    await executeDelete(params.userId, params.googleCalendarId, params.googleEventId, createTimeoutSignal());
    return { status: "synced" };
  } catch (error) {
    try {
      if (params.googleCalendarId && params.googleEventId) {
        await enqueueCalendarSyncJob({
          userId: params.userId,
          entityType: "work_block",
          entityId: params.eventId,
          action: "delete",
          targetCalendarId: params.googleCalendarId,
          googleEventId: params.googleEventId,
        });
      }
    } catch {
      // no-op: preserve no-throw contract
    }
    return { status: "failed", error: getErrorMessage(error) };
  }
}
