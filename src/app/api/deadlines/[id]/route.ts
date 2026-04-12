/**
 * Deadline API
 *
 * GET: Get a single deadline
 * PUT: Update a deadline
 * DELETE: Delete a deadline
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { createServerTimingRecorder } from "@/app/api/_shared/server-timing";
import { db } from "@/lib/db";
import { deadlines, companies, tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { enqueueDeadlineDelete, enqueueDeadlineSync } from "@/lib/calendar/sync";
import { generateTasksForDeadline } from "@/lib/server/task-generation";

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
  const [deadline] = await db
    .select()
    .from(deadlines)
    .where(eq(deadlines.id, deadlineId))
    .limit(1);

  if (!deadline) return null;

  const ownerCondition = identity.userId
    ? eq(companies.userId, identity.userId)
    : identity.guestId
      ? eq(companies.guestId, identity.guestId)
      : null;

  if (!ownerCondition) return null;

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, deadline.companyId), ownerCondition))
    .limit(1);

  return company ? deadline : null;
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
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

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

    // Handle submission-linked task completion
    let autoCompletedTaskIds: string[] = [];

    // If marking as completed (completedAt is being set)
    if (completedAt && !currentDeadline.completedAt) {
      const openTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.deadlineId, deadlineId),
            eq(tasks.status, "open"),
          ),
        );

      if (openTasks.length > 0) {
        const taskIds = openTasks.map((t) => t.id);
        await db
          .update(tasks)
          .set({ status: "done", completedAt: now, updatedAt: now })
          .where(and(eq(tasks.deadlineId, deadlineId), eq(tasks.status, "open")));

        autoCompletedTaskIds = taskIds;
      }
    }
    // If unmarking as completed (completedAt is being unset)
    else if (completedAt === null && currentDeadline.completedAt) {
      const storedTaskIds: string[] = currentDeadline.autoCompletedTaskIds
        ? JSON.parse(currentDeadline.autoCompletedTaskIds)
        : [];

      if (storedTaskIds.length > 0) {
        await db
          .update(tasks)
          .set({ status: "open", completedAt: null, updatedAt: now })
          .where(and(eq(tasks.deadlineId, deadlineId), eq(tasks.status, "done")));
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = { updatedAt: now };

    if (body.type) updateData.type = body.type;
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.memo !== undefined) updateData.memo = body.memo?.trim() || null;
    if (dueDate) updateData.dueDate = dueDate;
    if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.isConfirmed !== undefined) updateData.isConfirmed = body.isConfirmed;

    // Auto-create tasks from templates when deadline is approved (isConfirmed: false → true)
    if (body.isConfirmed === true && !currentDeadline.isConfirmed) {
      await generateTasksForDeadline({
        deadlineId,
        deadlineType: currentDeadline.type,
        deadlineDueDate: dueDate ?? currentDeadline.dueDate,
        companyId: currentDeadline.companyId,
        applicationId: currentDeadline.applicationId,
        userId: identity.userId,
        guestId: identity.guestId,
      });
    }

    if (completedAt !== undefined) {
      updateData.completedAt = completedAt;
      if (completedAt) {
        updateData.autoCompletedTaskIds = JSON.stringify(autoCompletedTaskIds);
      } else {
        updateData.autoCompletedTaskIds = null;
      }
    }

    const updated = await db
      .update(deadlines)
      .set(updateData)
      .where(eq(deadlines.id, deadlineId))
      .returning();

    const d = updated[0];

    // Enqueue calendar sync for authenticated users
    if (identity.userId) {
      await enqueueDeadlineSync(identity.userId, deadlineId);
    }

    return timing.apply(
      NextResponse.json({
        success: true,
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
    const identity = await timing.measure("identity", () => getRequestIdentity(request));

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

    if (identity.userId) {
      await enqueueDeadlineDelete(identity.userId, deadlineId);
    }

    await db.delete(deadlines).where(eq(deadlines.id, deadlineId));

    return timing.apply(
      NextResponse.json({ success: true, message: "Deadline deleted" }),
    );
  } catch (error) {
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
