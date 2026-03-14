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
import {
  buildCalendarConnectionStatus,
  ensureCalendarSettingsRecord,
  parseStoredJsonArray,
} from "@/lib/calendar/connection";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

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
    const connectionStatus = buildCalendarConnectionStatus(settings);

    return NextResponse.json({
      settings: {
        ...settings,
        freebusyCalendarIds: settings.freebusyCalendarIds
          ? parseStoredJsonArray(settings.freebusyCalendarIds)
          : settings.targetCalendarId
            ? [settings.targetCalendarId]
            : [],
        preferredTimeSlots: settings.preferredTimeSlots
          ? JSON.parse(settings.preferredTimeSlots)
          : null,
        connectionStatus,
      },
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
    const body = await request.json();
    const { provider, targetCalendarId, freebusyCalendarIds, preferredTimeSlots } = body;
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

    const [settings] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    const updatedConnectionStatus = buildCalendarConnectionStatus(settings);

    return NextResponse.json({
      settings: {
        ...settings,
        freebusyCalendarIds: settings?.freebusyCalendarIds
          ? parseStoredJsonArray(settings.freebusyCalendarIds)
          : settings?.targetCalendarId
            ? [settings.targetCalendarId]
            : [],
        preferredTimeSlots: settings?.preferredTimeSlots
          ? JSON.parse(settings.preferredTimeSlots)
          : null,
        connectionStatus: updatedConnectionStatus,
      },
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
