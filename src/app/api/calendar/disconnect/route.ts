import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  await db
    .update(calendarSettings)
    .set({
      provider: "app",
      targetCalendarId: null,
      freebusyCalendarIds: null,
      googleCalendarNeedsReconnect: false,
      updatedAt: new Date(),
    })
    .where(eq(calendarSettings.userId, session.user.id));

  return NextResponse.json({ success: true });
}
