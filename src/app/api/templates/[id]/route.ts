/**
 * Template Detail API
 *
 * GET: Get template details
 * PUT: Update template
 * DELETE: Delete template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { esTemplates, templateLikes, templateFavorites } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
    const { id: templateId } = await params;

    const identity = await getIdentity(request);

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

    // Check access: public templates are accessible to all, private only to owner
    const isOwner =
      (identity?.userId && template.userId === identity.userId) ||
      (identity?.guestId && template.guestId === identity.guestId);

    if (!template.isPublic && !isOwner) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Increment view count for public templates
    if (template.isPublic && !isOwner) {
      await db
        .update(esTemplates)
        .set({
          viewCount: (template.viewCount || 0) + 1,
        })
        .where(eq(esTemplates.id, templateId));
    }

    // Check user's like/favorite status
    let isLiked = false;
    let isFavorited = false;

    if (identity?.userId) {
      const like = await db
        .select()
        .from(templateLikes)
        .where(
          and(
            eq(templateLikes.templateId, templateId),
            eq(templateLikes.userId, identity.userId)
          )
        )
        .get();
      isLiked = !!like;

      const favorite = await db
        .select()
        .from(templateFavorites)
        .where(
          and(
            eq(templateFavorites.templateId, templateId),
            eq(templateFavorites.userId, identity.userId)
          )
        )
        .get();
      isFavorited = !!favorite;
    }

    return NextResponse.json({
      template: {
        ...template,
        questions: JSON.parse(template.questions),
        tags: template.tags ? JSON.parse(template.tags) : [],
        isLiked,
        isFavorited,
        isOwner,
      },
    });
  } catch (error) {
    console.error("Error fetching template:", error);
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
    const { id: templateId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

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

    // Verify ownership
    const isOwner =
      (userId && template.userId === userId) ||
      (guestId && template.guestId === guestId);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, questions, industry, tags, isPublic, authorDisplayName, isAnonymous } = body;

    const now = new Date();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (questions !== undefined) updateData.questions = JSON.stringify(questions);
    if (industry !== undefined) updateData.industry = industry || null;
    if (tags !== undefined) updateData.tags = tags ? JSON.stringify(tags) : null;
    if (isPublic !== undefined) {
      updateData.isPublic = isPublic;
      // When sharing (making public), set sharedAt and shareExpiresAt (30 days from now)
      if (isPublic && !template.isPublic) {
        updateData.sharedAt = now;
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + 30);
        updateData.shareExpiresAt = expiresAt;
      }
      // When unsharing, clear the dates
      if (!isPublic && template.isPublic) {
        updateData.sharedAt = null;
        updateData.shareExpiresAt = null;
      }
    }
    if (authorDisplayName !== undefined) updateData.authorDisplayName = authorDisplayName || null;
    if (isAnonymous !== undefined) updateData.isAnonymous = isAnonymous;

    const updated = await db
      .update(esTemplates)
      .set(updateData)
      .where(eq(esTemplates.id, templateId))
      .returning();

    return NextResponse.json({
      template: {
        ...updated[0],
        questions: JSON.parse(updated[0].questions),
        tags: updated[0].tags ? JSON.parse(updated[0].tags) : [],
      },
    });
  } catch (error) {
    console.error("Error updating template:", error);
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

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

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

    // Verify ownership
    const isOwner =
      (userId && template.userId === userId) ||
      (guestId && template.guestId === guestId);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    await db.delete(esTemplates).where(eq(esTemplates.id, templateId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
