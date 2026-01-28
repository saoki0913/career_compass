/**
 * Gakuchika Detail API
 *
 * GET: Get a single gakuchika
 * PUT: Update a gakuchika
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { userId, guestId } = identity;

    const gakuchika = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, id))
      .get();

    if (!gakuchika) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Check ownership
    if (
      (userId && gakuchika.userId !== userId) ||
      (guestId && gakuchika.guestId !== guestId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse linkedCompanyIds from JSON string
    const linkedCompanyIds = gakuchika.linkedCompanyIds
      ? JSON.parse(gakuchika.linkedCompanyIds)
      : [];

    return NextResponse.json({
      gakuchika: {
        ...gakuchika,
        linkedCompanyIds,
      },
    });
  } catch (error) {
    console.error("Error fetching gakuchika:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { userId, guestId } = identity;
    const body = await request.json();

    const gakuchika = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, id))
      .get();

    if (!gakuchika) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Check ownership
    if (
      (userId && gakuchika.userId !== userId) ||
      (guestId && gakuchika.guestId !== guestId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update linkedCompanyIds
    if (body.linkedCompanyIds !== undefined) {
      await db
        .update(gakuchikaContents)
        .set({
          linkedCompanyIds: JSON.stringify(body.linkedCompanyIds),
          updatedAt: new Date(),
        })
        .where(eq(gakuchikaContents.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating gakuchika:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
