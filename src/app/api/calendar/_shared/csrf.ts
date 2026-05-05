import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import type { CsrfFailureReason } from "@/lib/csrf";

export function createCalendarCsrfErrorResponse(
  request: NextRequest,
  csrfFailure: CsrfFailureReason,
) {
  return createApiErrorResponse(request, {
    status: 403,
    code: "CSRF_VALIDATION_FAILED",
    userMessage: "操作を完了できませんでした。",
    action: "ページを再読み込みして、もう一度お試しください。",
    developerMessage: `CSRF validation failed: ${csrfFailure}`,
    logContext: "calendar-csrf",
  });
}
