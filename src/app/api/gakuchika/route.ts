/**
 * Gakuchika API
 *
 * GET: List gakuchika contents
 * POST: Create a new gakuchika
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
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

    const contents = await db
      .select()
      .from(gakuchikaContents)
      .where(
        userId
          ? eq(gakuchikaContents.userId, userId)
          : guestId
          ? eq(gakuchikaContents.guestId, guestId)
          : isNull(gakuchikaContents.id)
      )
      .orderBy(desc(gakuchikaContents.updatedAt));

    return NextResponse.json({ gakuchikas: contents });
  } catch (error) {
    console.error("Error fetching gakuchikas:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const VALID_CHAR_LIMITS = ["300", "400", "500"] as const;

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
    const { title, content, charLimitType } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "テーマは必須です" },
        { status: 400 }
      );
    }

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "ガクチカの内容は必須です" },
        { status: 400 }
      );
    }

    // Validate charLimitType
    const validCharLimitType = VALID_CHAR_LIMITS.includes(charLimitType)
      ? charLimitType
      : "400";

    // Validate content length
    const charLimit = parseInt(validCharLimitType);
    if (content.length > charLimit) {
      return NextResponse.json(
        { error: `文字数が${charLimit}文字を超えています` },
        { status: 400 }
      );
    }

    const now = new Date();
    const newGakuchika = await db
      .insert(gakuchikaContents)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        title: title.trim(),
        content: content.trim(),
        charLimitType: validCharLimitType,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ gakuchika: newGakuchika[0] });
  } catch (error) {
    console.error("Error creating gakuchika:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
