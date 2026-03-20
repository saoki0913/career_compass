/**
 * Today's Most Important Task API
 *
 * GET: Get the most important task for today based on recommendation logic
 *
 * Logic (SPEC Section 13.3-13.5):
 * - If any confirmed deadline within 72h: DEADLINE mode
 *   - score = open_tasks_count / max(1, hours_to_due)
 *   - Pick highest score application, then oldest open task
 * - Otherwise: DEEP_DIVE mode
 *   - Priority: ES_DRAFT → GAKUCHIKA → OTHER
 *   - Within same priority: older company, older task
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getTodayTaskData } from "@/lib/server/app-loaders";

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "TODAY_TASK_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "today-task-auth",
      });
    }

    const data = await timing.measure("db", () => getTodayTaskData(identity));
    return timing.apply(NextResponse.json(data));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "TODAY_TASK_FETCH_FAILED",
      userMessage: "今日のおすすめタスクを読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      logContext: "today-task-fetch",
    });
  }
}
