/**
 * Submission Item Detail API
 *
 * PUT: Update submission item
 * DELETE: Delete submission item
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submissionItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { logError } from "@/lib/logger";
import { parseBody, submissionUpdateSchema } from "@/lib/validation";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログインまたはゲストセッションが必要です。",
        action: "ログインし直して、もう一度お試しください。",
      });
    }

    const { userId, guestId } = identity;

    const [item] = await db
      .select()
      .from(submissionItems)
      .where(eq(submissionItems.id, submissionId))
      .limit(1);

    if (!item) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "SUBMISSION_NOT_FOUND",
        userMessage: "対象の提出物が見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
      });
    }

    // Verify ownership
    const isOwner =
      (userId && item.userId === userId) ||
      (guestId && item.guestId === guestId);

    if (!isOwner) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "SUBMISSION_ACCESS_DENIED",
        userMessage: "この提出物を更新する権限がありません。",
        action: "対象データを見直して、もう一度お試しください。",
      });
    }

    const parsed = await parseBody(request, submissionUpdateSchema, {
      request,
      code: "INVALID_SUBMISSION_UPDATE",
      logContext: "update-submission:validation",
    });
    if (parsed.error) return parsed.error;

    const { type, name, isRequired, status, notes, fileUrl } = parsed.data;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (type !== undefined) {
      updateData.type = type;
    }

    if (name !== undefined) updateData.name = name.trim();
    if (isRequired !== undefined) updateData.isRequired = isRequired;
    if (status !== undefined) {
      updateData.status = status;
    }
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (fileUrl !== undefined) updateData.fileUrl = fileUrl || null;

    const updated = await db
      .update(submissionItems)
      .set(updateData)
      .where(eq(submissionItems.id, submissionId))
      .returning();

    return NextResponse.json({ submission: updated[0] });
  } catch (error) {
    logError("update-submission", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "UPDATE_SUBMISSION_FAILED",
      userMessage: "提出物の更新に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      error,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログインまたはゲストセッションが必要です。",
        action: "ログインし直して、もう一度お試しください。",
      });
    }

    const { userId, guestId } = identity;

    const [item] = await db
      .select()
      .from(submissionItems)
      .where(eq(submissionItems.id, submissionId))
      .limit(1);

    if (!item) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "SUBMISSION_NOT_FOUND",
        userMessage: "対象の提出物が見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
      });
    }

    // Verify ownership
    const isOwner =
      (userId && item.userId === userId) ||
      (guestId && item.guestId === guestId);

    if (!isOwner) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "SUBMISSION_ACCESS_DENIED",
        userMessage: "この提出物を削除する権限がありません。",
        action: "対象データを見直して、もう一度お試しください。",
      });
    }

    // 履歴書・ESは削除不可（SPEC.md 18.2）
    const protectedTypes = ["resume", "es"];
    if (protectedTypes.includes(item.type)) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "SUBMISSION_PROTECTED",
        userMessage: "履歴書・ESは削除できません。",
        action: "内容を残したまま管理してください。",
      });
    }

    await db.delete(submissionItems).where(eq(submissionItems.id, submissionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("delete-submission", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "DELETE_SUBMISSION_FAILED",
      userMessage: "提出物の削除に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      error,
    });
  }
}
