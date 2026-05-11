/**
 * Mark Notification as Read API
 *
 * POST: Mark a notification as read
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
    logContext: "notification-read-not-found",
    developerMessage: "Notification not found",
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await params;

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "NOTIFICATION_READ",
      logContext: "notification-read-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }
    const identity = identityResult.identity;

    const condition = buildOwnedRowCondition(eq(notifications.id, notificationId), notifications, identity);
    if (!condition) {
      return notificationNotFoundResponse(request);
    }

    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(condition)
      .returning({ id: notifications.id });

    if (!updated[0]) {
      return notificationNotFoundResponse(request);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("notification-read", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "NOTIFICATION_READ_FAILED",
      userMessage: "通知を既読にできませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "notification-read",
    });
  }
}
