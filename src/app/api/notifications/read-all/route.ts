/**
 * Mark All Notifications as Read API
 *
 * POST: Mark all notifications as read
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

export async function POST(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    await db
      .update(notifications)
      .set({ isRead: true })
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
