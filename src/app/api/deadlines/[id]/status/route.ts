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
import { deadlines, tasks } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { buildOwnedDeadlineCondition, buildOwnerCondition } from "@/bff/identity/owner-access";
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

    const deadlineCondition = buildOwnedDeadlineCondition(deadlineId, identity);
    if (!deadlineCondition) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-status-not-found-owner",
      });
    }

    const now = new Date();
    const taskOwnerCondition = buildOwnerCondition(tasks, identity);

    const updatedDeadline = await db.transaction(async (tx) => {
      const [deadline] = await tx
        .select()
        .from(deadlines)
        .where(deadlineCondition)
        .limit(1)
        .for("update");

      if (!deadline) return null;

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
      if (statusTransition.taskAction.type === "complete-open-tasks" && taskOwnerCondition) {
        const completedTasks = await tx
          .update(tasks)
          .set({ status: "done", completedAt: now, updatedAt: now })
          .where(and(eq(tasks.deadlineId, deadlineId), eq(tasks.status, "open"), taskOwnerCondition))
          .returning({ id: tasks.id });

        autoCompletedTaskIds = completedTasks.map((task) => task.id);
      }

      if (statusTransition.taskAction.type === "reopen-auto-completed-tasks" && taskOwnerCondition) {
        await tx
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

      const [updated] = await tx
        .update(deadlines)
        .set(updateData)
        .where(deadlineCondition)
        .returning({ id: deadlines.id });

      return updated ?? null;
    });

    if (!updatedDeadline) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-status-not-found-owner",
      });
    }

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
