/**
 * Gakuchika Reorder API
 *
 * PATCH: Update sort order for gakuchika materials
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

export async function PATCH(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: "orderedIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Verify all IDs belong to the requesting user
    const gakuchikas = await db
      .select()
      .from(gakuchikaContents)
      .where(
        and(
          inArray(gakuchikaContents.id, orderedIds),
          userId
            ? eq(gakuchikaContents.userId, userId)
            : guestId
            ? eq(gakuchikaContents.guestId, guestId)
            : undefined
        )
      );

    if (gakuchikas.length !== orderedIds.length) {
      return NextResponse.json(
        { error: "一部のIDが見つからないか、権限がありません" },
        { status: 403 }
      );
    }

    // Update sortOrder for each ID based on index
    const now = new Date();
    await Promise.all(
      orderedIds.map((id, index) =>
        db
          .update(gakuchikaContents)
          .set({
            sortOrder: index,
            updatedAt: now,
          })
          .where(eq(gakuchikaContents.id, id))
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering gakuchikas:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
