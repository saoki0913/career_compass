import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildCalendarConnectionStatus, ensureCalendarSettingsRecord } from "@/lib/calendar/connection";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(undefined, {
        status: 401,
        code: "CALENDAR_CONNECTION_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "calendar-connection-auth",
      });
    }

    const settings = await ensureCalendarSettingsRecord(session.user.id);
    return NextResponse.json({
      connectionStatus: buildCalendarConnectionStatus(settings),
    });
  } catch (error) {
    return createApiErrorResponse(undefined, {
      status: 500,
      code: "CALENDAR_CONNECTION_STATUS_FAILED",
      userMessage: "カレンダー接続状態を取得できませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "calendar-connection-status",
    });
  }
}
