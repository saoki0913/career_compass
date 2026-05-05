import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { clearGoogleCalendarConnection } from "@/lib/calendar/connection";
import { cancelPendingCalendarSyncJobsForUser } from "@/lib/calendar/sync";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { createCalendarCsrfErrorResponse } from "@/app/api/calendar/_shared/csrf";
import { getCsrfFailureReason } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return createCalendarCsrfErrorResponse(request, csrfFailure);
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_DISCONNECT_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
        developerMessage: "Authentication required",
        logContext: "calendar-disconnect-auth",
      });
    }

    await clearGoogleCalendarConnection(session.user.id);
    await cancelPendingCalendarSyncJobsForUser(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_DISCONNECT_FAILED",
      userMessage: "Google カレンダー連携を解除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Calendar disconnect failed",
      logContext: "calendar-disconnect",
    });
  }
}
