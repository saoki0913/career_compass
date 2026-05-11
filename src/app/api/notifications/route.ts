/**
 * Notifications API
 *
 * GET: List notifications
 * POST: Create a notification (internal use)
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { buildOwnerCondition, requireRequestIdentity } from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, desc, count, type SQL } from "drizzle-orm";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "NOTIFICATIONS_LIST",
      logContext: "notifications-list-auth",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const identity = identityResult.identity;
    const ownerCondition = buildOwnerCondition(notifications, identity);
    if (!ownerCondition) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "NOTIFICATIONS_LIST_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        developerMessage: "Invalid owner identity",
        logContext: "notifications-list-auth",
      });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const conditions: SQL[] = [ownerCondition];

    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const notificationList = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    // Get unread count
    const unreadCountResult = await db
      .select({ unreadCount: count() })
      .from(notifications)
      .where(
        and(
          ownerCondition,
          eq(notifications.isRead, false)
        )
      );

    return NextResponse.json({
      notifications: notificationList,
      unreadCount: Number(unreadCountResult[0]?.unreadCount ?? 0),
    });
  } catch (error) {
    logError("notifications-list", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "NOTIFICATIONS_LIST_FAILED",
      userMessage: "通知を取得できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "notifications-list",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "NOTIFICATION_CREATE",
      logContext: "notification-create-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }

    const { userId, guestId } = identityResult.identity;
    const body = await request.json();
    const { type, title, message, data } = body;

    // Validate type
    const validTypes = ["deadline_reminder", "deadline_near", "company_fetch", "es_review", "daily_summary", "calendar_sync_failed"];
    if (!type || !validTypes.includes(type)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "NOTIFICATION_INVALID_TYPE",
        userMessage: "無効な通知タイプです。",
        action: "通知タイプを確認してください。",
        developerMessage: "Invalid notification type",
        logContext: "notification-create-invalid-type",
      });
    }

    if (!title || !title.trim()) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "NOTIFICATION_TITLE_REQUIRED",
        userMessage: "タイトルは必須です。",
        action: "タイトルを入力してください。",
        developerMessage: "Notification title is required",
        logContext: "notification-create-title-required",
      });
    }

    if (!message || !message.trim()) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "NOTIFICATION_MESSAGE_REQUIRED",
        userMessage: "メッセージは必須です。",
        action: "メッセージを入力してください。",
        developerMessage: "Notification message is required",
        logContext: "notification-create-message-required",
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    const newNotification = await db
      .insert(notifications)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        type,
        title: title.trim(),
        message: message.trim(),
        data: data || null,
        isRead: false,
        createdAt: now,
        expiresAt,
      })
      .returning();

    return NextResponse.json({ notification: newNotification[0] });
  } catch (error) {
    logError("notification-create", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "NOTIFICATION_CREATE_FAILED",
      userMessage: "通知を作成できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "notification-create",
    });
  }
}
