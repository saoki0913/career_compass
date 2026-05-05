import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getFreeBusy, suggestWorkBlocks } from "@/lib/calendar/google";
import { getValidGoogleCalendarAccessToken, parseStoredJsonArray } from "@/lib/calendar/connection";
import { reconcileGoogleCalendarEvents } from "@/lib/calendar/sync";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { createCalendarCsrfErrorResponse } from "@/app/api/calendar/_shared/csrf";
import { getCsrfFailureReason } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_GOOGLE_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
        developerMessage: "Authentication required",
        logContext: "calendar-google-auth",
      });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const { accessToken, settings, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return createApiErrorResponse(request, {
        status: 403,
        code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED",
        userMessage: status.needsReconnect
          ? "Googleカレンダーの再連携が必要です。"
          : "Googleカレンダーを連携してください。",
        action: status.needsReconnect
          ? "再連携してから、もう一度お試しください。"
          : "Google カレンダーを連携してから、もう一度お試しください。",
        developerMessage: status.needsReconnect
          ? "Google calendar reconnect required"
          : "Google Calendar not connected",
        logContext: "calendar-google-connection",
      });
    }

    if (action === "events") {
      return createApiErrorResponse(request, {
        status: 405,
        code: "CALENDAR_GOOGLE_EVENTS_POST_REQUIRED",
        userMessage: "Google カレンダーの同期方法が更新されました。",
        action: "ページを再読み込みして、もう一度お試しください。",
        developerMessage: "Calendar event reconcile must use POST",
        logContext: "calendar-google-events-method",
      });
    }

    if (action === "freebusy" && start && end) {
      const freebusyIds = settings?.freebusyCalendarIds
        ? parseStoredJsonArray(settings.freebusyCalendarIds)
        : settings?.targetCalendarId
          ? [settings.targetCalendarId]
          : [];

      if (freebusyIds.length === 0) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "CALENDAR_FREEBUSY_TARGET_REQUIRED",
          userMessage: "空き時間算出対象のカレンダーを設定してください。",
          action: "Google カレンダー設定を確認してください。",
          developerMessage: "Freebusy calendar ids are required",
          logContext: "calendar-google-freebusy-validation",
        });
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
        return createApiErrorResponse(request, {
          status: 400,
          code: "CALENDAR_SUGGEST_TARGET_REQUIRED",
          userMessage: "空き時間算出対象のカレンダーを設定してください。",
          action: "Google カレンダー設定を確認してください。",
          developerMessage: "Freebusy calendar ids are required",
          logContext: "calendar-google-suggest-validation",
        });
      }

      const busy = await getFreeBusy(accessToken, freebusyIds, dayStart, dayEnd);
      const suggestions = suggestWorkBlocks(busy, date);
      return NextResponse.json({ suggestions });
    }

    return createApiErrorResponse(request, {
      status: 400,
      code: "CALENDAR_GOOGLE_ACTION_INVALID",
      userMessage: "カレンダー操作を確認してください。",
      action: "ページを再読み込みして、もう一度お試しください。",
      developerMessage: "Invalid calendar google action",
      logContext: "calendar-google-action",
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_GOOGLE_FAILED",
      userMessage: "Google カレンダー情報を取得できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Google Calendar request failed",
      logContext: "calendar-google",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrfFailure = getCsrfFailureReason(request);
  if (csrfFailure) {
    return createCalendarCsrfErrorResponse(request, csrfFailure);
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "CALENDAR_GOOGLE_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
        developerMessage: "Authentication required",
        logContext: "calendar-google-auth",
      });
    }

    const body = await request.json().catch(() => ({}));
    const start = typeof body.start === "string" ? body.start : null;
    const end = typeof body.end === "string" ? body.end : null;
    if (!start || !end) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "CALENDAR_GOOGLE_DATE_RANGE_REQUIRED",
        userMessage: "取得期間を指定してください。",
        action: "ページを再読み込みして、もう一度お試しください。",
        developerMessage: "Calendar event reconcile start/end are required",
        logContext: "calendar-google-events-validation",
      });
    }

    const { accessToken, settings, status } = await getValidGoogleCalendarAccessToken(session.user.id);
    if (!accessToken) {
      return createApiErrorResponse(request, {
        status: 403,
        code: status.needsReconnect ? "NEED_RECONNECT" : "NOT_CONNECTED",
        userMessage: status.needsReconnect
          ? "Googleカレンダーの再連携が必要です。"
          : "Googleカレンダーを連携してください。",
        action: status.needsReconnect
          ? "再連携してから、もう一度お試しください。"
          : "Google カレンダーを連携してから、もう一度お試しください。",
        developerMessage: status.needsReconnect
          ? "Google calendar reconnect required"
          : "Google Calendar not connected",
        logContext: "calendar-google-connection",
      });
    }

    const calendarId = settings?.targetCalendarId;
    if (!calendarId) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "TARGET_CALENDAR_REQUIRED",
        userMessage: "追加先カレンダーを設定してください。",
        action: "Google カレンダー設定を確認してください。",
        developerMessage: "Target calendar is required for event reconcile",
        logContext: "calendar-google-events-validation",
      });
    }

    const result = await reconcileGoogleCalendarEvents(session.user.id, calendarId, start, end);
    return NextResponse.json({ events: result.externalEvents });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "CALENDAR_GOOGLE_EVENTS_FAILED",
      userMessage: "Google カレンダーの予定を同期できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Google Calendar event reconcile failed",
      logContext: "calendar-google-events",
    });
  }
}
