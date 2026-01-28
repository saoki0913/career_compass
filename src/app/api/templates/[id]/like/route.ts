/**
 * Template Like API
 *
 * POST: Like a template
 * DELETE: Unlike a template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { esTemplates, templateLikes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

    // Check if already liked
    const existingLike = await db
      .select()
      .from(templateLikes)
      .where(
        and(
          eq(templateLikes.templateId, templateId),
          eq(templateLikes.userId, userId)
        )
      )
      .get();

    if (existingLike) {
      return NextResponse.json({ success: true, liked: true });
    }

    // Create like
    await db.insert(templateLikes).values({
      id: crypto.randomUUID(),
      templateId,
      userId,
      createdAt: new Date(),
    });

    // Increment like count
    await db
      .update(esTemplates)
      .set({
        likeCount: (template.likeCount || 0) + 1,
      })
      .where(eq(esTemplates.id, templateId));

    return NextResponse.json({ success: true, liked: true });
  } catch (error) {
    console.error("Error liking template:", error);
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

    // Check template exists
    const template = await db
      .select()
      .from(esTemplates)
      .where(eq(esTemplates.id, templateId))
      .get();

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Delete like
    const result = await db
      .delete(templateLikes)
      .where(
        and(
          eq(templateLikes.templateId, templateId),
          eq(templateLikes.userId, userId)
        )
      );

    // Decrement like count
    if (template.likeCount && template.likeCount > 0) {
      await db
        .update(esTemplates)
        .set({
          likeCount: template.likeCount - 1,
        })
        .where(eq(esTemplates.id, templateId));
    }

    return NextResponse.json({ success: true, liked: false });
  } catch (error) {
    console.error("Error unliking template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
