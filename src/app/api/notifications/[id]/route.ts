/**
 * DELETE: Remove one notification (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import {
  buildOwnedRowCondition,
  createOwnedResourceNotFoundResponse,
  requireRequestIdentity,
} from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/logger";

function notificationNotFoundResponse(request: NextRequest) {
  return createOwnedResourceNotFoundResponse(request, {
    code: "NOTIFICATION_NOT_FOUND",
    userMessage: "通知が見つかりませんでした。",
    action: "通知一覧を再読み込みしてください。",
    logContext: "notification-delete-not-found",
    developerMessage: "Notification not found",
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "NOTIFICATION_DELETE",
      logContext: "notification-delete-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }
    const identity = identityResult.identity;

    const { id } = await params;
    const condition = buildOwnedRowCondition(eq(notifications.id, id), notifications, identity);
    if (!condition) {
      return notificationNotFoundResponse(request);
    }

    const deleted = await db
      .delete(notifications)
      .where(condition)
      .returning({ id: notifications.id });

    if (deleted.length === 0) {
      return notificationNotFoundResponse(request);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("notification-delete", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "NOTIFICATION_DELETE_FAILED",
      userMessage: "通知を削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "notification-delete",
    });
  }
}
