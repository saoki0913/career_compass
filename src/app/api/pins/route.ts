/**
 * Pins API - Generic favorites/pin management
 *
 * GET: List pinned entity IDs for a given entity type
 * POST: Pin an entity (upsert)
 * DELETE: Unpin an entity
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userPins } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

const VALID_ENTITY_TYPES = ["document", "gakuchika"] as const;
type EntityType = typeof VALID_ENTITY_TYPES[number];

function isValidEntityType(type: string): type is EntityType {
  return VALID_ENTITY_TYPES.includes(type as EntityType);
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");

    if (!entityType || !isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: "Invalid entityType. Must be one of: " + VALID_ENTITY_TYPES.join(", ") },
        { status: 400 }
      );
    }

    const conditions = [eq(userPins.entityType, entityType)];

    if (userId) {
      conditions.push(eq(userPins.userId, userId));
    } else if (guestId) {
      conditions.push(eq(userPins.guestId, guestId));
    }

    const pins = await db
      .select({ entityId: userPins.entityId })
      .from(userPins)
      .where(and(...conditions));

    return NextResponse.json({
      pinnedIds: pins.map((p) => p.entityId),
    });
  } catch (error) {
    console.error("Error fetching pins:", error);
    return NextResponse.json(
      { error: "Failed to fetch pins" },
      { status: 500 }
    );
  }
}

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
    const body = await request.json();
    const { entityType, entityId } = body;

    if (!entityType || !isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: "Invalid entityType" },
        { status: 400 }
      );
    }

    if (!entityId || typeof entityId !== "string") {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 }
      );
    }

    // Upsert: insert or do nothing if already exists
    await db
      .insert(userPins)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        entityType,
        entityId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error creating pin:", error);
    return NextResponse.json(
      { error: "Failed to create pin" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
    const { entityType, entityId } = body;

    if (!entityType || !isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: "Invalid entityType" },
        { status: 400 }
      );
    }

    if (!entityId || typeof entityId !== "string") {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 }
      );
    }

    const conditions = [
      eq(userPins.entityType, entityType),
      eq(userPins.entityId, entityId),
    ];

    if (userId) {
      conditions.push(eq(userPins.userId, userId));
    } else if (guestId) {
      conditions.push(eq(userPins.guestId, guestId));
    }

    await db.delete(userPins).where(and(...conditions));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pin:", error);
    return NextResponse.json(
      { error: "Failed to delete pin" },
      { status: 500 }
    );
  }
}
