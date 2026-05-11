/**
 * Mark All Notifications as Read API
 *
 * POST: Mark all notifications as read
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { buildOwnerCondition, requireRequestIdentity } from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "NOTIFICATIONS_READ_ALL",
      logContext: "notifications-read-all-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const ownerCondition = buildOwnerCondition(notifications, identityResult.identity);
    if (!ownerCondition) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "NOTIFICATIONS_READ_ALL_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        developerMessage: "Invalid owner identity",
        logContext: "notifications-read-all-auth",
      });
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          ownerCondition,
          eq(notifications.isRead, false)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("notifications-read-all", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "NOTIFICATIONS_READ_ALL_FAILED",
      userMessage: "通知を既読にできませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "notifications-read-all",
    });
  }
}
