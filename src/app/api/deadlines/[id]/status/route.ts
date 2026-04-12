/**
 * Deadline Status Override API
 *
 * PUT: Manually set or clear the status override for a deadline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { db } from "@/lib/db";
import { deadlines, companies, tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const VALID_STATUSES = ["not_started", "in_progress", "completed"] as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const timing = createServerTimingRecorder();
  try {
    const { id: deadlineId } = await params;
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINE_STATUS_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        retryable: true,
        logContext: "deadline-status-auth",
      });
    }

    const body = await request.json();
    const { status } = body as { status: string | null };

    // Validate status
    if (status !== null && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DEADLINE_STATUS_INVALID",
        userMessage: "無効なステータスです。",
        logContext: "deadline-status-invalid",
      });
    }

    // Verify ownership
    const [deadline] = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.id, deadlineId))
      .limit(1);

    if (!deadline) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-status-not-found",
      });
    }

    const ownerCondition = identity.userId
      ? eq(companies.userId, identity.userId)
      : eq(companies.guestId, identity.guestId!);

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, deadline.companyId), ownerCondition))
      .limit(1);

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-status-not-found-owner",
      });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      statusOverride: status,
      updatedAt: now,
    };

    // If setting to "completed", also set completedAt and auto-complete tasks
    if (status === "completed" && !deadline.completedAt) {
      updateData.completedAt = now;

      await db
        .update(tasks)
        .set({ status: "done", completedAt: now, updatedAt: now })
        .where(and(eq(tasks.deadlineId, deadlineId), eq(tasks.status, "open")));
    }

    // If clearing completed status, also clear completedAt
    if (status !== "completed" && deadline.completedAt && deadline.statusOverride === "completed") {
      updateData.completedAt = null;
    }

    await db
      .update(deadlines)
      .set(updateData)
      .where(eq(deadlines.id, deadlineId));

    return timing.apply(NextResponse.json({ success: true, status }));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DEADLINE_STATUS_UPDATE_FAILED",
      userMessage: "ステータスの更新に失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "deadline-status-update",
    });
  }
}
