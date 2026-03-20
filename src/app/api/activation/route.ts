/**
 * Activation checklist API
 *
 * Returns a lightweight progress snapshot used to guide first-time users.
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getActivationData } from "@/lib/server/app-loaders";

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "ACTIVATION_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "activation-auth",
      });
    }

    const data = await timing.measure("db", () => getActivationData(identity));
    return timing.apply(NextResponse.json(data));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "ACTIVATION_FETCH_FAILED",
      userMessage: "利用状況を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to fetch activation progress",
      logContext: "activation-fetch",
    });
  }
}
