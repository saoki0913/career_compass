import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { clearGoogleCalendarConnection } from "@/lib/calendar/connection";
import { cancelPendingCalendarSyncJobsForUser } from "@/lib/calendar/sync";

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  await clearGoogleCalendarConnection(session.user.id);
  await cancelPendingCalendarSyncJobsForUser(session.user.id);

  return NextResponse.json({ success: true });
}
