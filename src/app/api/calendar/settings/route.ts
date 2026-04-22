/**
 * Calendar Settings API
 *
 * GET: Get calendar settings
 * PUT: Update calendar settings
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import {
  buildCalendarConnectionStatus,
  ensureCalendarSettingsRecord,
  parseStoredJsonArray,
} from "@/lib/calendar/connection";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { cancelPendingCalendarSyncJobsForUser, getCalendarSyncSummary } from "@/lib/calendar/sync";

const calendarSettingsSchema = z.object({
  provider: z.enum(["google", "app"]).optional(),
  targetCalendarId: z.string().min(1).nullable().optional(),
  freebusyCalendarIds: z.array(z.string().min(1)).optional(),
  preferredTimeSlots: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  }).nullable().optional(),
});

function buildSettingsPayload(settings: typeof calendarSettings.$inferSelect, syncSummary: Awaited<ReturnType<typeof getCalendarSyncSummary>>) {
  const targetCalendarId = settings.targetCalendarId ?? null;
  const freebusyCalendarIds = settings.freebusyCalendarIds
    ? parseStoredJsonArray(settings.freebusyCalendarIds)
    : targetCalendarId
      ? [targetCalendarId]
      : [];

  return {
    ...settings,
    targetCalendarId,
    freebusyCalendarIds,
    preferredTimeSlots: settings.preferredTimeSlots
      ? JSON.parse(settings.preferredTimeSlots)
      : null,
    connectionStatus: buildCalendarConnectionStatus(settings),
    syncSummary,
  };
}

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(undefined, {
        status: 401,
        code: "CALENDAR_SETTINGS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-settings-auth",
      });
    }

    const userId = session.user.id;
    const settings = await ensureCalendarSettingsRecord(userId);
    let syncSummary: Awaited<ReturnType<typeof getCalendarSyncSummary>>;
    try {
      syncSummary = await getCalendarSyncSummary(userId);
    } catch {
      syncSummary = { pendingCount: 0, failedCount: 0, lastFailureReason: null };
    }

    return NextResponse.json({
      settings: buildSettingsPayload(settings, syncSummary),
    });
  } catch (error) {
    return createApiErrorResponse(undefined, {
      status: 500,
      code: "CALENDAR_SETTINGS_FETCH_FAILED",
      userMessage: "カレンダー設定を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "calendar-settings-fetch",
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_SETTINGS_UPDATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-settings-update-auth",
      });
    }

    const userId = session.user.id;
    const parsedBody = calendarSettingsSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_SETTINGS_UPDATE_INVALID",
        userMessage: "カレンダー設定の内容を確認してください。",
        action: "入力内容を見直して、もう一度お試しください。",
        developerMessage: "Invalid calendar settings payload",
        logContext: "calendar-settings-update-validation",
      });
    }

    const { provider, targetCalendarId, freebusyCalendarIds, preferredTimeSlots } = parsedBody.data;
    const existing = await ensureCalendarSettingsRecord(userId);
    const connectionStatus = buildCalendarConnectionStatus(existing);

    if (provider === "google" && !connectionStatus.connected) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_SETTINGS_GOOGLE_NOT_CONNECTED",
        userMessage: "先に Google カレンダーを連携してください。",
        action: "連携後に、もう一度お試しください。",
        developerMessage: "Google calendar must be connected before selecting provider",
        logContext: "calendar-settings-update-validation",
      });
    }

    const nextProvider = provider ?? existing.provider;
    const nextTargetCalendarId = targetCalendarId !== undefined
      ? targetCalendarId
      : existing.targetCalendarId;
    const nextFreebusyCalendarIds = freebusyCalendarIds !== undefined
      ? freebusyCalendarIds
      : existing.freebusyCalendarIds
        ? parseStoredJsonArray(existing.freebusyCalendarIds)
        : nextTargetCalendarId
          ? [nextTargetCalendarId]
          : [];

    if (nextProvider === "google" && !nextTargetCalendarId) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_SETTINGS_TARGET_REQUIRED",
        userMessage: "追加先カレンダーを選択してください。",
        action: "Google カレンダーを選んでから、もう一度お試しください。",
        developerMessage: "Target calendar is required when Google sync is enabled",
        logContext: "calendar-settings-update-validation",
      });
    }

    if (nextProvider === "google" && nextFreebusyCalendarIds.length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_SETTINGS_FREEBUSY_REQUIRED",
        userMessage: "空き時間計算に使うカレンダーを1つ以上選択してください。",
        action: "Google カレンダーを選んでから、もう一度お試しください。",
        developerMessage: "At least one calendar is required for freebusy lookups",
        logContext: "calendar-settings-update-validation",
      });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (provider !== undefined) updateData.provider = provider;
    if (targetCalendarId !== undefined) updateData.targetCalendarId = targetCalendarId;
    if (freebusyCalendarIds !== undefined) {
      updateData.freebusyCalendarIds = JSON.stringify(freebusyCalendarIds);
    }
    if (preferredTimeSlots !== undefined) {
      updateData.preferredTimeSlots = JSON.stringify(preferredTimeSlots);
    }

    await db
      .update(calendarSettings)
      .set(updateData)
      .where(eq(calendarSettings.id, existing.id));

    if (provider === "app") {
      await cancelPendingCalendarSyncJobsForUser(userId);
    }

    const [settings] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    if (!settings) {
      throw new Error("Calendar settings record was not found after update");
    }

    let syncSummary: Awaited<ReturnType<typeof getCalendarSyncSummary>>;
    try {
      syncSummary = await getCalendarSyncSummary(userId);
    } catch {
      syncSummary = { pendingCount: 0, failedCount: 0, lastFailureReason: null };
    }

    return NextResponse.json({
      settings: buildSettingsPayload(settings, syncSummary),
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_SETTINGS_UPDATE_FAILED",
      userMessage: "カレンダー設定を更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "calendar-settings-update",
    });
  }
}
