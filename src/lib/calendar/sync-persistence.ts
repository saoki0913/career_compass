import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarSyncJobs,
  companies,
  deadlines,
  notifications,
} from "@/lib/db/schema";
import {
  addMinutes,
  ClaimedCalendarSyncJob,
  MAX_SYNC_ATTEMPTS,
  RETRY_DELAY_MINUTES,
  SyncEntityType,
  SyncSummary,
} from "./sync-types";

export async function cancelPendingJobsForEntity(userId: string, entityType: SyncEntityType, entityId: string) {
  await db
    .update(calendarSyncJobs)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(calendarSyncJobs.userId, userId),
        eq(calendarSyncJobs.entityType, entityType),
        eq(calendarSyncJobs.entityId, entityId),
        eq(calendarSyncJobs.status, "pending"),
      ),
    );
}

export async function enqueueCalendarSyncJob(params: {
  userId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: "upsert" | "delete";
  targetCalendarId?: string | null;
  googleEventId?: string | null;
}) {
  await cancelPendingJobsForEntity(params.userId, params.entityType, params.entityId);

  await db.insert(calendarSyncJobs).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    targetCalendarId: params.targetCalendarId ?? null,
    googleEventId: params.googleEventId ?? null,
    status: "pending",
    attempts: 0,
    scheduledAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function cancelPendingCalendarSyncJobsForUser(userId: string) {
  await db
    .update(calendarSyncJobs)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(calendarSyncJobs.userId, userId), eq(calendarSyncJobs.status, "pending")));
}

export async function updateDeadlineSyncState(deadlineId: string, values: Partial<typeof deadlines.$inferInsert>) {
  await db
    .update(deadlines)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(deadlines.id, deadlineId));
}

export async function updateWorkBlockSyncState(eventId: string, values: Partial<typeof calendarEvents.$inferInsert>) {
  await db
    .update(calendarEvents)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, eventId));
}

export async function getDeadlineForSync(deadlineId: string) {
  const [deadline] = await db
    .select({
      id: deadlines.id,
      userId: companies.userId,
      title: deadlines.title,
      dueDate: deadlines.dueDate,
      sourceUrl: deadlines.sourceUrl,
      isConfirmed: deadlines.isConfirmed,
      googleCalendarId: deadlines.googleCalendarId,
      googleEventId: deadlines.googleEventId,
      googleSyncStatus: deadlines.googleSyncStatus,
      companyName: companies.name,
    })
    .from(deadlines)
    .innerJoin(companies, eq(deadlines.companyId, companies.id))
    .where(eq(deadlines.id, deadlineId))
    .limit(1);

  return deadline ?? null;
}

export async function getWorkBlockForSync(eventId: string) {
  const [event] = await db
    .select({
      id: calendarEvents.id,
      userId: calendarEvents.userId,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      googleCalendarId: calendarEvents.googleCalendarId,
      googleEventId: calendarEvents.googleEventId,
      googleSyncStatus: calendarEvents.googleSyncStatus,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, eventId))
    .limit(1);

  return event ?? null;
}

export async function markJobCompleted(jobId: string) {
  await db
    .update(calendarSyncJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calendarSyncJobs.id, jobId));
}

export async function markJobCancelled(jobId: string, lastError?: string | null) {
  await db
    .update(calendarSyncJobs)
    .set({
      status: "cancelled",
      lastError: lastError ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calendarSyncJobs.id, jobId));
}

export async function notifySyncFailure(userId: string, entityType: SyncEntityType, entityId: string, message: string) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId,
    guestId: null,
    type: "calendar_sync_failed",
    title: "Googleカレンダー同期に失敗しました",
    message,
    data: JSON.stringify({ entityType, entityId }),
    isRead: false,
    createdAt: new Date(),
    expiresAt: null,
  });
}

export async function markJobRetryOrFailure(job: ClaimedCalendarSyncJob, errorMessage: string) {
  const nextAttempts = job.attempts + 1;
  const terminal = nextAttempts >= MAX_SYNC_ATTEMPTS;

  await db
    .update(calendarSyncJobs)
    .set({
      status: terminal ? "failed" : "pending",
      attempts: nextAttempts,
      lastError: errorMessage,
      scheduledAt: terminal ? new Date() : addMinutes(new Date(), RETRY_DELAY_MINUTES),
      completedAt: terminal ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(calendarSyncJobs.id, job.id));

  if (job.entity_type === "deadline") {
    await updateDeadlineSyncState(job.entity_id, {
      googleSyncStatus: "failed",
      googleSyncError: errorMessage,
    });
  } else {
    await updateWorkBlockSyncState(job.entity_id, {
      googleSyncStatus: "failed",
      googleSyncError: errorMessage,
    });
  }

  if (terminal) {
    await notifySyncFailure(job.user_id, job.entity_type, job.entity_id, errorMessage);
  }
}

export async function claimPendingJobs(limit: number): Promise<ClaimedCalendarSyncJob[]> {
  const rows = await db.execute(sql`
    with picked as (
      select id
      from calendar_sync_jobs
      where status = 'pending'
        and scheduled_at <= now()
      order by scheduled_at asc
      limit ${limit}
      for update skip locked
    )
    update calendar_sync_jobs as jobs
    set
      status = 'processing',
      started_at = now(),
      updated_at = now()
    where jobs.id in (select id from picked)
    returning
      jobs.id,
      jobs.user_id,
      jobs.entity_type,
      jobs.entity_id,
      jobs.action,
      jobs.target_calendar_id,
      jobs.google_event_id,
      jobs.attempts
  `);

  return rows as unknown as ClaimedCalendarSyncJob[];
}

export async function getCalendarSyncSummary(userId: string): Promise<SyncSummary> {
  const [counts] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where ${calendarSyncJobs.status} = 'pending')`,
      failedCount: sql<number>`count(*) filter (where ${calendarSyncJobs.status} = 'failed')`,
    })
    .from(calendarSyncJobs)
    .where(eq(calendarSyncJobs.userId, userId));

  const [lastFailed] = await db
    .select({ lastError: calendarSyncJobs.lastError })
    .from(calendarSyncJobs)
    .where(and(eq(calendarSyncJobs.userId, userId), eq(calendarSyncJobs.status, "failed")))
    .orderBy(desc(calendarSyncJobs.updatedAt))
    .limit(1);

  return {
    pendingCount: Number(counts?.pendingCount ?? 0),
    failedCount: Number(counts?.failedCount ?? 0),
    lastFailureReason: lastFailed?.lastError ?? null,
  };
}

export async function retryFailedSyncJobs(userId: string): Promise<number> {
  const result = await db
    .update(calendarSyncJobs)
    .set({
      status: "pending" as const,
      attempts: 0,
      lastError: null,
      scheduledAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(calendarSyncJobs.userId, userId), eq(calendarSyncJobs.status, "failed")))
    .returning({ id: calendarSyncJobs.id });

  return result.length;
}

export async function deleteMissingWorkBlocks(eventIds: string[]) {
  if (eventIds.length === 0) return;
  await db.delete(calendarEvents).where(inArray(calendarEvents.id, eventIds));
}

export async function suppressMissingDeadlines(deadlineIds: string[]) {
  if (deadlineIds.length === 0) return;
  await db
    .update(deadlines)
    .set({
      googleCalendarId: null,
      googleEventId: null,
      googleSyncStatus: "suppressed",
      googleSyncError: "Googleカレンダー側で削除されました。",
      googleSyncedAt: null,
      googleSyncSuppressedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(deadlines.id, deadlineIds));
}
