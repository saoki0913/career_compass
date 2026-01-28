/**
 * ES Templates Rankings API
 *
 * GET: Get ranked templates by period (weekly/monthly/yearly)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { esTemplates, templateLikes, templateFavorites } from "@/lib/db/schema";
import { desc, gte, eq, and, sql, or } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    const userId = session?.user?.id || null;

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "weekly"; // weekly, monthly, yearly
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    // Calculate time range based on period
    const now = new Date();
    let since: Date;

    switch (period) {
      case "weekly":
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "monthly":
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "yearly":
        since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get ranked templates - must be public, not expired, and shared within the period
    const ranked = await db
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
          // Filter out expired shares
          or(
            sql`${esTemplates.shareExpiresAt} IS NULL`,
            sql`${esTemplates.shareExpiresAt} > ${now.getTime()}`
          ),
          // Filter by shared date within the period
          gte(esTemplates.sharedAt, since)
        )
      )
      .orderBy(desc(esTemplates.likeCount))
      .limit(limit);

    // If user is logged in, check their likes and favorites
    let userLikes: string[] = [];
    let userFavorites: string[] = [];

    if (userId && ranked.length > 0) {
      const templateIds = ranked.map((t) => t.id);

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

    // Parse questions and add user-specific data
    const templatesWithMeta = ranked.map((t, index) => ({
      ...t,
      rank: index + 1,
      questions: JSON.parse(t.questions),
      tags: t.tags ? JSON.parse(t.tags) : [],
      isLiked: userLikes.includes(t.id),
      isFavorited: userFavorites.includes(t.id),
    }));

    return NextResponse.json({
      rankings: templatesWithMeta,
      period,
      since: since.toISOString(),
      total: templatesWithMeta.length,
    });
  } catch (error) {
    console.error("Error fetching rankings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
