/**
 * Calendar Events API
 *
 * GET: List calendar events
 * POST: Create a calendar event
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvents, deadlines, companies } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { syncWorkBlockImmediately, type ImmediateSyncResult } from "@/lib/calendar/sync";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { buildOwnerCondition, hasOwnedDeadline } from "@/bff/identity/owner-access";
import { createCalendarCsrfErrorResponse } from "@/app/api/calendar/_shared/csrf";
import { getCsrfFailureReason } from "@/lib/csrf";
import { getRequestIdentity } from "@/bff/identity/request-identity";

function parseOptionalDateParam(request: NextRequest, value: string | null, name: string): Date | null | Response {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date;
  return createApiErrorResponse(request, {
    status: 400,
    code: "CALENDAR_EVENTS_INVALID_DATE",
    userMessage: "カレンダーの表示期間を確認してください。",
    action: "ページを再読み込みして、もう一度お試しください。",
    developerMessage: `Invalid ${name} query parameter`,
    logContext: "calendar-events-validation",
  });
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_EVENTS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-events-auth",
      });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = parseOptionalDateParam(request, searchParams.get("start"), "start");
    if (startDate instanceof Response) return startDate;
    const endDate = parseOptionalDateParam(request, searchParams.get("end"), "end");
    if (endDate instanceof Response) return endDate;

    const events = identity.userId
      ? await db
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.userId, identity.userId),
              startDate ? gte(calendarEvents.startAt, startDate) : undefined,
              endDate ? lte(calendarEvents.endAt, endDate) : undefined,
            ),
          )
          .orderBy(calendarEvents.startAt)
      : [];

    const ownerCondition = buildOwnerCondition(companies, identity);
    if (!ownerCondition) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_EVENTS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Valid owner identity required",
        logContext: "calendar-events-auth",
      });
    }

    // Also get deadlines to display on calendar
    const deadlineEvents = await db
      .select({
        id: deadlines.id,
        title: deadlines.title,
        type: deadlines.type,
        dueDate: deadlines.dueDate,
        companyId: deadlines.companyId,
        companyName: companies.name,
        isConfirmed: deadlines.isConfirmed,
        completedAt: deadlines.completedAt,
        googleSyncStatus: deadlines.googleSyncStatus,
        googleSyncError: deadlines.googleSyncError,
      })
      .from(deadlines)
      .innerJoin(companies, eq(deadlines.companyId, companies.id))
      .where(
        and(
          ownerCondition,
          eq(deadlines.isConfirmed, true),
          startDate ? gte(deadlines.dueDate, startDate) : undefined,
          endDate ? lte(deadlines.dueDate, endDate) : undefined,
        )
      )
      .orderBy(deadlines.dueDate);

    return NextResponse.json({
      events,
      deadlines: deadlineEvents.map((d) => ({
        ...d,
        eventType: "deadline",
      })),
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_EVENTS_FETCH_FAILED",
      userMessage: "カレンダーを読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "calendar-events-fetch",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return createCalendarCsrfErrorResponse(request, csrfFailure);
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_EVENT_CREATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-event-create-auth",
      });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { type, title, startAt, endAt, deadlineId } = body;

    if (!title?.trim()) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_EVENT_TITLE_REQUIRED",
        userMessage: "タイトルを入力してください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Calendar event title is required",
        logContext: "calendar-event-create-validation",
      });
    }

    if (!startAt || !endAt) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_EVENT_TIME_REQUIRED",
        userMessage: "開始時刻と終了時刻を入力してください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Calendar event start/end required",
        logContext: "calendar-event-create-validation",
      });
    }

    const validTypes = ["deadline", "work_block"];
    if (!validTypes.includes(type)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_EVENT_TYPE_INVALID",
        userMessage: "イベント種類を確認して、もう一度お試しください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Invalid calendar event type",
        logContext: "calendar-event-create-validation",
      });
    }

    if (deadlineId) {
      const hasDeadline = await hasOwnedDeadline(deadlineId, { userId, guestId: null });
      if (!hasDeadline) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "CALENDAR_EVENT_DEADLINE_NOT_FOUND",
          userMessage: "関連する締切が見つかりませんでした。",
          action: "締切の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Deadline not found for calendar event create",
          logContext: "calendar-event-create-validation",
        });
      }
    }

    const [newEvent] = await db
      .insert(calendarEvents)
      .values({
        id: crypto.randomUUID(),
        userId,
        deadlineId: deadlineId || null,
        type,
        title: title.trim(),
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        googleSyncStatus: "idle",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const calendarSync: ImmediateSyncResult = await syncWorkBlockImmediately(userId, newEvent.id);

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, newEvent.id))
      .limit(1);

    return NextResponse.json({ event, calendarSync });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_EVENT_CREATE_FAILED",
      userMessage: "イベントを作成できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "calendar-event-create",
    });
  }
}
