/**
 * POST: Bulk delete notifications for the current user/guest
 * Body: { all: true } | { ids: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { buildOwnerCondition, requireRequestIdentity } from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, inArray } from "drizzle-orm";
import { logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "NOTIFICATIONS_BULK_DELETE",
      logContext: "notifications-bulk-delete-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const body = await request.json().catch(() => ({}));
    const all = body.all === true;
    const ids: unknown = body.ids;

    const ownerCondition = buildOwnerCondition(notifications, identityResult.identity);
    if (!ownerCondition) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "NOTIFICATIONS_BULK_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        developerMessage: "Invalid owner identity",
        logContext: "notifications-bulk-delete-auth",
      });
    }

    if (all) {
      const removed = await db.delete(notifications).where(ownerCondition).returning({ id: notifications.id });
      return NextResponse.json({ success: true, deleted: removed.length });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "NOTIFICATIONS_DELETE_IDS_REQUIRED",
        userMessage: "削除対象の通知を指定してください。",
        action: "通知を選択するか、全削除を選んでください。",
        developerMessage: "ids array or all=true is required",
        logContext: "notifications-bulk-delete-validation",
      });
    }

    const idStrings = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (idStrings.length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "NOTIFICATIONS_DELETE_VALID_IDS_REQUIRED",
        userMessage: "有効な通知 ID がありません。",
        action: "通知を選択し直してください。",
        developerMessage: "No valid notification ids",
        logContext: "notifications-bulk-delete-validation",
      });
    }

    const removed = await db
      .delete(notifications)
      .where(and(ownerCondition, inArray(notifications.id, idStrings)))
      .returning({ id: notifications.id });

    return NextResponse.json({ success: true, deleted: removed.length });
  } catch (error) {
    logError("notifications-bulk-delete", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "NOTIFICATIONS_BULK_DELETE_FAILED",
      userMessage: "通知を削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "notifications-bulk-delete",
    });
  }
}
