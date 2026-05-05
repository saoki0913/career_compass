/**
 * Task Detail API
 *
 * GET: Get task details
 * PUT: Update task
 * DELETE: Delete task
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { buildOwnedRowCondition, buildOwnerCondition } from "@/bff/identity/owner-access";
import { unblockSuccessor, reblockSuccessors } from "@/lib/server/task-dependency";

async function verifyTaskAccess(
  taskId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; task?: typeof tasks.$inferSelect }> {
  const ownerCondition = buildOwnerCondition(tasks, { userId, guestId });
  if (!ownerCondition) {
    return { valid: false };
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), ownerCondition))
    .limit(1);

  if (!task) {
    return { valid: false };
  }

  return { valid: true, task };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "TASK_DETAIL_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "task-detail-auth",
      });
    }

    const access = await verifyTaskAccess(taskId, identity.userId, identity.guestId);
    if (!access.valid || !access.task) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "TASK_NOT_FOUND",
        userMessage: "タスクが見つかりませんでした。",
        action: "一覧に戻って、対象のタスクを選び直してください。",
        developerMessage: "Task not found",
        logContext: "task-detail-not-found",
      });
    }

    return NextResponse.json({ task: access.task });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "TASK_DETAIL_FETCH_FAILED",
      userMessage: "タスクを読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "task-detail-fetch",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "TASK_UPDATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "task-update-auth",
      });
    }

    const access = await verifyTaskAccess(taskId, identity.userId, identity.guestId);
    if (!access.valid) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "TASK_UPDATE_NOT_FOUND",
        userMessage: "更新対象のタスクが見つかりませんでした。",
        action: "一覧に戻って、対象のタスクを選び直してください。",
        developerMessage: "Task not found",
        logContext: "task-update-not-found",
      });
    }

    const body = await request.json();
    const { title, description, type, status, dueDate, completedAt } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (type !== undefined) {
      const validTypes = ["es", "web_test", "self_analysis", "gakuchika", "video", "other"];
      if (!validTypes.includes(type)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "TASK_TYPE_INVALID",
          userMessage: "タスク種別を確認して、もう一度お試しください。",
          action: "入力内容を確認して、もう一度お試しください。",
          developerMessage: "Invalid task type",
          logContext: "task-update-validation",
        });
      }
      updateData.type = type;
    }
    if (status !== undefined) {
      if (!["open", "done"].includes(status)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "TASK_STATUS_INVALID",
          userMessage: "タスク状態を確認して、もう一度お試しください。",
          action: "入力内容を確認して、もう一度お試しください。",
          developerMessage: "Invalid task status",
          logContext: "task-update-validation",
        });
      }
      updateData.status = status;
      // Auto-set completedAt
      if (status === "done" && !access.task?.completedAt) {
        updateData.completedAt = new Date();
      } else if (status === "open") {
        updateData.completedAt = null;
      }
    }
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (completedAt !== undefined) {
      updateData.completedAt = completedAt ? new Date(completedAt) : null;
    }

    const wasCompleted = access.task?.status === "done";
    const updateCondition = buildOwnedRowCondition(eq(tasks.id, taskId), tasks, identity);
    if (!updateCondition) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "TASK_UPDATE_NOT_FOUND",
        userMessage: "更新対象のタスクが見つかりませんでした。",
        action: "一覧に戻って、対象のタスクを選び直してください。",
        developerMessage: "Task not found",
        logContext: "task-update-not-found",
      });
    }

    const updated = await db
      .update(tasks)
      .set(updateData)
      .where(updateCondition)
      .returning();

    if (!updated[0]) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "TASK_UPDATE_NOT_FOUND",
        userMessage: "更新対象のタスクが見つかりませんでした。",
        action: "一覧に戻って、対象のタスクを選び直してください。",
        developerMessage: "Task not found during update",
        logContext: "task-update-not-found",
      });
    }

    // Handle dependency chain updates
    if (status === "done" && !wasCompleted) {
      await unblockSuccessor(taskId);
    } else if (status === "open" && wasCompleted) {
      await reblockSuccessors(taskId);
    }

    return NextResponse.json({ task: updated[0] });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "TASK_UPDATE_FAILED",
      userMessage: "タスクを更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "task-update",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "TASK_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "task-delete-auth",
      });
    }

    const access = await verifyTaskAccess(taskId, identity.userId, identity.guestId);
    if (!access.valid) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "TASK_DELETE_NOT_FOUND",
        userMessage: "削除対象のタスクが見つかりませんでした。",
        action: "一覧に戻って、対象のタスクを選び直してください。",
        developerMessage: "Task not found",
        logContext: "task-delete-not-found",
      });
    }

    const deleted = await db
      .delete(tasks)
      .where(buildOwnedRowCondition(eq(tasks.id, taskId), tasks, identity)!)
      .returning({ id: tasks.id });

    if (!deleted[0]) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "TASK_DELETE_NOT_FOUND",
        userMessage: "削除対象のタスクが見つかりませんでした。",
        action: "一覧に戻って、対象のタスクを選び直してください。",
        developerMessage: "Task not found during delete",
        logContext: "task-delete-not-found",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "TASK_DELETE_FAILED",
      userMessage: "タスクを削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "task-delete",
    });
  }
}
