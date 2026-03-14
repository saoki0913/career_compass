/**
 * Calendar Event Detail API
 *
 * DELETE: Delete a calendar event
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvents, calendarSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getValidGoogleCalendarAccessToken } from "@/lib/calendar/connection";
import { deleteCalendarEvent } from "@/lib/calendar/google";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_EVENT_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-event-delete-auth",
      });
    }

    const userId = session.user.id;

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId))
      .limit(1);

    if (!event) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "CALENDAR_EVENT_NOT_FOUND",
        userMessage: "対象のイベントが見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
        developerMessage: "Event not found",
        logContext: "calendar-event-delete-not-found",
      });
    }

    if (event.userId !== userId) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "CALENDAR_EVENT_PERMISSION_DENIED",
        userMessage: "このイベントは削除できませんでした。",
        action: "対象のイベントを確認して、もう一度お試しください。",
        developerMessage: "Permission denied",
        logContext: "calendar-event-delete-forbidden",
      });
    }

    if (event.externalEventId) {
      const [settings] = await db
        .select()
        .from(calendarSettings)
        .where(eq(calendarSettings.userId, userId))
        .limit(1);

      if (settings?.targetCalendarId) {
        const { accessToken } = await getValidGoogleCalendarAccessToken(userId);
        if (accessToken) {
          await deleteCalendarEvent(accessToken, settings.targetCalendarId, event.externalEventId);
        }
      }
    }

    await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_EVENT_DELETE_FAILED",
      userMessage: "イベントを削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "calendar-event-delete",
    });
  }
}
