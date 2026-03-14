/**
 * Calendar List API
 *
 * GET: List user's Google Calendars
 * POST: Create a new Google Calendar
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { listCalendars, createCalendar, GoogleCalendarScopeError } from "@/lib/calendar/google";
import { getValidGoogleCalendarAccessToken } from "@/lib/calendar/connection";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_LIST_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-list-auth",
      });
    }

    const { accessToken, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return createApiErrorResponse(request, {
        status: 403,
        code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED",
        userMessage: status.needsReconnect
          ? "Googleカレンダーの再連携が必要です。"
          : "Googleカレンダーを連携してください。",
        action: status.needsReconnect
          ? "再連携してから、もう一度お試しください。"
          : "Google カレンダーを連携してから、もう一度お試しください。",
        developerMessage: status.needsReconnect
          ? "Google calendar reconnect required"
          : "Google Calendar not connected",
        logContext: "calendar-list-connection",
      });
    }

    const calendars = await listCalendars(accessToken);

    // Return simplified calendar list with id, summary, and primary flag
    const calendarList = calendars.map((cal: { id: string; summary: string; primary?: boolean }) => ({
      id: cal.id,
      name: cal.summary,
      isPrimary: cal.primary || false,
    }));

    return NextResponse.json({ calendars: calendarList });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_LIST_FETCH_FAILED",
      userMessage: "カレンダー一覧を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to list calendars",
      logContext: "calendar-list-fetch",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_CREATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-create-auth",
      });
    }

    const { accessToken, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return createApiErrorResponse(request, {
        status: 403,
        code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED",
        userMessage: status.needsReconnect
          ? "Googleカレンダーの再連携が必要です。"
          : "Googleカレンダーを連携してください。",
        action: status.needsReconnect
          ? "再連携してから、もう一度お試しください。"
          : "Google カレンダーを連携してから、もう一度お試しください。",
        developerMessage: status.needsReconnect
          ? "Google calendar reconnect required"
          : "Google Calendar not connected",
        logContext: "calendar-create-connection",
      });
    }

    const body = await request.json();
    const name = body.name || "就活Pass";

    // Create the calendar in Google
    const newCalendar = await createCalendar(accessToken, name);

    const userId = session.user.id;
    const [existing] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    const now = new Date();

    if (existing) {
      await db
        .update(calendarSettings)
        .set({
          targetCalendarId: newCalendar.id,
          updatedAt: now,
        })
        .where(eq(calendarSettings.id, existing.id));
    } else {
      await db.insert(calendarSettings).values({
        id: crypto.randomUUID(),
        userId,
        provider: "app",
        targetCalendarId: newCalendar.id,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      calendar: {
        id: newCalendar.id,
        name: newCalendar.summary,
        isPrimary: false,
      },
    });
  } catch (error) {
    console.error("Error creating calendar:", error);
    if (error instanceof GoogleCalendarScopeError) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "NEED_RECONNECT",
        userMessage: "Googleカレンダーの再連携が必要です。",
        action: "再連携してから、もう一度お試しください。",
        error,
        developerMessage:
          "Google calendar reconnect required because granted scopes are outdated",
        logContext: "calendar-create-reconnect",
      });
    }
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_CREATE_FAILED",
      userMessage: "カレンダーを作成できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to create calendar",
      logContext: "calendar-create",
    });
  }
}
