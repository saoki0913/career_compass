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
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity, RequestIdentitySessionError } from "@/bff/identity/request-identity";
import { buildOwnedRowCondition, mutateOwnedRow } from "@/bff/identity/owner-access";
import { logError } from "@/lib/logger";
import { parseBody, submissionUpdateSchema } from "@/lib/validation";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;

    const identity = await getRequestIdentity(request, { sessionErrorMode: "throw" });
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログインまたはゲストセッションが必要です。",
        action: "ログインし直して、もう一度お試しください。",
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

    const updateCondition = buildOwnedRowCondition(
      eq(submissionItems.id, submissionId),
      submissionItems,
      identity,
    );
    const updated = await mutateOwnedRow(updateCondition, (condition) =>
      db
        .update(submissionItems)
        .set(updateData)
        .where(condition)
        .returning()
    );

    if (!updated) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "SUBMISSION_NOT_FOUND",
        userMessage: "対象の提出物が見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
      });
    }

    return NextResponse.json({ submission: updated });
  } catch (error) {
    if (error instanceof RequestIdentitySessionError) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "AUTH_SESSION_UNAVAILABLE",
        userMessage: "認証情報を確認できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
        logContext: "update-submission:identity",
      });
    }
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

    const identity = await getRequestIdentity(request, { sessionErrorMode: "throw" });
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログインまたはゲストセッションが必要です。",
        action: "ログインし直して、もう一度お試しください。",
      });
    }

    const deleteCondition = buildOwnedRowCondition(
      eq(submissionItems.id, submissionId),
      submissionItems,
      identity,
    );
    if (!deleteCondition) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "SUBMISSION_NOT_FOUND",
        userMessage: "対象の提出物が見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
      });
    }
    const [item] = await db
      .select()
      .from(submissionItems)
      .where(deleteCondition)
      .limit(1);

    if (!item) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "SUBMISSION_NOT_FOUND",
        userMessage: "対象の提出物が見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
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

    const deleted = await mutateOwnedRow(deleteCondition, (condition) =>
      db.delete(submissionItems).where(condition).returning({ id: submissionItems.id })
    );

    if (!deleted) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "SUBMISSION_NOT_FOUND",
        userMessage: "対象の提出物が見つかりませんでした。",
        action: "一覧を更新して、もう一度お試しください。",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestIdentitySessionError) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "AUTH_SESSION_UNAVAILABLE",
        userMessage: "認証情報を確認できませんでした。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
        logContext: "delete-submission:identity",
      });
    }
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
