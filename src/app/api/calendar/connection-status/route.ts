import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildCalendarConnectionStatus, ensureCalendarSettingsRecord } from "@/lib/calendar/connection";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const settings = await ensureCalendarSettingsRecord(session.user.id);
  return NextResponse.json({
    connectionStatus: buildCalendarConnectionStatus(settings),
  });
}
