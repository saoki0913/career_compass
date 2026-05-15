/**
 * Calendar Event Detail API
 *
 * DELETE: Delete a calendar event
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  syncWorkBlockDeleteImmediately,
  type ImmediateSyncResult,
} from "@/lib/calendar/sync";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { createCalendarCsrfErrorResponse } from "@/app/api/calendar/_shared/csrf";
import { getCsrfFailureReason } from "@/lib/csrf";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return createCalendarCsrfErrorResponse(request, csrfFailure);
  }

  try {
    const { id: eventId } = await params;

    let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
    try {
      session = await auth.api.getSession({
        headers: await headers(),
      });
    } catch (error) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "AUTH_SESSION_UNAVAILABLE",
        userMessage: "認証情報を確認できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
        logContext: "calendar-event-delete-identity",
      });
    }

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
      .select({
        id: calendarEvents.id,
        googleCalendarId: calendarEvents.googleCalendarId,
        googleEventId: calendarEvents.googleEventId,
      })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)))
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

    const calendarSync: ImmediateSyncResult = await syncWorkBlockDeleteImmediately({
      userId,
      eventId,
      googleCalendarId: event.googleCalendarId,
      googleEventId: event.googleEventId,
    });
    if (calendarSync.status === "failed") {
      return createApiErrorResponse(request, {
        status: 503,
        code: "CALENDAR_EVENT_DELETE_RETRY_UNAVAILABLE",
        userMessage: "Googleカレンダー同期の再試行を登録できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        developerMessage: calendarSync.error,
        logContext: "calendar-event-delete-sync",
      });
    }

    const [deleted] = await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)))
      .returning({ id: calendarEvents.id });

    if (!deleted) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "CALENDAR_EVENT_NOT_FOUND",
        userMessage: "対象のイベントが見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
        developerMessage: "Event not found during delete",
        logContext: "calendar-event-delete-not-found",
      });
    }

    return NextResponse.json({ success: true, calendarSync });
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
