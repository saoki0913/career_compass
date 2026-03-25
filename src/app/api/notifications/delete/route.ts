/**
 * POST: Bulk delete notifications for the current user/guest
 * Body: { all: true } | { ids: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { userId, guestId } = identity;
    const body = await request.json().catch(() => ({}));
    const all = body.all === true;
    const ids: unknown = body.ids;

    const ownerCond = userId
      ? eq(notifications.userId, userId)
      : guestId
        ? eq(notifications.guestId, guestId)
        : undefined;

    if (!ownerCond) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (all) {
      const removed = await db.delete(notifications).where(ownerCond).returning({ id: notifications.id });
      return NextResponse.json({ success: true, deleted: removed.length });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids 配列を指定するか、all: true を指定してください" },
        { status: 400 }
      );
    }

    const idStrings = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (idStrings.length === 0) {
      return NextResponse.json({ error: "有効な id がありません" }, { status: 400 });
    }

    const removed = await db
      .delete(notifications)
      .where(and(ownerCond, inArray(notifications.id, idStrings)))
      .returning({ id: notifications.id });

    return NextResponse.json({ success: true, deleted: removed.length });
  } catch (error) {
    console.error("Error bulk-deleting notifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
