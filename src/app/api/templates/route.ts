/**
 * ES Templates API
 *
 * GET: List user's templates
 * POST: Create a new template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { esTemplates } from "@/lib/db/schema";
import { eq, desc, or, isNull, and } from "drizzle-orm";
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

    // Get user's templates
    const templates = await db
      .select()
      .from(esTemplates)
      .where(
        userId
          ? eq(esTemplates.userId, userId)
          : guestId
          ? eq(esTemplates.guestId, guestId)
          : isNull(esTemplates.id)
      )
      .orderBy(desc(esTemplates.updatedAt));

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const { title, description, questions, industry, tags, isPublic, authorDisplayName, isAnonymous } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: "設問は1つ以上必要です" },
        { status: 400 }
      );
    }

    // Check template creation limits
    const existingTemplates = await db
      .select()
      .from(esTemplates)
      .where(
        userId
          ? eq(esTemplates.userId, userId)
          : guestId
          ? eq(esTemplates.guestId, guestId)
          : isNull(esTemplates.id)
      );

    let limit = 3; // Free default

    if (guestId) {
      limit = 1; // Guest
    } else if (userId) {
      // Get user's plan
      const { userProfiles } = await import("@/lib/db/schema");
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .get();

      const plan = profile?.plan || "free";
      if (plan === "standard") {
        limit = 10;
      } else if (plan === "pro") {
        limit = 15;
      }
    }

    if (existingTemplates.length >= limit) {
      return NextResponse.json(
        {
          error: `テンプレート作成上限に達しました（${limit}件）`,
          limit,
          current: existingTemplates.length,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const newTemplate = await db
      .insert(esTemplates)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        title: title.trim(),
        description: description?.trim() || null,
        questions: JSON.stringify(questions),
        industry: industry || null,
        tags: tags ? JSON.stringify(tags) : null,
        isPublic: isPublic || false,
        authorDisplayName: authorDisplayName || null,
        isAnonymous: isAnonymous || false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ template: newTemplate[0] });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
