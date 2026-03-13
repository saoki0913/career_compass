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
    const existing = await ensureCalendarSettingsRecord(userId);
    const connectionStatus = buildCalendarConnectionStatus(existing);

    if (provider === "google" && !connectionStatus.connected) {
      return NextResponse.json(
        { error: "Googleカレンダーを先に連携してください" },
        { status: 400 }
      );
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
    console.error("Error updating calendar settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
