/**
 * Calendar Settings API
 *
 * GET: Get calendar settings
 * PUT: Update calendar settings
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarSettings, accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

/**
 * Check if user has Google Calendar connected via Better Auth
 */
async function checkGoogleConnection(userId: string): Promise<boolean> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .limit(1);
  return !!account?.accessToken;
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

    const userId = session.user.id;

    const [settings] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    // Check if user has Google connected via OAuth
    const isGoogleConnected = await checkGoogleConnection(userId);

    if (!settings) {
      // Return default settings
      return NextResponse.json({
        settings: {
          provider: "app",
          targetCalendarId: null,
          freebusyCalendarIds: [],
          preferredTimeSlots: null,
          isGoogleConnected,
        },
      });
    }

    return NextResponse.json({
      settings: {
        ...settings,
        freebusyCalendarIds: settings.freebusyCalendarIds
          ? JSON.parse(settings.freebusyCalendarIds)
          : [],
        preferredTimeSlots: settings.preferredTimeSlots
          ? JSON.parse(settings.preferredTimeSlots)
          : null,
        isGoogleConnected,
      },
    });
  } catch (error) {
    console.error("Error fetching calendar settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

    const userId = session.user.id;
    const body = await request.json();
    const { provider, targetCalendarId, freebusyCalendarIds, preferredTimeSlots } = body;

    const [existing] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    const now = new Date();

    if (existing) {
      const updateData: Record<string, unknown> = {
        updatedAt: now,
      };

      if (provider !== undefined) updateData.provider = provider;
      if (targetCalendarId !== undefined) updateData.targetCalendarId = targetCalendarId;
      if (freebusyCalendarIds !== undefined)
        updateData.freebusyCalendarIds = JSON.stringify(freebusyCalendarIds);
      if (preferredTimeSlots !== undefined)
        updateData.preferredTimeSlots = JSON.stringify(preferredTimeSlots);

      await db
        .update(calendarSettings)
        .set(updateData)
        .where(eq(calendarSettings.id, existing.id));
    } else {
      await db.insert(calendarSettings).values({
        id: crypto.randomUUID(),
        userId,
        provider: provider || "app",
        targetCalendarId: targetCalendarId || null,
        freebusyCalendarIds: freebusyCalendarIds
          ? JSON.stringify(freebusyCalendarIds)
          : null,
        preferredTimeSlots: preferredTimeSlots
          ? JSON.stringify(preferredTimeSlots)
          : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [settings] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId))
      .limit(1);

    // Check if user has Google connected via OAuth
    const isGoogleConnected = await checkGoogleConnection(userId);

    return NextResponse.json({
      settings: {
        ...settings,
        freebusyCalendarIds: settings?.freebusyCalendarIds
          ? JSON.parse(settings.freebusyCalendarIds)
          : [],
        preferredTimeSlots: settings?.preferredTimeSlots
          ? JSON.parse(settings.preferredTimeSlots)
          : null,
        isGoogleConnected,
      },
    });
  } catch (error) {
    console.error("Error updating calendar settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
