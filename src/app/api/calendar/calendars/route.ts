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

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const { accessToken, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: status.needsReconnect ? "Googleカレンダーの再連携が必要です" : "Google Calendar not connected", code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED" },
        { status: 403 }
      );
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
    console.error("Error listing calendars:", error);
    return NextResponse.json(
      { error: "カレンダー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const { accessToken, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: status.needsReconnect ? "Googleカレンダーの再連携が必要です" : "Google Calendar not connected", code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED" },
        { status: 403 }
      );
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
      return NextResponse.json(
        {
          error: "Googleカレンダーの再連携が必要です。権限が更新されたため、もう一度Google連携してください。",
          code: "NEED_RECONNECT",
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "カレンダーの作成に失敗しました" },
      { status: 500 }
    );
  }
}
