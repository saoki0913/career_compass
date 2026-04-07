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
import { eq, desc, isNull, asc, count, inArray, getTableColumns } from "drizzle-orm";
import { PLAN_METADATA, type PlanTypeWithGuest } from "@/lib/stripe/config";
import {
  getGakuchikaSummaryKind,
  getGakuchikaSummaryPreview,
} from "@/lib/gakuchika/summary";
import { safeParseConversationState } from "@/app/api/gakuchika/shared";

export type GakuchikaListConversationStatus = "in_progress" | "completed" | null;

/** DB 由来の生値を一覧 API 用に正規化。質問済みなのに status が取れない行は in_progress に寄せる。 */
export function normalizeGakuchikaListConversationStatus(
  raw: unknown,
  questionCount: number,
): GakuchikaListConversationStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "in_progress" || s === "completed") {
    return s;
  }
  if (questionCount > 0) {
    return "in_progress";
  }
  return null;
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

    const gakuchikaContentColumns = getTableColumns(gakuchikaContents);
    const contents = await db
      .select(gakuchikaContentColumns)
      .from(gakuchikaContents)
      .where(
        userId
          ? eq(gakuchikaContents.userId, userId)
          : guestId
          ? eq(gakuchikaContents.guestId, guestId)
          : isNull(gakuchikaContents.id)
      )
      .orderBy(asc(gakuchikaContents.sortOrder), desc(gakuchikaContents.updatedAt));

    const contentIds = contents.map((row) => row.id);
    const latestConvByGakuchikaId = new Map<
      string,
      { status: string | null; starScores: string | null; questionCount: number; updatedAt: Date }
    >();

    if (contentIds.length > 0) {
      const convRows = await db
        .select({
          gakuchikaId: gakuchikaConversations.gakuchikaId,
          status: gakuchikaConversations.status,
          starScores: gakuchikaConversations.starScores,
          questionCount: gakuchikaConversations.questionCount,
          updatedAt: gakuchikaConversations.updatedAt,
        })
        .from(gakuchikaConversations)
        .where(inArray(gakuchikaConversations.gakuchikaId, contentIds));

      for (const row of convRows) {
        const prev = latestConvByGakuchikaId.get(row.gakuchikaId);
        if (!prev || row.updatedAt > prev.updatedAt) {
          latestConvByGakuchikaId.set(row.gakuchikaId, {
            status: row.status,
            starScores: row.starScores,
            questionCount: row.questionCount,
            updatedAt: row.updatedAt,
          });
        }
      }
    }

    const gakuchikasWithConversation = contents.map((gakuchika) => {
      const latest = latestConvByGakuchikaId.get(gakuchika.id);
      const rawStatus = latest?.status ?? null;
      const qCount = Number(latest?.questionCount ?? 0);
      const conversationStatus = normalizeGakuchikaListConversationStatus(rawStatus, qCount);

      return {
        ...gakuchika,
        conversationStatus,
        conversationState: safeParseConversationState(
          latest?.starScores ?? null,
          conversationStatus,
        ),
        questionCount: qCount,
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
