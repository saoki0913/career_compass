/**
 * Calendar List API
 *
 * GET: List user's Google Calendars
 * POST: Create a new Google Calendar
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, calendarSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { listCalendars, createCalendar, refreshAccessToken, GoogleCalendarScopeError } from "@/lib/calendar/google";

interface GoogleAccount {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  id: string;
}

async function getGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);

  if (!account) return null;

  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    id: account.id,
  };
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await getGoogleAccount(userId);
  if (!account?.accessToken) return null;

  // Check if token is expired or about to expire (within 5 minutes)
  const now = new Date();
  const expiresAt = account.accessTokenExpiresAt;
  const isExpired = expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

  if (isExpired && account.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(account.refreshToken);
      await db
        .update(accounts)
        .set({
          accessToken: refreshed.accessToken,
          accessTokenExpiresAt: refreshed.expiresAt,
          updatedAt: now,
        })
        .where(eq(accounts.id, account.id));
      return refreshed.accessToken;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return null;
    }
  }

  return account.accessToken;
}

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

    const accessToken = await getValidAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Calendar not connected", code: "NOT_CONNECTED" },
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

    const accessToken = await getValidAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Calendar not connected", code: "NOT_CONNECTED" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = body.name || "Career Compass";

    // Create the calendar in Google
    const newCalendar = await createCalendar(accessToken, name);

    // Automatically set this as the target calendar
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
          provider: "google",
          updatedAt: now,
        })
        .where(eq(calendarSettings.id, existing.id));
    } else {
      await db.insert(calendarSettings).values({
        id: crypto.randomUUID(),
        userId,
        provider: "google",
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
