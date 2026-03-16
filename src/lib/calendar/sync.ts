import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarSettings,
  calendarSyncJobs,
  companies,
  deadlines,
  notifications,
} from "@/lib/db/schema";
import { buildCalendarConnectionStatus, getCalendarSettingsRecord, getValidGoogleCalendarAccessToken } from "@/lib/calendar/connection";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  isAppCalendarEvent,
  stripAppCalendarPrefix,
} from "@/lib/calendar/google";

const MAX_SYNC_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 5;
const DEFAULT_SYNC_BATCH_SIZE = 20;

type SyncEntityType = "deadline" | "work_block";
type SyncAction = "upsert" | "delete";

interface SyncSummary {
  pendingCount: number;
  failedCount: number;
  lastFailureReason: string | null;
}

interface ClaimedCalendarSyncJob {
  id: string;
  user_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  action: SyncAction;
  target_calendar_id: string | null;
  google_event_id: string | null;
  attempts: number;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function canSyncToGoogle(settings: typeof calendarSettings.$inferSelect | null) {
  if (!settings || settings.provider !== "google" || !settings.targetCalendarId) {
    return false;
  }

  return buildCalendarConnectionStatus(settings).connected;
}

async function cancelPendingJobsForEntity(userId: string, entityType: SyncEntityType, entityId: string) {
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
        eq(calendarSyncJobs.status, "pending")
      )
    );
}

async function enqueueCalendarSyncJob(params: {
  userId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
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

async function updateDeadlineSyncState(
  deadlineId: string,
  values: Partial<typeof deadlines.$inferInsert>
) {
  await db
    .update(deadlines)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(deadlines.id, deadlineId));
}

async function updateWorkBlockSyncState(
  eventId: string,
  values: Partial<typeof calendarEvents.$inferInsert>
) {
  await db
    .update(calendarEvents)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, eventId));
}

async function getDeadlineForSync(deadlineId: string) {
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

async function getWorkBlockForSync(eventId: string) {
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

function buildDeadlineEventDraft(deadline: Awaited<ReturnType<typeof getDeadlineForSync>>) {
  if (!deadline) return null;

  const title = `${deadline.companyName} ${deadline.title}`.trim();
  const startAt = deadline.dueDate.toISOString();
  const endAt = new Date(deadline.dueDate.getTime() + 60 * 60 * 1000).toISOString();
  const description = deadline.sourceUrl ? `取得元: ${deadline.sourceUrl}` : "就活Passで管理している締切";

  return {
    kind: "deadline" as const,
    entityId: deadline.id,
    title,
    startAt,
    endAt,
    description,
  };
}

function buildWorkBlockEventDraft(event: Awaited<ReturnType<typeof getWorkBlockForSync>>) {
  if (!event) return null;

  return {
    kind: "work_block" as const,
    entityId: event.id,
    title: event.title,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    description: "就活Passで作成した作業ブロック",
  };
}

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

async function markJobCompleted(jobId: string) {
  await db
    .update(calendarSyncJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calendarSyncJobs.id, jobId));
}

async function markJobCancelled(jobId: string, lastError?: string | null) {
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

async function notifySyncFailure(userId: string, entityType: SyncEntityType, entityId: string, message: string) {
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

async function markJobRetryOrFailure(job: ClaimedCalendarSyncJob, errorMessage: string) {
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

async function claimPendingJobs(limit: number): Promise<ClaimedCalendarSyncJob[]> {
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

async function processUpsertJob(job: ClaimedCalendarSyncJob) {
  const settings = await getCalendarSettingsRecord(job.user_id);
  if (!settings || settings.provider !== "google" || !settings.targetCalendarId) {
    await markJobCancelled(job.id, "Google同期が無効のためジョブを取消しました。");
    return;
  }

  const { accessToken, status } = await getValidGoogleCalendarAccessToken(job.user_id);
  if (!accessToken || !status.connected) {
    await markJobRetryOrFailure(job, status.needsReconnect
      ? "Googleカレンダーの再連携が必要です。"
      : "Googleカレンダーとの接続を確認できませんでした。");
    return;
  }

  if (job.entity_type === "deadline") {
    const deadline = await getDeadlineForSync(job.entity_id);
    if (!deadline) {
      await markJobCompleted(job.id);
      return;
    }
    if (!deadline.isConfirmed) {
      await markJobCancelled(job.id, "未承認の締切は Google へ同期しません。");
      return;
    }

    const draft = buildDeadlineEventDraft(deadline);
    if (!draft) {
      await markJobCancelled(job.id, "同期対象の締切を組み立てられませんでした。");
      return;
    }

    if (deadline.googleEventId && deadline.googleCalendarId) {
      await deleteCalendarEvent(accessToken, deadline.googleCalendarId, deadline.googleEventId);
    }

    const created = await createCalendarEvent(accessToken, job.target_calendar_id || settings.targetCalendarId, draft);
    await updateDeadlineSyncState(deadline.id, {
      googleCalendarId: job.target_calendar_id || settings.targetCalendarId,
      googleEventId: created.id ?? null,
      googleSyncStatus: "synced",
      googleSyncError: null,
      googleSyncedAt: new Date(),
      googleSyncSuppressedAt: null,
    });
    await markJobCompleted(job.id);
    return;
  }

  const event = await getWorkBlockForSync(job.entity_id);
  if (!event) {
    await markJobCompleted(job.id);
    return;
  }

  const draft = buildWorkBlockEventDraft(event);
  if (!draft) {
    await markJobCancelled(job.id, "同期対象の作業ブロックを組み立てられませんでした。");
    return;
  }

  const existingEventId = event.googleEventId;
  if (existingEventId && event.googleCalendarId) {
    await deleteCalendarEvent(accessToken, event.googleCalendarId, existingEventId);
  }

  const created = await createCalendarEvent(accessToken, job.target_calendar_id || settings.targetCalendarId, draft);
  await updateWorkBlockSyncState(event.id, {
    googleCalendarId: job.target_calendar_id || settings.targetCalendarId,
    googleEventId: created.id ?? null,
    googleSyncStatus: "synced",
    googleSyncError: null,
    googleSyncedAt: new Date(),
  });
  await markJobCompleted(job.id);
}

async function processDeleteJob(job: ClaimedCalendarSyncJob) {
  const { accessToken, status } = await getValidGoogleCalendarAccessToken(job.user_id);

  if (!accessToken || !status.connected || !job.target_calendar_id || !job.google_event_id) {
    await markJobCancelled(job.id, "Google接続がないため削除ジョブを完了扱いにしました。");
    return;
  }

  await deleteCalendarEvent(accessToken, job.target_calendar_id, job.google_event_id);
  await markJobCompleted(job.id);
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

export async function reconcileGoogleCalendarEvents(userId: string, calendarId: string, timeMin: string, timeMax: string) {
  const { accessToken, status } = await getValidGoogleCalendarAccessToken(userId);
  if (!accessToken || !status.connected) {
    return { events: [], externalEvents: [] as Awaited<ReturnType<typeof getCalendarEvents>> };
  }

  const events = await getCalendarEvents(accessToken, calendarId, timeMin, timeMax);
  const appManagedEvents = events.filter((event) => isAppCalendarEvent(event.summary));
  const googleEventIds = new Set(appManagedEvents.map((event) => event.id));

  const [workBlocks, mirroredDeadlines] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.googleCalendarId, calendarId),
          gte(calendarEvents.endAt, new Date(timeMin)),
          lte(calendarEvents.startAt, new Date(timeMax))
        )
      ),
    db
      .select({
        id: deadlines.id,
        googleEventId: deadlines.googleEventId,
        googleSyncStatus: deadlines.googleSyncStatus,
      })
      .from(deadlines)
      .innerJoin(companies, eq(deadlines.companyId, companies.id))
      .where(and(eq(companies.userId, userId), eq(deadlines.googleCalendarId, calendarId))),
  ]);

  const workBlocksByGoogleId = new Map(
    workBlocks
      .map((event) => {
        return event.googleEventId ? [event.googleEventId, event] as const : null;
      })
      .filter((entry): entry is readonly [string, typeof workBlocks[number]] => Boolean(entry))
  );

  for (const googleEvent of appManagedEvents) {
    const matched = workBlocksByGoogleId.get(googleEvent.id);
    if (!matched) {
      continue;
    }

    const startAt = googleEvent.start.dateTime ?? googleEvent.start.date;
    const endAt = googleEvent.end.dateTime ?? googleEvent.end.date;
    if (!startAt || !endAt) {
      continue;
    }

    await updateWorkBlockSyncState(matched.id, {
      title: stripAppCalendarPrefix(googleEvent.summary ?? matched.title),
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      googleSyncStatus: "synced",
      googleSyncError: null,
      googleSyncedAt: new Date(),
    });
  }

  const missingWorkBlocks = workBlocks.filter((event) => {
    return event.googleEventId ? !googleEventIds.has(event.googleEventId) : false;
  });
  if (missingWorkBlocks.length > 0) {
    await db.delete(calendarEvents).where(inArray(calendarEvents.id, missingWorkBlocks.map((event) => event.id)));
  }

  const missingDeadlineIds = mirroredDeadlines
    .filter((deadline) => deadline.googleEventId && !googleEventIds.has(deadline.googleEventId))
    .map((deadline) => deadline.id);
  if (missingDeadlineIds.length > 0) {
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
      .where(inArray(deadlines.id, missingDeadlineIds));
  }

  return {
    events,
    externalEvents: events.filter((event) => !isAppCalendarEvent(event.summary)),
  };
}
