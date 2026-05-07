/**
 * Deadline Status Override API
 *
 * PUT: Manually set or clear the status override for a deadline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { createServerTimingRecorder } from "@/bff/api/server-timing";
import { db } from "@/lib/db";
import { deadlines, companies, tasks } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { buildOwnerCondition } from "@/bff/identity/owner-access";
import {
  completeDeadlineStatusTransition,
  planDeadlineStatusTransition,
  type DeadlinePersistedStatus,
} from "@/lib/server/deadline-status";

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
    const statusTransition = planDeadlineStatusTransition({
      current: {
        completedAt: deadline.completedAt,
        statusOverride: deadline.statusOverride,
        autoCompletedTaskIds: deadline.autoCompletedTaskIds,
      },
      transitionedAt: now,
      requestedStatusOverride: status as DeadlinePersistedStatus | null,
    });

    let autoCompletedTaskIds: string[] = [];
    const taskOwnerCondition = buildOwnerCondition(tasks, identity);

    if (statusTransition.taskAction.type === "complete-open-tasks" && taskOwnerCondition) {
      const openTasks = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.deadlineId, deadlineId), eq(tasks.status, "open"), taskOwnerCondition));

      if (openTasks.length > 0) {
        autoCompletedTaskIds = openTasks.map((task) => task.id);
        await db
          .update(tasks)
          .set({ status: "done", completedAt: now, updatedAt: now })
          .where(and(eq(tasks.deadlineId, deadlineId), eq(tasks.status, "open"), taskOwnerCondition));
      }
    }

    if (statusTransition.taskAction.type === "reopen-auto-completed-tasks" && taskOwnerCondition) {
      await db
        .update(tasks)
        .set({ status: "open", completedAt: null, updatedAt: now })
        .where(
          and(
            eq(tasks.deadlineId, deadlineId),
            inArray(tasks.id, statusTransition.taskAction.taskIds),
            eq(tasks.status, "done"),
            taskOwnerCondition,
          ),
        );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: now,
      ...completeDeadlineStatusTransition(statusTransition, { autoCompletedTaskIds }),
    };

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
