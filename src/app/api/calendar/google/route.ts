import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getFreeBusy, suggestWorkBlocks } from "@/lib/calendar/google";
import { getValidGoogleCalendarAccessToken, parseStoredJsonArray } from "@/lib/calendar/connection";
import { reconcileGoogleCalendarEvents } from "@/lib/calendar/sync";

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

    const calendarId = settings?.targetCalendarId;

    if (action === "events" && start && end) {
      if (!calendarId) {
        return NextResponse.json(
          { error: "追加先カレンダーを設定してください", code: "TARGET_CALENDAR_REQUIRED" },
          { status: 400 }
        );
      }

      const result = await reconcileGoogleCalendarEvents(session.user.id, calendarId, start, end);
      return NextResponse.json({ events: result.externalEvents });
    }

    if (action === "freebusy" && start && end) {
      const freebusyIds = settings?.freebusyCalendarIds
        ? parseStoredJsonArray(settings.freebusyCalendarIds)
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
        ? parseStoredJsonArray(settings.freebusyCalendarIds)
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
