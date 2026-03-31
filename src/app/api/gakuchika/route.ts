/**
 * Gakuchika API
 *
 * GET: List gakuchika contents
 * POST: Create a new gakuchika
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations, userProfiles } from "@/lib/db/schema";
import { eq, desc, isNull, asc, count, sql, getTableColumns } from "drizzle-orm";
import { PLAN_METADATA, type PlanTypeWithGuest } from "@/lib/stripe/config";
import {
  getGakuchikaSummaryKind,
  getGakuchikaSummaryPreview,
} from "@/lib/gakuchika/summary";

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
    const identity = await getRequestIdentity(request);
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

    // Fetch latest conversation fields inside the contents query to avoid a second pass.
    const gakuchikaContentColumns = getTableColumns(gakuchikaContents);
    const contents = await db
      .select({
        ...gakuchikaContentColumns,
        conversationStatus: sql<string | null>`(
          SELECT ${gakuchikaConversations.status}
          FROM ${gakuchikaConversations}
          WHERE ${gakuchikaConversations.gakuchikaId} = ${gakuchikaContents.id}
          ORDER BY ${gakuchikaConversations.updatedAt} DESC
          LIMIT 1
        )`,
        conversationStarScores: sql<string | null>`(
          SELECT ${gakuchikaConversations.starScores}
          FROM ${gakuchikaConversations}
          WHERE ${gakuchikaConversations.gakuchikaId} = ${gakuchikaContents.id}
          ORDER BY ${gakuchikaConversations.updatedAt} DESC
          LIMIT 1
        )`,
        conversationQuestionCount: sql<number | null>`(
          SELECT ${gakuchikaConversations.questionCount}
          FROM ${gakuchikaConversations}
          WHERE ${gakuchikaConversations.gakuchikaId} = ${gakuchikaContents.id}
          ORDER BY ${gakuchikaConversations.updatedAt} DESC
          LIMIT 1
        )`,
      })
      .from(gakuchikaContents)
      .where(
        userId
          ? eq(gakuchikaContents.userId, userId)
          : guestId
          ? eq(gakuchikaContents.guestId, guestId)
          : isNull(gakuchikaContents.id)
      )
      .orderBy(asc(gakuchikaContents.sortOrder), desc(gakuchikaContents.updatedAt));

    const gakuchikasWithConversation = contents.map((gakuchika) => {
      return {
        ...gakuchika,
        conversationStatus: gakuchika.conversationStatus || null,
        starScores: safeParseStarScores(gakuchika.conversationStarScores || null),
        questionCount: Number(gakuchika.conversationQuestionCount ?? 0),
        summaryKind: getGakuchikaSummaryKind(gakuchika.summary),
        summaryPreview: getGakuchikaSummaryPreview(gakuchika.summary),
      };
    });

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
    const identity = await getRequestIdentity(request);
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
    const [existingCount] = await db
      .select({ count: count() })
      .from(gakuchikaContents)
      .where(
        userId
          ? eq(gakuchikaContents.userId, userId)
          : guestId
          ? eq(gakuchikaContents.guestId, guestId)
          : isNull(gakuchikaContents.id)
      );
    const existingCountValue = Number(existingCount?.count ?? 0);

    if (existingCountValue >= maxGakuchika) {
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
