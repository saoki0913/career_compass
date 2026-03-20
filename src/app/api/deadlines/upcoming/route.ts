/**
 * Upcoming Deadlines API
 *
 * GET: Get deadlines for the next 7 days (default) or specified period
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getUpcomingDeadlinesData } from "@/lib/server/app-loaders";

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsedDays = Number.parseInt(searchParams.get("days") || "7", 10);
    const periodDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "UPCOMING_DEADLINES_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "upcoming-deadlines-auth",
      });
    }

    const data = await timing.measure("db", () => getUpcomingDeadlinesData(identity, periodDays));
    return timing.apply(NextResponse.json(data));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "UPCOMING_DEADLINES_FETCH_FAILED",
      userMessage: "締切一覧を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      logContext: "upcoming-deadlines-fetch",
    });
  }
}
