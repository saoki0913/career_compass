/**
 * Gakuchika Summaries API
 *
 * GET: Returns list of completed gakuchika summaries for ES editor context
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import { isInterviewReady, safeParseConversationState } from "@/bff/gakuchika";
import { loadLatestGakuchikaConversationsForOwnedContentIds } from "@/bff/gakuchika/latest-conversations";

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

    const latestConversationByContentId = new Map(
      (await loadLatestGakuchikaConversationsForOwnedContentIds(contents.map((content) => content.id))).map((row) => [
        row.gakuchikaId,
        row,
      ]),
    );
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
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_SUMMARIES_FETCH_FAILED",
      userMessage: "ガクチカの要約を読み込めませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "gakuchika-summaries:list",
      extra: {
        feature: "gakuchika_summaries",
      },
    });
  }
}
