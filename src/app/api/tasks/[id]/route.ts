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
import { eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

async function verifyTaskAccess(
  taskId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; task?: typeof tasks.$inferSelect }> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    return { valid: false };
  }

  if (userId && task.userId === userId) {
    return { valid: true, task };
  }
  if (guestId && task.guestId === guestId) {
    return { valid: true, task };
  }

  return { valid: false };
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

    const updated = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

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

    await db.delete(tasks).where(eq(tasks.id, taskId));

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
