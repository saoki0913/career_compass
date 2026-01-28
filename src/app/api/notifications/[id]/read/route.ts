/**
 * Mark Notification as Read API
 *
 * POST: Mark a notification as read
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

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

async function verifyNotificationAccess(
  notificationId: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const notification = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
    .get();

  if (!notification) return false;
  if (userId && notification.userId === userId) return true;
  if (guestId && notification.guestId === guestId) return true;
  return false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const hasAccess = await verifyNotificationAccess(
      notificationId,
      identity.userId,
      identity.guestId
    );
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
