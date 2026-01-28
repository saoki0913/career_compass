/**
 * ES Templates Gallery API
 *
 * GET: List public templates
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { esTemplates, templateLikes, templateFavorites, users } from "@/lib/db/schema";
import { eq, desc, and, sql, like, or } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const userId = session?.user?.id || null;

    const searchParams = request.nextUrl.searchParams;
    const sort = searchParams.get("sort") || "popular"; // popular, newest, likes
    const industry = searchParams.get("industry");
    const search = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build base query - filter out expired shares (30 days)
    const now = new Date();
    let templates = await db
      .select({
        id: esTemplates.id,
        userId: esTemplates.userId,
        title: esTemplates.title,
        description: esTemplates.description,
        questions: esTemplates.questions,
        industry: esTemplates.industry,
        tags: esTemplates.tags,
        likeCount: esTemplates.likeCount,
        copyCount: esTemplates.copyCount,
        viewCount: esTemplates.viewCount,
        authorDisplayName: esTemplates.authorDisplayName,
        isAnonymous: esTemplates.isAnonymous,
        sharedAt: esTemplates.sharedAt,
        shareExpiresAt: esTemplates.shareExpiresAt,
        createdAt: esTemplates.createdAt,
        updatedAt: esTemplates.updatedAt,
      })
      .from(esTemplates)
      .where(
        and(
          eq(esTemplates.isPublic, true),
          // Filter out expired shares: either no expiry set, or expiry is in the future
          or(
            sql`${esTemplates.shareExpiresAt} IS NULL`,
            sql`${esTemplates.shareExpiresAt} > ${now.getTime()}`
          ),
          industry ? eq(esTemplates.industry, industry) : undefined,
          search
            ? or(
                like(esTemplates.title, `%${search}%`),
                like(esTemplates.description, `%${search}%`)
              )
            : undefined
        )
      )
      .orderBy(
        sort === "newest"
          ? desc(esTemplates.createdAt)
          : sort === "likes"
          ? desc(esTemplates.likeCount)
          : desc(esTemplates.copyCount) // popular = most copied
      )
      .limit(limit)
      .offset(offset);

    // If user is logged in, check their likes and favorites
    let userLikes: string[] = [];
    let userFavorites: string[] = [];

    if (userId) {
      const templateIds = templates.map((t) => t.id);

      if (templateIds.length > 0) {
        const likes = await db
          .select({ templateId: templateLikes.templateId })
          .from(templateLikes)
          .where(
            and(
              eq(templateLikes.userId, userId),
              sql`${templateLikes.templateId} IN (${sql.join(templateIds.map(id => sql`${id}`), sql`, `)})`
            )
          );
        userLikes = likes.map((l) => l.templateId);

        const favorites = await db
          .select({ templateId: templateFavorites.templateId })
          .from(templateFavorites)
          .where(
            and(
              eq(templateFavorites.userId, userId),
              sql`${templateFavorites.templateId} IN (${sql.join(templateIds.map(id => sql`${id}`), sql`, `)})`
            )
          );
        userFavorites = favorites.map((f) => f.templateId);
      }
    }

    // Parse questions and add user-specific data
    const templatesWithMeta = templates.map((t) => ({
      ...t,
      questions: JSON.parse(t.questions),
      tags: t.tags ? JSON.parse(t.tags) : [],
      isLiked: userLikes.includes(t.id),
      isFavorited: userFavorites.includes(t.id),
    }));

    return NextResponse.json({
      templates: templatesWithMeta,
      pagination: {
        limit,
        offset,
        hasMore: templates.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching gallery:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
