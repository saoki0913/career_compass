/**
 * Deadlines Dashboard API
 *
 * GET: Get all confirmed deadlines with status, task progress, and summary stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { getDeadlinesDashboardData, type DeadlineDashboardFilters } from "@/lib/server/deadline-loaders";
import type { DeadlineComputedStatus } from "@/lib/server/deadline-status";

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINES_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        retryable: true,
        logContext: "deadlines-dashboard-auth",
      });
    }

    const params = request.nextUrl.searchParams;
    const filters: DeadlineDashboardFilters = {
      status: (params.get("status") as DeadlineComputedStatus) || undefined,
      type: params.get("type") || undefined,
      companyId: params.get("companyId") || undefined,
      search: params.get("search") || undefined,
      sort: (params.get("sort") as DeadlineDashboardFilters["sort"]) || undefined,
      sortDir: (params.get("sortDir") as "asc" | "desc") || undefined,
    };

    const data = await timing.measure("db", () =>
      getDeadlinesDashboardData(identity, filters),
    );

    return timing.apply(NextResponse.json(data));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DEADLINES_FETCH_FAILED",
      userMessage: "締切一覧を読み込めませんでした。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "deadlines-dashboard",
    });
  }
}
