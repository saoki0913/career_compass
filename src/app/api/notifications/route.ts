/**
 * Notifications API
 *
 * GET: List notifications
 * POST: Create a notification (internal use)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  deadline_reminder: "締切リマインド",
  deadline_near: "締切が近づいています",
  company_fetch: "企業情報取得",
  es_review: "ES添削完了",
  daily_summary: "デイリーサマリー",
};

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return { userId: null, guestId: guest.id };
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    // Build where clause
    const conditions = [];

    if (userId) {
      conditions.push(eq(notifications.userId, userId));
    } else if (guestId) {
      conditions.push(eq(notifications.guestId, guestId));
    }

    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const notificationList = await db
      .select()
      .from(notifications)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    // Get unread count
    const unreadCountResult = await db
      .select()
      .from(notifications)
      .where(
        and(
          userId
            ? eq(notifications.userId, userId)
            : guestId
            ? eq(notifications.guestId, guestId)
            : isNull(notifications.id),
          eq(notifications.isRead, false)
        )
      );

    return NextResponse.json({
      notifications: notificationList,
      unreadCount: unreadCountResult.length,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { type, title, message, data } = body;

    // Validate type
    const validTypes = ["deadline_reminder", "deadline_near", "company_fetch", "es_review", "daily_summary"];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: "無効な通知タイプです" },
        { status: 400 }
      );
    }

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "メッセージは必須です" },
        { status: 400 }
      );
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
        data: data ? JSON.stringify(data) : null,
        isRead: false,
        createdAt: now,
        expiresAt,
      })
      .returning();

    return NextResponse.json({ notification: newNotification[0] });
  } catch (error) {
    console.error("Error creating notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
