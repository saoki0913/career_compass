/**
 * Deadline API
 *
 * GET: Get a single deadline
 * PUT: Update a deadline
 * DELETE: Delete a deadline
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity, RequestIdentitySessionError } from "@/bff/identity/request-identity";
import { createServerTimingRecorder } from "@/bff/api/server-timing";
import { db } from "@/lib/db";
import { deadlines, tasks } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { buildOwnedDeadlineCondition, buildOwnerCondition } from "@/bff/identity/owner-access";
import {
  syncDeadlineDeleteImmediately,
  syncDeadlineImmediately,
  type ImmediateSyncResult,
} from "@/lib/calendar/sync";
import { generateTasksForDeadlineWithExecutor } from "@/lib/server/task-generation";
import {
  completeDeadlineStatusTransition,
  planDeadlineStatusTransition,
} from "@/lib/server/deadline-status";

type DeadlineType =
  | "es_submission"
  | "web_test"
  | "aptitude_test"
  | "interview_1"
  | "interview_2"
  | "interview_3"
  | "interview_final"
  | "briefing"
  | "internship"
  | "offer_response"
  | "other";

const VALID_TYPES: DeadlineType[] = [
  "es_submission",
  "web_test",
  "aptitude_test",
  "interview_1",
  "interview_2",
  "interview_3",
  "interview_final",
  "briefing",
  "internship",
  "offer_response",
  "other",
];

interface UpdateDeadlineBody {
  type?: DeadlineType;
  title?: string;
  description?: string;
  memo?: string;
  dueDate?: string;
  sourceUrl?: string;
  isConfirmed?: boolean;
  completedAt?: string | null;
}

type RouteParams = { params: Promise<{ id: string }> };

async function verifyDeadlineOwnership(
  deadlineId: string,
  identity: { userId: string | null; guestId: string | null },
) {
  const deadlineCondition = buildOwnedDeadlineCondition(deadlineId, identity);
  if (!deadlineCondition) return null;

  const [deadline] = await db
    .select()
    .from(deadlines)
    .where(deadlineCondition)
    .limit(1);

  return deadline ?? null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const timing = createServerTimingRecorder();
  try {
    const { id: deadlineId } = await params;
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        retryable: true,
        logContext: "deadline-get-auth",
      });
    }

    const deadline = await timing.measure("db", () =>
      verifyDeadlineOwnership(deadlineId, identity),
    );

    if (!deadline) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-get-not-found",
      });
    }

    return timing.apply(
      NextResponse.json({
        id: deadline.id,
        companyId: deadline.companyId,
        type: deadline.type,
        title: deadline.title,
        description: deadline.description,
        memo: deadline.memo,
        dueDate: deadline.dueDate?.toISOString(),
        isConfirmed: deadline.isConfirmed,
        confidence: deadline.confidence,
        sourceUrl: deadline.sourceUrl,
        completedAt: deadline.completedAt?.toISOString() || null,
        createdAt: deadline.createdAt?.toISOString(),
        updatedAt: deadline.updatedAt?.toISOString(),
      }),
    );
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DEADLINE_GET_FAILED",
      userMessage: "締切の取得に失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "deadline-get",
    });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const timing = createServerTimingRecorder();
  try {
    const { id: deadlineId } = await params;
    const identity = await timing.measure("identity", () =>
      getRequestIdentity(request, { sessionErrorMode: "throw" })
    );

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        retryable: true,
        logContext: "deadline-put-auth",
      });
    }

    const currentDeadline = await timing.measure("db-verify", () =>
      verifyDeadlineOwnership(deadlineId, identity),
    );

    if (!currentDeadline) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-put-not-found",
      });
    }

    const body: UpdateDeadlineBody = await request.json();

    // Validate type if provided
    if (body.type && !VALID_TYPES.includes(body.type)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DEADLINE_INVALID_TYPE",
        userMessage: "無効な締切タイプです。",
        logContext: "deadline-put-invalid-type",
      });
    }

    // Validate title if provided
    if (body.title !== undefined && !body.title.trim()) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DEADLINE_EMPTY_TITLE",
        userMessage: "タイトルを入力してください。",
        logContext: "deadline-put-empty-title",
      });
    }

    // Validate dueDate if provided
    let dueDate: Date | undefined;
    if (body.dueDate) {
      dueDate = new Date(body.dueDate);
      if (isNaN(dueDate.getTime())) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "DEADLINE_INVALID_DATE",
          userMessage: "無効な日付です。",
          logContext: "deadline-put-invalid-date",
        });
      }

      // All-day deadline rule: if time is 00:00:00, set to 12:00 JST (03:00 UTC)
      if (dueDate.getUTCHours() === 0 && dueDate.getUTCMinutes() === 0 && dueDate.getUTCSeconds() === 0) {
        dueDate.setUTCHours(3, 0, 0, 0);
      }
    }

    // Parse completedAt if provided
    let completedAt: Date | null | undefined;
    if (body.completedAt !== undefined) {
      if (body.completedAt === null) {
        completedAt = null;
      } else {
        completedAt = new Date(body.completedAt);
        if (isNaN(completedAt.getTime())) {
          return createApiErrorResponse(request, {
            status: 400,
            code: "DEADLINE_INVALID_COMPLETED_DATE",
            userMessage: "無効な完了日です。",
            logContext: "deadline-put-invalid-completed-date",
          });
        }
      }
    }

    const now = new Date();
    const deadlineCondition = buildOwnedDeadlineCondition(deadlineId, identity);
    const taskOwnerCondition = buildOwnerCondition(tasks, identity);
    if (!deadlineCondition) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-put-not-found",
      });
    }

    // Build update object
    const baseUpdateData: Record<string, unknown> = { updatedAt: now };

    if (body.type) baseUpdateData.type = body.type;
    if (body.title !== undefined) baseUpdateData.title = body.title.trim();
    if (body.description !== undefined) baseUpdateData.description = body.description?.trim() || null;
    if (body.memo !== undefined) baseUpdateData.memo = body.memo?.trim() || null;
    if (dueDate) baseUpdateData.dueDate = dueDate;
    if (body.sourceUrl !== undefined) baseUpdateData.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.isConfirmed !== undefined) baseUpdateData.isConfirmed = body.isConfirmed;

    const d = await db.transaction(async (tx) => {
      const [deadlineForUpdate] = await tx
        .select()
        .from(deadlines)
        .where(deadlineCondition)
        .limit(1)
        .for("update");

      if (!deadlineForUpdate) return null;

      const statusTransition = planDeadlineStatusTransition({
        current: {
          completedAt: deadlineForUpdate.completedAt,
          statusOverride: deadlineForUpdate.statusOverride,
          autoCompletedTaskIds: deadlineForUpdate.autoCompletedTaskIds,
        },
        transitionedAt: now,
        requestedCompletedAt: completedAt,
      });

      let autoCompletedTaskIds: string[] = [];
      if (
        statusTransition.taskAction.type === "complete-open-tasks" &&
        taskOwnerCondition
      ) {
        const completedTasks = await tx
          .update(tasks)
          .set({ status: "done", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(tasks.deadlineId, deadlineId),
              eq(tasks.status, "open"),
              taskOwnerCondition,
            ),
          )
          .returning({ id: tasks.id });
        autoCompletedTaskIds = completedTasks.map((t) => t.id);
      }

      const updateData: Record<string, unknown> = {
        ...baseUpdateData,
        ...completeDeadlineStatusTransition(statusTransition, {
          autoCompletedTaskIds,
        }),
      };

      const updated = await tx
        .update(deadlines)
        .set(updateData)
        .where(deadlineCondition)
        .returning();

      const updatedDeadline = updated[0];
      if (!updatedDeadline) return null;

      if (body.isConfirmed === true && !deadlineForUpdate.isConfirmed) {
        await generateTasksForDeadlineWithExecutor(tx, {
          deadlineId,
          deadlineType: updatedDeadline.type,
          deadlineDueDate: updatedDeadline.dueDate,
          companyId: updatedDeadline.companyId,
          applicationId: updatedDeadline.applicationId,
          userId: identity.userId,
          guestId: identity.guestId,
        });
      }

      if (
        statusTransition.taskAction.type === "reopen-auto-completed-tasks" &&
        taskOwnerCondition
      ) {
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

      return updatedDeadline;
    });
    if (!d) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-put-not-found",
      });
    }

    let calendarSync: ImmediateSyncResult | undefined;
    if (identity.userId) {
      calendarSync = await syncDeadlineImmediately(identity.userId, deadlineId);
    }

    return timing.apply(
      NextResponse.json({
        success: true,
        calendarSync,
        deadline: {
          id: d.id,
          companyId: d.companyId,
          type: d.type,
          title: d.title,
          description: d.description,
          memo: d.memo,
          dueDate: d.dueDate?.toISOString(),
          isConfirmed: d.isConfirmed,
          confidence: d.confidence,
          sourceUrl: d.sourceUrl,
          googleSyncStatus: d.googleSyncStatus,
          googleSyncError: d.googleSyncError,
          completedAt: d.completedAt?.toISOString() || null,
          createdAt: d.createdAt?.toISOString(),
          updatedAt: d.updatedAt?.toISOString(),
        },
      }),
    );
  } catch (error) {
    if (error instanceof RequestIdentitySessionError) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "AUTH_SESSION_UNAVAILABLE",
        userMessage: "認証情報を確認できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
        logContext: "deadline-put-identity",
      });
    }
    return createApiErrorResponse(request, {
      status: 500,
      code: "DEADLINE_UPDATE_FAILED",
      userMessage: "締切の更新に失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "deadline-put",
    });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const timing = createServerTimingRecorder();
  try {
    const { id: deadlineId } = await params;
    const identity = await timing.measure("identity", () =>
      getRequestIdentity(request, { sessionErrorMode: "throw" })
    );

    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        retryable: true,
        logContext: "deadline-delete-auth",
      });
    }

    const deadline = await timing.measure("db-verify", () =>
      verifyDeadlineOwnership(deadlineId, identity),
    );

    if (!deadline) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-delete-not-found",
      });
    }

    const deadlineCondition = buildOwnedDeadlineCondition(deadlineId, identity);
    if (!deadlineCondition) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-delete-not-found",
      });
    }

    let calendarSync: ImmediateSyncResult | undefined;
    if (identity.userId) {
      calendarSync = await syncDeadlineDeleteImmediately(identity.userId, deadlineId);
      if (calendarSync.status === "failed") {
        return createApiErrorResponse(request, {
          status: 503,
          code: "DEADLINE_CALENDAR_DELETE_RETRY_UNAVAILABLE",
          userMessage: "Googleカレンダー同期の再試行を登録できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
          developerMessage: calendarSync.error,
          logContext: "deadline-delete-calendar-sync",
        });
      }
    }

    const deleted = await db
      .delete(deadlines)
      .where(deadlineCondition)
      .returning({ id: deadlines.id });

    if (!deleted[0]) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DEADLINE_NOT_FOUND",
        userMessage: "締切が見つかりませんでした。",
        logContext: "deadline-delete-not-found",
      });
    }

    return timing.apply(
      NextResponse.json({ success: true, message: "Deadline deleted", calendarSync }),
    );
  } catch (error) {
    if (error instanceof RequestIdentitySessionError) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "AUTH_SESSION_UNAVAILABLE",
        userMessage: "認証情報を確認できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
        logContext: "deadline-delete-identity",
      });
    }
    return createApiErrorResponse(request, {
      status: 500,
      code: "DEADLINE_DELETE_FAILED",
      userMessage: "締切の削除に失敗しました。",
      action: "ページを再読み込みしてください。",
      retryable: true,
      error,
      logContext: "deadline-delete",
    });
  }
}
