/**
 * Upcoming Deadlines API
 *
 * GET: Get deadlines for the next 7 days (default) or specified period
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deadlines, companies } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, inArray } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

export async function GET(request: NextRequest) {
  try {
    // Get days parameter (default 7)
    const searchParams = request.nextUrl.searchParams;
    const parsedDays = Number.parseInt(searchParams.get("days") || "7", 10);
    const periodDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
    const maxDays = Math.min(periodDays, 30); // Cap at 30 days

    const identity = await getRequestIdentity(request);
    const userId = identity?.userId ?? null;
    const guestId = identity?.guestId ?? null;

    if (!userId && !guestId) {
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

    // Calculate date range
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + maxDays);

    // Get companies for user/guest
    const userCompanies = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(
        userId
          ? eq(companies.userId, userId)
          : eq(companies.guestId, guestId!)
      );

    if (userCompanies.length === 0) {
      return NextResponse.json({
        deadlines: [],
        count: 0,
        periodDays: maxDays,
      });
    }

    const companyIds = userCompanies.map((c) => c.id);
    const companyMap = new Map(userCompanies.map((c) => [c.id, c.name]));

    // Get upcoming deadlines
    const upcomingDeadlines = await db
      .select()
      .from(deadlines)
      .where(
        and(
          // Company belongs to user
          inArray(deadlines.companyId, companyIds),
          // Due date is in the future (or today)
          gte(deadlines.dueDate, now),
          // Due date is within the specified period
          lte(deadlines.dueDate, endDate),
          // Not completed
          isNull(deadlines.completedAt)
        )
      )
      .orderBy(deadlines.dueDate);

    // Format response with company names
    const formattedDeadlines = upcomingDeadlines.map((d) => {
      const dueDate = new Date(d.dueDate);
      const diffTime = dueDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        id: d.id,
        companyId: d.companyId,
        company: companyMap.get(d.companyId) || "Unknown",
        type: d.type,
        title: d.title,
        description: d.description,
        dueDate: d.dueDate.toISOString(),
        daysLeft,
        isConfirmed: d.isConfirmed,
        confidence: d.confidence,
        sourceUrl: d.sourceUrl,
      };
    });

    return NextResponse.json({
      deadlines: formattedDeadlines,
      count: formattedDeadlines.length,
      periodDays: maxDays,
    });
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
