/**
 * Create New Gakuchika Conversation Session API
 *
 * POST: Create a new conversation session for re-execution
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getIdentity,
  getQuestionFromFastAPI,
  safeParseStarScores,
  verifyGakuchikaAccess,
  type Message,
} from "@/app/api/gakuchika/shared";
import {
  getRequestId,
  logAiCreditCostSummary,
} from "@/lib/ai/cost-summary-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;
    const requestId = getRequestId(request);

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!identity.userId) {
      return NextResponse.json(
        { error: "ガクチカのAI深掘りはログインが必要です" },
        { status: 401 },
      );
    }

    const hasAccess = await verifyGakuchikaAccess(gakuchikaId, identity.userId, identity.guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Gakuchika not found" },
        { status: 404 }
      );
    }

    // Get gakuchika data
    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);

    if (!gakuchika) {
      return NextResponse.json(
        { error: "Gakuchika not found" },
        { status: 404 }
      );
    }

    // Get AI-powered initial question
    const {
      question: initialQuestion,
      error,
      starEvaluation,
      targetElement,
      telemetry,
    } = await getQuestionFromFastAPI(
      {
        title: gakuchika.title,
        content: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
      },
      [],
      0,
      null,
      requestId,
    );

    if (error) {
      logAiCreditCostSummary({
        feature: "gakuchika_start",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return NextResponse.json(
        { error },
        { status: 503 }
      );
    }

    // Create new conversation record with first question
    const conversationId = crypto.randomUUID();
    const now = new Date();
    const initialMessages: Message[] = [{
      id: crypto.randomUUID(),
      role: "assistant",
      content: initialQuestion!
    }];

    const initialStarScores = starEvaluation?.scores || { situation: 0, task: 0, action: 0, result: 0 };

    await db.insert(gakuchikaConversations).values({
      id: conversationId,
      gakuchikaId,
      messages: JSON.stringify(initialMessages),
      questionCount: 0,
      status: "in_progress",
      starScores: JSON.stringify(initialStarScores),
      createdAt: now,
      updatedAt: now,
    });

    // Get all sessions for response
    const allConversations = await db
      .select({
        id: gakuchikaConversations.id,
        status: gakuchikaConversations.status,
        starScores: gakuchikaConversations.starScores,
        questionCount: gakuchikaConversations.questionCount,
        createdAt: gakuchikaConversations.createdAt,
      })
      .from(gakuchikaConversations)
      .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
      .orderBy(desc(gakuchikaConversations.createdAt));

    const sessions = allConversations.map(c => ({
      id: c.id,
      status: c.status,
      starScores: safeParseStarScores(c.starScores),
      questionCount: c.questionCount || 0,
      createdAt: c.createdAt,
    }));
    logAiCreditCostSummary({
      feature: "gakuchika_start",
      requestId,
      status: "success",
      creditsUsed: 0,
      telemetry,
    });

    return NextResponse.json({
      conversation: { id: conversationId, questionCount: 0, status: "in_progress" },
      messages: initialMessages,
      nextQuestion: null,
      questionCount: 0,
      isCompleted: false,
      starScores: initialStarScores,
      starEvaluation,
      targetElement,
      isAIPowered: true,
      gakuchikaContent: gakuchika.content,
      charLimitType: gakuchika.charLimitType,
      sessions,
    });
  } catch (error) {
    console.error("Error creating new conversation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
