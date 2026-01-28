/**
 * Template Copy API
 *
 * POST: Copy a template to user's own templates
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { esTemplates, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Check user's plan - copy is only for paid users
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .get();

    if (!profile || profile.plan === "free") {
      return NextResponse.json(
        { error: "テンプレートのコピーは有料プランでのみご利用いただけます" },
        { status: 403 }
      );
    }

    // Check template exists and is public
    const template = await db
      .select()
      .from(esTemplates)
      .where(eq(esTemplates.id, templateId))
      .get();

    if (!template || !template.isPublic) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Create copy
    const now = new Date();
    const newTemplate = await db
      .insert(esTemplates)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId: null,
        title: template.title + " (コピー)",
        description: template.description,
        questions: template.questions,
        industry: template.industry,
        tags: template.tags,
        isPublic: false, // Copied templates are private by default
        authorDisplayName: null,
        isAnonymous: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Increment copy count
    await db
      .update(esTemplates)
      .set({
        copyCount: (template.copyCount || 0) + 1,
      })
      .where(eq(esTemplates.id, templateId));

    return NextResponse.json({
      template: {
        ...newTemplate[0],
        questions: JSON.parse(newTemplate[0].questions),
        tags: newTemplate[0].tags ? JSON.parse(newTemplate[0].tags) : [],
      },
    });
  } catch (error) {
    console.error("Error copying template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
