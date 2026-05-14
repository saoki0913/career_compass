/**
 * Gakuchika Summaries API
 *
 * GET: Returns list of completed gakuchika summaries for ES editor context
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import { eq, desc, isNull, sql } from "drizzle-orm";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import { logError } from "@/lib/logger";
import { isInterviewReady, safeParseConversationState } from "@/bff/gakuchika";

async function loadLatestConversationState(contentIds: string[]) {
  if (contentIds.length === 0) {
    return new Map<string, { status: string | null; starScores: unknown }>();
  }

  const rows = await db.execute(sql`
    select gakuchika_id, status, star_scores
    from (
      select
        gakuchika_id,
        status,
        star_scores,
        row_number() over (partition by gakuchika_id order by updated_at desc) as rn
      from gakuchika_conversations
      where gakuchika_id = any(${contentIds}::text[])
    ) ranked
    where rn = 1
  `);

  return new Map(
    Array.from(rows as Iterable<Record<string, unknown>>).map((row) => [
      String(row.gakuchika_id),
      {
        status: typeof row.status === "string" ? row.status : null,
        starScores: row.star_scores,
      },
    ]),
  );
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

    // Fetch gakuchika contents for this user
    const contents = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
        updatedAt: gakuchikaContents.updatedAt,
      })
      .from(gakuchikaContents)
      .where(
        userId
          ? eq(gakuchikaContents.userId, userId)
          : guestId
            ? eq(gakuchikaContents.guestId, guestId)
            : isNull(gakuchikaContents.id)
      )
      .orderBy(desc(gakuchikaContents.updatedAt));

    const latestConversationByContentId = await loadLatestConversationState(contents.map((content) => content.id));
    const summaries = contents.map((content) => {
      const latestConversation = latestConversationByContentId.get(content.id);
      const parsedSummary = parseGakuchikaSummary(content.summary);
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
    });

    // Filter to only completed ones (have at least one completed conversation)
    const completedSummaries = summaries.filter((s) => s.isCompleted);

    return NextResponse.json({
      summaries: completedSummaries,
    });
  } catch (error) {
    logError("gakuchika-summaries:consume-credits", error, {
      feature: "gakuchika_summaries",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
