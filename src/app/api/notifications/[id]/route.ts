/**
 * DELETE: Remove one notification (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await getRequestIdentity(_request);
    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const { userId, guestId } = identity;

    const ownerCond = userId
      ? eq(notifications.userId, userId)
      : guestId
        ? eq(notifications.guestId, guestId)
        : undefined;

    if (!ownerCond) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const deleted = await db
      .delete(notifications)
      .where(and(eq(notifications.id, id), ownerCond))
      .returning({ id: notifications.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "通知が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
