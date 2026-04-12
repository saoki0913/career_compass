/**
 * Calendar Sync Retry API
 *
 * POST: Reset all failed sync jobs back to pending for retry.
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { retryFailedSyncJobs } from "@/lib/calendar/sync-persistence";

export async function POST(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

    if (!identity?.userId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "SYNC_RETRY_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        retryable: false,
        logContext: "sync-retry-auth",
      });
    }

    const retriedCount = await timing.measure("retry", () =>
      retryFailedSyncJobs(identity.userId!),
    );

    return timing.apply(
      NextResponse.json({ success: true, retriedCount }),
    );
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "SYNC_RETRY_FAILED",
      userMessage: "再試行の開始に失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "sync-retry",
    });
  }
}
