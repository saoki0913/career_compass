import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCalendarEvents, getFreeBusy, suggestWorkBlocks, createCalendarEvent, replaceUkarunEvents } from "@/lib/calendar/google";
import { getValidGoogleCalendarAccessToken } from "@/lib/calendar/connection";

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

    const { accessToken, settings, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json(
        {
          error: status.needsReconnect ? "Googleカレンダーの再連携が必要です" : "Google Calendar not connected",
          code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED",
        },
        { status: 403 }
      );
    }

    const calendarId = settings?.targetCalendarId || "primary";

    if (action === "events" && start && end) {
      const events = await getCalendarEvents(accessToken, calendarId, start, end);
      return NextResponse.json({ events });
    }

    if (action === "freebusy" && start && end) {
      const freebusyIds = settings?.freebusyCalendarIds
        ? JSON.parse(settings.freebusyCalendarIds)
        : settings?.targetCalendarId
          ? [settings.targetCalendarId]
          : [];

      if (freebusyIds.length === 0) {
        return NextResponse.json({ error: "空き時間算出対象のカレンダーを設定してください" }, { status: 400 });
      }

      const busy = await getFreeBusy(accessToken, freebusyIds, start, end);
      return NextResponse.json({ busy });
    }

    if (action === "suggest" && start) {
      const date = start.split("T")[0];
      const dayStart = `${date}T00:00:00+09:00`;
      const dayEnd = `${date}T23:59:59+09:00`;

      const freebusyIds = settings?.freebusyCalendarIds
        ? JSON.parse(settings.freebusyCalendarIds)
        : settings?.targetCalendarId
          ? [settings.targetCalendarId]
          : [];

      if (freebusyIds.length === 0) {
        return NextResponse.json({ error: "空き時間算出対象のカレンダーを設定してください" }, { status: 400 });
      }

      const busy = await getFreeBusy(accessToken, freebusyIds, dayStart, dayEnd);
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

    const { accessToken, settings, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json(
        {
          error: status.needsReconnect ? "Googleカレンダーの再連携が必要です" : "Google Calendar not connected",
          code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED",
        },
        { status: 403 }
      );
    }

    const calendarId = settings?.targetCalendarId || "primary";
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      if (!settings?.targetCalendarId) {
        return NextResponse.json(
          { error: "追加先カレンダーを設定してください", code: "TARGET_CALENDAR_REQUIRED" },
          { status: 400 }
        );
      }
      const { title, startAt, endAt, description } = body;
      if (!title || !startAt || !endAt) {
        return NextResponse.json(
          { error: "イベント情報が不足しています", code: "INVALID_EVENT_PAYLOAD" },
          { status: 400 }
        );
      }
      try {
        const event = await createCalendarEvent(accessToken, calendarId, { title, startAt, endAt, description });
        return NextResponse.json({ event });
      } catch {
        return NextResponse.json(
          { error: "Googleカレンダーへの追加に失敗しました", code: "CALENDAR_CREATE_FAILED" },
          { status: 502 }
        );
      }
    }

    if (action === "replace") {
      if (!settings?.targetCalendarId) {
        return NextResponse.json(
          { error: "追加先カレンダーを設定してください", code: "TARGET_CALENDAR_REQUIRED" },
          { status: 400 }
        );
      }
      const { timeMin, timeMax, events: newEvents } = body;
      try {
        const created = await replaceUkarunEvents(accessToken, calendarId, timeMin, timeMax, newEvents);
        return NextResponse.json({ created });
      } catch {
        return NextResponse.json(
          { error: "Googleカレンダーへの反映に失敗しました", code: "CALENDAR_REPLACE_FAILED" },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Google Calendar error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
