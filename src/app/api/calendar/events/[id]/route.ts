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
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId))
      .limit(1);

    if (!event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (event.userId !== userId) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
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
    console.error("Error deleting calendar event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
