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
  getGakuchikaNextAction,
  getIdentity,
  getQuestionFromFastAPI,
  safeParseConversationState,
  serializeConversationState,
  verifyGakuchikaAccess,
  type Message,
} from "@/app/api/gakuchika";
import {
  getRequestId,
  logAiCreditCostSummary,
} from "@/lib/ai/cost-summary-log";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";

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

    const limitResponse = await guardDailyTokenLimit(identity);
    if (limitResponse) return limitResponse;

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
      conversationState,
      nextAction,
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
      identity,
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

    const initialState = conversationState ?? safeParseConversationState(null, "in_progress");

    // Create new conversation record with first question
    const conversationId = crypto.randomUUID();
    const now = new Date();
    const initialMessages: Message[] = [{
      id: crypto.randomUUID(),
      role: "assistant",
      content: initialQuestion!
    }];

    await db.insert(gakuchikaConversations).values({
      id: conversationId,
      gakuchikaId,
      messages: initialMessages,
      questionCount: 0,
      status: "in_progress",
      starScores: serializeConversationState(initialState),
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
      conversationState: safeParseConversationState(c.starScores, c.status),
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
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));

    return NextResponse.json({
      conversation: { id: conversationId, questionCount: 0, status: "in_progress" },
      messages: initialMessages,
      nextQuestion: null,
      questionCount: 0,
      isCompleted: false,
      conversationState: initialState,
      nextAction: nextAction ?? getGakuchikaNextAction(initialState),
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
