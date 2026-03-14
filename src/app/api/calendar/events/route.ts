/**
 * Calendar Events API
 *
 * GET: List calendar events
 * POST: Create a calendar event
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvents, deadlines, companies, calendarSettings } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { headers } from "next/headers";
import { getValidGoogleCalendarAccessToken } from "@/lib/calendar/connection";
import { createCalendarEvent } from "@/lib/calendar/google";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
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

    const userId = session.user.id;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    // Build conditions
    const conditions = [eq(calendarEvents.userId, userId)];
    if (startDate) {
      conditions.push(gte(calendarEvents.startAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(calendarEvents.endAt, new Date(endDate)));
    }

    // Get user's calendar events
    const events = await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt);

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
      })
      .from(deadlines)
      .leftJoin(companies, eq(deadlines.companyId, companies.id))
      .where(
        and(
          eq(companies.userId, userId),
          startDate ? gte(deadlines.dueDate, new Date(startDate)) : undefined,
          endDate ? lte(deadlines.dueDate, new Date(endDate)) : undefined
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

    const [settings] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    let externalEventId: string | null = null;
    if (settings?.provider === "google" && settings.targetCalendarId) {
      const { accessToken } = await getValidGoogleCalendarAccessToken(userId);
      if (accessToken) {
        const createdGoogleEvent = await createCalendarEvent(accessToken, settings.targetCalendarId, {
          title: title.trim(),
          startAt,
          endAt,
        });
        externalEventId = createdGoogleEvent.id ?? null;
      }
    }

    const newEvent = await db
      .insert(calendarEvents)
      .values({
        id: crypto.randomUUID(),
        userId,
        deadlineId: deadlineId || null,
        externalEventId,
        type,
        title: title.trim(),
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        createdAt: new Date(),
      })
      .returning();

    return NextResponse.json({ event: newEvent[0] });
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
