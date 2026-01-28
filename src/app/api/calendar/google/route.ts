import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { calendarSettings, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCalendarEvents, getFreeBusy, suggestWorkBlocks, createCalendarEvent, replaceUkarunEvents } from "@/lib/calendar/google";

async function getGoogleAccessToken(userId: string): Promise<string | null> {
  // Get access token from Better Auth accounts table
  const account = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .get();

  return account?.accessToken || null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const accessToken = await getGoogleAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json({ error: "Google Calendar not connected", code: "NOT_CONNECTED" }, { status: 403 });
    }

    // Get user's preferred calendar
    const settings = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, session.user.id))
      .get();

    const calendarId = settings?.targetCalendarId || "primary";

    if (action === "events" && start && end) {
      const events = await getCalendarEvents(accessToken, calendarId, start, end);
      return NextResponse.json({ events });
    }

    if (action === "freebusy" && start && end) {
      const busy = await getFreeBusy(accessToken, calendarId, start, end);
      return NextResponse.json({ busy });
    }

    if (action === "suggest" && start) {
      const date = start.split("T")[0];
      const dayStart = `${date}T00:00:00+09:00`;
      const dayEnd = `${date}T23:59:59+09:00`;

      const busy = await getFreeBusy(accessToken, calendarId, dayStart, dayEnd);
      const suggestions = suggestWorkBlocks(busy, date);
      return NextResponse.json({ suggestions });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Google Calendar error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const accessToken = await getGoogleAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 403 });
    }

    const settings = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, session.user.id))
      .get();

    const calendarId = settings?.targetCalendarId || "primary";
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { title, startAt, endAt, description } = body;
      const event = await createCalendarEvent(accessToken, calendarId, { title, startAt, endAt, description });
      return NextResponse.json({ event });
    }

    if (action === "replace") {
      const { timeMin, timeMax, events: newEvents } = body;
      const created = await replaceUkarunEvents(accessToken, calendarId, timeMin, timeMax, newEvents);
      return NextResponse.json({ created });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Google Calendar error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
