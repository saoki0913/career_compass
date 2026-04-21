/**
 * Phase 2 Stage 8-2: Interview Growth Dashboard API.
 *
 * GET /api/interview/dashboard
 *
 * Returns aggregated analytics across the authenticated user's
 * `interview_feedback_histories`:
 *   - trendSeries:    last N (default 10) sessions x 7 axes (oldest -> newest)
 *   - companyHeatmap: top M (default 10) companies x 7 axes (avg score)
 *   - formatHeatmap:  4 interview formats x 7 axes (avg score)
 *   - recurringIssues: top 5 keywords from the last 3 sessions' improvements[]
 *
 * Auth: user-only. Guest sessions are rejected with 401 because this surface
 * requires multi-session history (guests are not expected to accumulate
 * meaningful cross-company data) — CLAUDE.md Business Rule #5 compatible
 * guard at the route layer.
 */

import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { db } from "@/lib/db";
import {
  companies,
  interviewConversations,
  interviewFeedbackHistories,
} from "@/lib/db/schema";
import {
  buildInterviewDashboardPayload,
  type InterviewHistoryRow,
} from "@/lib/interview/dashboard";

const FETCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getRequestIdentity(request));
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "INTERVIEW_DASHBOARD_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
        logContext: "interview-dashboard-auth",
      });
    }

    // Guest users cannot accumulate cross-company history reliably — reject.
    if (!identity.userId) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "INTERVIEW_DASHBOARD_GUEST_FORBIDDEN",
        userMessage: "成長ダッシュボードはログインしたユーザーのみ利用できます。",
        action: "Google ログインしてから、もう一度お試しください。",
        logContext: "interview-dashboard-guest",
      });
    }

    const rows = await timing.measure("db", () =>
      db
        .select({
          companyId: interviewFeedbackHistories.companyId,
          companyName: companies.name,
          interviewFormat: interviewConversations.interviewFormat,
          scores: interviewFeedbackHistories.scores,
          improvements: interviewFeedbackHistories.improvements,
          completedAt: interviewFeedbackHistories.createdAt,
        })
        .from(interviewFeedbackHistories)
        .leftJoin(companies, eq(companies.id, interviewFeedbackHistories.companyId))
        .leftJoin(
          interviewConversations,
          eq(interviewConversations.id, interviewFeedbackHistories.conversationId),
        )
        .where(eq(interviewFeedbackHistories.userId, identity.userId!))
        .orderBy(desc(interviewFeedbackHistories.createdAt))
        .limit(FETCH_LIMIT),
    );

    const normalized: InterviewHistoryRow[] = rows.map((row) => ({
      companyId: row.companyId,
      companyName: row.companyName ?? null,
      interviewFormat: row.interviewFormat ?? null,
      scores: row.scores,
      improvements: row.improvements,
      completedAt: row.completedAt,
    }));

    const payload = buildInterviewDashboardPayload(normalized);

    return timing.apply(NextResponse.json(payload));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "INTERVIEW_DASHBOARD_FETCH_FAILED",
      userMessage: "成長ダッシュボードを読み込めませんでした。",
      action: "しばらくしてから、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Failed to fetch interview dashboard payload",
      logContext: "interview-dashboard-fetch",
    });
  }
}

