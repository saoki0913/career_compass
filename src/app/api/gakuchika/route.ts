/**
 * Gakuchika API
 *
 * GET: List gakuchika contents
 * POST: Create a new gakuchika
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations, userProfiles } from "@/lib/db/schema";
import { eq, desc, isNull, and, or, asc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { PLAN_METADATA, type PlanTypeWithGuest } from "@/lib/stripe/config";

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

interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

function safeParseStarScores(json: string | null): STARScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      situation: parsed.situation ?? 0,
      task: parsed.task ?? 0,
      action: parsed.action ?? 0,
      result: parsed.result ?? 0,
    };
  } catch {
    return null;
  }
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

    // Get user plan
    let plan: PlanTypeWithGuest = "guest";
    if (userId) {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      plan = (profile?.plan || "free") as PlanTypeWithGuest;
    }

    // Get gakuchika contents with their latest conversation data
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
      .orderBy(asc(gakuchikaContents.sortOrder), desc(gakuchikaContents.updatedAt));

    // Get conversation data for each gakuchika
    const gakuchikasWithConversation = await Promise.all(
      contents.map(async (gakuchika) => {
        const [conversation] = await db
          .select({
            status: gakuchikaConversations.status,
            starScores: gakuchikaConversations.starScores,
            questionCount: gakuchikaConversations.questionCount,
          })
          .from(gakuchikaConversations)
          .where(eq(gakuchikaConversations.gakuchikaId, gakuchika.id))
          .orderBy(desc(gakuchikaConversations.updatedAt))
          .limit(1);

        return {
          ...gakuchika,
          conversationStatus: conversation?.status || null,
          starScores: safeParseStarScores(conversation?.starScores || null),
          questionCount: conversation?.questionCount || 0,
        };
      })
    );

    const currentCount = contents.length;
    const maxCount = PLAN_METADATA[plan].gakuchika;

    return NextResponse.json({
      gakuchikas: gakuchikasWithConversation,
      currentCount,
      maxCount,
    });
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

    // Get user plan
    let plan: PlanTypeWithGuest = "guest";
    if (userId) {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      plan = (profile?.plan || "free") as PlanTypeWithGuest;
    }

    // Check plan limits
    const maxGakuchika = PLAN_METADATA[plan].gakuchika;
    const existingCount = await db
      .select()
      .from(gakuchikaContents)
      .where(
        userId
          ? eq(gakuchikaContents.userId, userId)
          : guestId
          ? eq(gakuchikaContents.guestId, guestId)
          : isNull(gakuchikaContents.id)
      );

    if (existingCount.length >= maxGakuchika) {
      return NextResponse.json(
        { error: `ガクチカ素材の作成上限（${maxGakuchika}件）に達しています。プランをアップグレードしてください。` },
        { status: 403 }
      );
    }

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
