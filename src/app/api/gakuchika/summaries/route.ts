/**
 * Gakuchika Summaries API
 *
 * GET: Returns list of completed gakuchika summaries for ES editor context
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import { isInterviewReady, safeParseConversationState } from "@/app/api/gakuchika";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Fetch gakuchika contents for this user
    const contents = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
        updatedAt: gakuchikaContents.updatedAt,
      })
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.userId, userId))
      .orderBy(desc(gakuchikaContents.updatedAt));

    // Fetch latest conversation star scores for each gakuchika
    const summaries = await Promise.all(
      contents.map(async (content) => {
        // Get latest completed conversation for this gakuchika
        const [latestConversation] = await db
          .select({
            status: gakuchikaConversations.status,
            starScores: gakuchikaConversations.starScores,
          })
          .from(gakuchikaConversations)
          .where(eq(gakuchikaConversations.gakuchikaId, content.id))
          .orderBy(desc(gakuchikaConversations.updatedAt))
          .limit(1);

        // Parse summary (handle both JSON and plain text)
        const parsedSummary = parseGakuchikaSummary(content.summary);

        // Parse star scores
        const conversationState = safeParseConversationState(
          latestConversation?.starScores || null,
          latestConversation?.status || null,
        );

        return {
          id: content.id,
          title: content.title,
          summary: parsedSummary,
          conversationState,
          isCompleted: isInterviewReady(conversationState),
        };
      })
    );

    // Filter to only completed ones (have at least one completed conversation)
    const completedSummaries = summaries.filter((s) => s.isCompleted);

    return NextResponse.json({
      summaries: completedSummaries,
    });
  } catch (error) {
    console.error("Error fetching gakuchika summaries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
