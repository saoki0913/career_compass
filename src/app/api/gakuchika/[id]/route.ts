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

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, id))
      .limit(1);

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

const VALID_CHAR_LIMITS = ["300", "400", "500"] as const;

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

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, id))
      .limit(1);

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

    // Build update object with only provided fields
    const updateData: {
      title?: string;
      content?: string;
      charLimitType?: "300" | "400" | "500";
      linkedCompanyIds?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    // Validate and add title if provided
    if (body.title !== undefined) {
      if (!body.title || !body.title.trim()) {
        return NextResponse.json(
          { error: "テーマは必須です" },
          { status: 400 }
        );
      }
      updateData.title = body.title.trim();
    }

    // Validate and add content if provided
    if (body.content !== undefined) {
      if (!body.content || !body.content.trim()) {
        return NextResponse.json(
          { error: "ガクチカの内容は必須です" },
          { status: 400 }
        );
      }

      // Validate content length against charLimitType
      const charLimitType = body.charLimitType !== undefined
        ? body.charLimitType
        : gakuchika.charLimitType || "400";
      const charLimit = parseInt(charLimitType);

      if (body.content.trim().length > charLimit) {
        return NextResponse.json(
          { error: `文字数が${charLimit}文字を超えています` },
          { status: 400 }
        );
      }

      updateData.content = body.content.trim();
    }

    // Validate and add charLimitType if provided
    if (body.charLimitType !== undefined) {
      if (!VALID_CHAR_LIMITS.includes(body.charLimitType)) {
        return NextResponse.json(
          { error: "無効な文字数制限タイプです" },
          { status: 400 }
        );
      }
      updateData.charLimitType = body.charLimitType;
    }

    // Add linkedCompanyIds if provided
    if (body.linkedCompanyIds !== undefined) {
      updateData.linkedCompanyIds = JSON.stringify(body.linkedCompanyIds);
    }

    await db
      .update(gakuchikaContents)
      .set(updateData)
      .where(eq(gakuchikaContents.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating gakuchika:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, id))
      .limit(1);

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

    // Delete gakuchika (cascade will handle conversations via DB schema)
    await db
      .delete(gakuchikaContents)
      .where(eq(gakuchikaContents.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting gakuchika:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
