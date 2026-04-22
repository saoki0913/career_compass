/**
 * POST: Bulk delete notifications for the current user/guest
 * Body: { all: true } | { ids: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

export async function POST(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
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
