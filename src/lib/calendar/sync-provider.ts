import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  calendarEvents,
  calendarSettings,
  companies,
  deadlines,
} from "@/lib/db/schema";
import { buildCalendarConnectionStatus, getCalendarSettingsRecord, getValidGoogleCalendarAccessToken } from "@/lib/calendar/connection";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  isAppCalendarEvent,
  stripAppCalendarPrefix,
  updateCalendarEvent,
} from "@/lib/calendar/google";
import {
  getDeadlineForSync,
  getWorkBlockForSync,
  markJobCancelled,
  markJobCompleted,
  suppressMissingDeadlines,
  updateDeadlineSyncState,
  updateWorkBlockSyncState,
  deleteMissingWorkBlocks,
} from "./sync-persistence";
import type { ClaimedCalendarSyncJob } from "./sync-types";

type DeadlineForDraft = {
  id: string;
  title: string;
  dueDate: Date;
  sourceUrl: string | null;
  companyName: string;
} | null;

type WorkBlockForDraft = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
} | null;

export function canSyncToGoogle(settings: typeof calendarSettings.$inferSelect | null) {
  if (!settings || settings.provider !== "google" || !settings.targetCalendarId) {
    return false;
  }

  return buildCalendarConnectionStatus(settings).connected;
}

export function buildDeadlineEventDraft(deadline: DeadlineForDraft) {
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

export function buildWorkBlockEventDraft(event: WorkBlockForDraft) {
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

/**
 * Sync state machine for upsert jobs:
 *
 * | State                          | Action                                    |
 * |--------------------------------|-------------------------------------------|
 * | same calendar + existing event | PATCH (update-in-place, ID stable)        |
 * | different calendar             | Leave old event, CREATE on new calendar   |
 * | not found (initial or deleted) | CREATE new event                          |
 */
export async function upsertGoogleEvent(
  accessToken: string,
  targetCalendarId: string,
  entity: { googleCalendarId: string | null; googleEventId: string | null },
  draft: { kind: "deadline" | "work_block"; entityId: string; title: string; startAt: string; endAt: string; description?: string },
  signal?: AbortSignal,
): Promise<{ googleCalendarId: string; googleEventId: string }> {
  const sameCalendar = entity.googleCalendarId === targetCalendarId;

  if (sameCalendar && entity.googleCalendarId && entity.googleEventId) {
    // Same calendar — try PATCH for stable event ID
    const patched = await updateCalendarEvent(accessToken, entity.googleCalendarId, entity.googleEventId, draft, signal);
    if (patched.id) {
      return { googleCalendarId: entity.googleCalendarId, googleEventId: patched.id };
    }
    // PATCH returned empty id (404) — event was deleted externally, fall through to CREATE
  } else if (!sameCalendar && entity.googleCalendarId && entity.googleEventId) {
    // Different calendar — leave old event in place (user decision), create on new calendar
  }

  // Not found or different calendar — CREATE
  const created = await createCalendarEvent(accessToken, targetCalendarId, draft, signal);
  return { googleCalendarId: targetCalendarId, googleEventId: created.id ?? "" };
}

/**
 * Core sync executor shared by both immediate and cron paths.
 * Throws on failure — callers decide how to handle.
 */
export async function executeUpsert(
  userId: string,
  entityType: "deadline" | "work_block",
  entityId: string,
  targetCalendarId: string,
  signal?: AbortSignal,
): Promise<{ googleCalendarId: string; googleEventId: string }> {
  const { accessToken, status } = await getValidGoogleCalendarAccessToken(userId);
  if (!accessToken || !status.connected) {
    throw new Error(
      status.needsReconnect
        ? "Googleカレンダーの再連携が必要です。"
        : "Googleカレンダーとの接続を確認できませんでした。",
    );
  }

  if (entityType === "deadline") {
    const deadline = await getDeadlineForSync(entityId);
    if (!deadline) throw new Error("同期対象の締切が見つかりません。");
    if (!deadline.isConfirmed) throw new Error("未承認の締切は同期しません。");
    const draft = buildDeadlineEventDraft(deadline);
    if (!draft) throw new Error("同期対象の締切を組み立てられませんでした。");
    const result = await upsertGoogleEvent(accessToken, targetCalendarId, deadline, draft, signal);
    await updateDeadlineSyncState(deadline.id, {
      googleCalendarId: result.googleCalendarId,
      googleEventId: result.googleEventId,
      googleSyncStatus: "synced",
      googleSyncError: null,
      googleSyncedAt: new Date(),
      googleSyncSuppressedAt: null,
    });
    return result;
  }

  const event = await getWorkBlockForSync(entityId);
  if (!event) throw new Error("同期対象の作業ブロックが見つかりません。");
  const draft = buildWorkBlockEventDraft(event);
  if (!draft) throw new Error("同期対象の作業ブロックを組み立てられませんでした。");
  const result = await upsertGoogleEvent(accessToken, targetCalendarId, event, draft, signal);
  await updateWorkBlockSyncState(event.id, {
    googleCalendarId: result.googleCalendarId,
    googleEventId: result.googleEventId,
    googleSyncStatus: "synced",
    googleSyncError: null,
    googleSyncedAt: new Date(),
  });
  return result;
}

export async function executeDelete(
  userId: string,
  googleCalendarId: string,
  googleEventId: string,
  signal?: AbortSignal,
): Promise<void> {
  const { accessToken, status } = await getValidGoogleCalendarAccessToken(userId);
  if (!accessToken || !status.connected) return;
  await deleteCalendarEvent(accessToken, googleCalendarId, googleEventId, signal);
}

export async function processUpsertJob(job: ClaimedCalendarSyncJob) {
  const settings = await getCalendarSettingsRecord(job.user_id);
  if (!settings || settings.provider !== "google" || !settings.targetCalendarId) {
    await markJobCancelled(job.id, "Google同期が無効のためジョブを取消しました。");
    return;
  }

  const targetCalendarId = job.target_calendar_id || settings.targetCalendarId;
  await executeUpsert(job.user_id, job.entity_type, job.entity_id, targetCalendarId);
  await markJobCompleted(job.id);
}

export async function processDeleteJob(job: ClaimedCalendarSyncJob) {
  if (!job.target_calendar_id || !job.google_event_id) {
    await markJobCancelled(job.id, "Google接続がないため削除ジョブを完了扱いにしました。");
    return;
  }
  await executeDelete(job.user_id, job.target_calendar_id, job.google_event_id);
  await markJobCompleted(job.id);
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
          lte(calendarEvents.startAt, new Date(timeMax)),
        ),
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
      .map((event) => (event.googleEventId ? ([event.googleEventId, event] as const) : null))
      .filter((entry): entry is readonly [string, typeof workBlocks[number]] => Boolean(entry)),
  );

  for (const googleEvent of appManagedEvents) {
    const matched = workBlocksByGoogleId.get(googleEvent.id);
    if (!matched) continue;

    const startAt = googleEvent.start.dateTime ?? googleEvent.start.date;
    const endAt = googleEvent.end.dateTime ?? googleEvent.end.date;
    if (!startAt || !endAt) continue;

    await updateWorkBlockSyncState(matched.id, {
      title: stripAppCalendarPrefix(googleEvent.summary ?? matched.title),
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      googleSyncStatus: "synced",
      googleSyncError: null,
      googleSyncedAt: new Date(),
    });
  }

  await deleteMissingWorkBlocks(
    workBlocks.filter((event) => (event.googleEventId ? !googleEventIds.has(event.googleEventId) : false)).map((event) => event.id),
  );

  await suppressMissingDeadlines(
    mirroredDeadlines
      .filter((deadline) => deadline.googleEventId && !googleEventIds.has(deadline.googleEventId))
      .map((deadline) => deadline.id),
  );

  return {
    events,
    externalEvents: events.filter((event) => !isAppCalendarEvent(event.summary)),
  };
}
