/**
 * Dashboard Incomplete Items API
 *
 * GET: Returns incomplete/in-progress items for the Zeigarnik Effect UX enhancement
 * - Draft ES documents
 * - In-progress Gakuchika sessions (no summary yet)
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getDashboardIncompleteData } from "@/lib/server/app-loaders";

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "INCOMPLETE_ITEMS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "dashboard-incomplete-auth",
      });
    }

    const data = await timing.measure("db", () => getDashboardIncompleteData(identity));
    return timing.apply(NextResponse.json(data));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "INCOMPLETE_ITEMS_FETCH_FAILED",
      userMessage: "途中のタスクを読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to fetch incomplete items",
      logContext: "dashboard-incomplete-fetch",
    });
  }
}
