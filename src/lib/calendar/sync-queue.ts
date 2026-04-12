import { getCalendarSettingsRecord } from "@/lib/calendar/connection";
import {
  DEFAULT_SYNC_BATCH_SIZE,
} from "./sync-types";
import {
  cancelPendingJobsForEntity,
  claimPendingJobs,
  enqueueCalendarSyncJob,
  getDeadlineForSync,
  getWorkBlockForSync,
  markJobRetryOrFailure,
  updateDeadlineSyncState,
  updateWorkBlockSyncState,
} from "./sync-persistence";
import {
  canSyncToGoogle,
  processDeleteJob,
  processUpsertJob,
} from "./sync-provider";

export async function enqueueDeadlineSync(userId: string, deadlineId: string) {
  const settings = await getCalendarSettingsRecord(userId);
  const deadline = await getDeadlineForSync(deadlineId);
  if (!deadline) return;

  if (!deadline.isConfirmed) {
    if (deadline.googleEventId && deadline.googleCalendarId) {
      await enqueueCalendarSyncJob({
        userId,
        entityType: "deadline",
        entityId: deadline.id,
        action: "delete",
        targetCalendarId: deadline.googleCalendarId,
        googleEventId: deadline.googleEventId,
      });
    }
    return;
  }

  if (!canSyncToGoogle(settings)) {
    await cancelPendingJobsForEntity(userId, "deadline", deadline.id);
    return;
  }

  await updateDeadlineSyncState(deadline.id, {
    googleSyncStatus: "pending",
    googleSyncError: null,
    googleSyncSuppressedAt: null,
  });

  await enqueueCalendarSyncJob({
    userId,
    entityType: "deadline",
    entityId: deadline.id,
    action: "upsert",
    targetCalendarId: settings!.targetCalendarId,
  });
}

export async function enqueueDeadlineDelete(userId: string, deadlineId: string) {
  const deadline = await getDeadlineForSync(deadlineId);
  if (!deadline?.googleEventId || !deadline.googleCalendarId) return;

  await enqueueCalendarSyncJob({
    userId,
    entityType: "deadline",
    entityId: deadline.id,
    action: "delete",
    targetCalendarId: deadline.googleCalendarId,
    googleEventId: deadline.googleEventId,
  });
}

export async function enqueueWorkBlockUpsert(userId: string, eventId: string) {
  const settings = await getCalendarSettingsRecord(userId);
  if (!canSyncToGoogle(settings)) {
    await cancelPendingJobsForEntity(userId, "work_block", eventId);
    return;
  }

  await updateWorkBlockSyncState(eventId, {
    googleSyncStatus: "pending",
    googleSyncError: null,
  });

  await enqueueCalendarSyncJob({
    userId,
    entityType: "work_block",
    entityId: eventId,
    action: "upsert",
    targetCalendarId: settings!.targetCalendarId,
  });
}

export async function enqueueWorkBlockDelete(params: {
  userId: string;
  eventId: string;
  googleCalendarId: string | null;
  googleEventId: string | null;
}) {
  if (!params.googleCalendarId || !params.googleEventId) return;

  await enqueueCalendarSyncJob({
    userId: params.userId,
    entityType: "work_block",
    entityId: params.eventId,
    action: "delete",
    targetCalendarId: params.googleCalendarId,
    googleEventId: params.googleEventId,
  });
}

export async function processCalendarSyncBatch(limit: number = DEFAULT_SYNC_BATCH_SIZE) {
  const jobs = await claimPendingJobs(limit);
  const results: Array<{ id: string; status: string }> = [];

  for (const job of jobs) {
    try {
      if (job.action === "upsert") {
        await processUpsertJob(job);
      } else {
        await processDeleteJob(job);
      }
      results.push({ id: job.id, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Googleカレンダー同期に失敗しました。";
      await markJobRetryOrFailure(job, message);
      results.push({ id: job.id, status: "failed" });
    }
  }

  return {
    claimed: jobs.length,
    processed: results.length,
    results,
  };
}
