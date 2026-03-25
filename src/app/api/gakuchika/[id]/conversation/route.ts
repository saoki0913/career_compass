/**
 * Gakuchika Conversation API
 *
 * GET: Get conversation history
 * POST: Send answer and get next question
 *
 * Updated: STAR法ベースの動的終了判断
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { persistGakuchikaSummary } from "@/app/api/gakuchika/summary-server";
import {
  QUESTIONS_PER_CREDIT,
  CREDITS_PER_QUESTION_BATCH,
  getIdentity,
  getQuestionFromFastAPI,
  getWeakestElement,
  isStarComplete,
  safeParseMessages,
  safeParseStarScores,
  verifyGakuchikaAccess,
  type Message,
  type STARScores,
} from "@/app/api/gakuchika/shared";
import {
  getRequestId,
  logAiCreditCostSummary,
} from "@/lib/ai/cost-summary-log";

export async function GET(
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

    // Get sessionId from query parameter
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    // Get all conversations (sessions) for this gakuchika
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

    // Build sessions list
    const sessions = allConversations.map(c => ({
      id: c.id,
      status: c.status,
      starScores: safeParseStarScores(c.starScores),
      questionCount: c.questionCount || 0,
      createdAt: c.createdAt,
    }));

    // Get target conversation (by sessionId or latest)
    let conversation;
    if (sessionId) {
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .limit(1))[0];

      // Verify this session belongs to this gakuchika
      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
    } else {
      // Get latest conversation
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1))[0];
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

    if (!conversation) {
      // No conversation exists yet - return info for "start deep dive" screen
      // Conversation creation is handled by POST /api/gakuchika/[id]/conversation/new
      return NextResponse.json({
        noConversation: true,
        gakuchikaTitle: gakuchika.title,
        gakuchikaContent: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
        sessions: [],
      });
    }

    const messages: Message[] = safeParseMessages(conversation.messages);
    const qCount = conversation.questionCount || 0;
    const currentStarScores = safeParseStarScores(conversation.starScores);
    const starComplete = isStarComplete(currentStarScores);
    const targetElement = getWeakestElement(currentStarScores);

    // For existing conversations, use last assistant message as nextQuestion (avoid LLM call on GET)
    let nextQuestion: string | null = null;

    if (conversation.status !== "completed" && !starComplete) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        nextQuestion = lastMsg.content;
      }
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount: qCount,
        status: conversation.status,
      },
      messages,
      nextQuestion,
      questionCount: qCount,
      isCompleted: conversation.status === "completed" || starComplete,
      starScores: currentStarScores,
      targetElement,
      isAIPowered: true,
      gakuchikaContent: gakuchika.content,
      charLimitType: gakuchika.charLimitType,
      sessions,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const { userId, guestId } = identity;

    if (!userId) {
      return NextResponse.json(
        { error: "ガクチカのAI深掘りはログインが必要です" },
        { status: 401 },
      );
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CONVERSATION_RATE_LAYERS],
      userId,
      guestId,
      "gakuchika_conversation"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const hasAccess = await verifyGakuchikaAccess(gakuchikaId, userId, guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Gakuchika not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { answer, sessionId } = body;

    if (!answer || !answer.trim()) {
      return NextResponse.json(
        { error: "回答を入力してください" },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversation;
    if (sessionId) {
      // Target specific session
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .limit(1))[0];

      // Verify this session belongs to this gakuchika
      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      // Check if session is already completed
      if (conversation.status === "completed") {
        return NextResponse.json(
          { error: "このセッションは完了しています。新しいセッションを開始してください。" },
          { status: 409 }
        );
      }
    } else {
      // Get latest conversation
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1))[0];

      // If latest conversation is completed and no sessionId provided, return 409
      if (conversation && conversation.status === "completed") {
        return NextResponse.json(
          { error: "最新のセッションは完了しています。新しいセッションを開始してください。" },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    let messages: Message[] = [];
    let questionCount = 0;
    let currentStarScores: STARScores | null = null;

    if (conversation) {
      messages = JSON.parse(conversation.messages);
      questionCount = conversation.questionCount || 0;
      currentStarScores = safeParseStarScores(conversation.starScores);
    }

    // Get gakuchika data for context
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

    const gakuchikaTitle = gakuchika.title;

    // Get the current AI question that the user is answering
    let currentQuestion: string;
    const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();

    if (lastAssistantMessage) {
      currentQuestion = lastAssistantMessage.content;
    } else {
      currentQuestion = `「${gakuchikaTitle}」について、具体的にどのようなことに取り組みましたか？`;
    }

    // Add the question (if not already added) and user's answer
    if (!lastAssistantMessage || messages[messages.length - 1].role !== "assistant") {
      messages.push({ id: crypto.randomUUID(), role: "assistant", content: currentQuestion });
    }
    messages.push({ id: crypto.randomUUID(), role: "user", content: answer.trim() });
    questionCount++;

    // Credit check (every QUESTIONS_PER_CREDIT questions for logged-in users)
    // Only check availability here; consume after FastAPI success
    const shouldConsumeCredit = questionCount > 0 && questionCount % QUESTIONS_PER_CREDIT === 0 && !!userId;
    if (shouldConsumeCredit) {
      const canPay = await hasEnoughCredits(userId!, CREDITS_PER_QUESTION_BATCH);
      if (!canPay) {
        return NextResponse.json(
          { error: "クレジットが不足しています" },
          { status: 402 }
        );
      }
    }

    // Get next question with STAR evaluation
    const {
      question: nextQuestion,
      error: nextQuestionError,
      starEvaluation,
      targetElement,
      telemetry,
    } = await getQuestionFromFastAPI(
      {
        title: gakuchikaTitle,
        content: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
      },
      messages,
      questionCount,
      currentStarScores,
      requestId,
    );

    if (nextQuestionError) {
      logAiCreditCostSummary({
        feature: "gakuchika",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return NextResponse.json(
        { error: nextQuestionError },
        { status: 503 }
      );
    }

    // Consume credit only after FastAPI success (business rule: charge on success only)
    if (shouldConsumeCredit && nextQuestion) {
      await consumeCredits(userId!, CREDITS_PER_QUESTION_BATCH, "gakuchika", gakuchikaId);
    }

    // Update STAR scores from evaluation
    const newStarScores = starEvaluation?.scores || currentStarScores || { situation: 0, task: 0, action: 0, result: 0 };
    const starComplete = isStarComplete(newStarScores);
    const isCompleted = starComplete || (starEvaluation?.is_complete ?? false);

    // Determine status
    const status = isCompleted ? "completed" : "in_progress";

    if (conversation) {
      await db
        .update(gakuchikaConversations)
        .set({
          messages: JSON.stringify(messages),
          questionCount,
          status,
          starScores: JSON.stringify(newStarScores),
          updatedAt: now,
        })
        .where(eq(gakuchikaConversations.id, conversation.id));
    } else {
      await db.insert(gakuchikaConversations).values({
        id: crypto.randomUUID(),
        gakuchikaId,
        messages: JSON.stringify(messages),
        questionCount,
        status,
        starScores: JSON.stringify(newStarScores),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update gakuchika summary if completed
    let structuredSummary = null;
    if (isCompleted) {
      structuredSummary = await persistGakuchikaSummary(
        gakuchikaId,
        gakuchikaTitle,
        messages
      );
    }
    logAiCreditCostSummary({
      feature: "gakuchika",
      requestId,
      status: "success",
      creditsUsed: shouldConsumeCredit ? CREDITS_PER_QUESTION_BATCH : 0,
      telemetry,
    });

    return NextResponse.json({
      messages,
      nextQuestion,
      questionCount,
      isCompleted,
      starScores: newStarScores,
      starEvaluation,
      targetElement,
      isAIPowered: true,
      gakuchikaContent: gakuchika.content,
      charLimitType: gakuchika.charLimitType,
      ...(structuredSummary && { summary: structuredSummary }),
    });
  } catch (error) {
    console.error("Error processing conversation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
