/**
 * Gakuchika Conversation API
 *
 * GET: Get conversation history
 * POST: Send answer and get next question
 *
 * Updated: STAR法ベースの動的終了判断
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

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

async function verifyGakuchikaAccess(
  gakuchikaId: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const gakuchika = await db
    .select()
    .from(gakuchikaContents)
    .where(eq(gakuchikaContents.id, gakuchikaId))
    .get();

  if (!gakuchika) return false;
  if (userId && gakuchika.userId === userId) return true;
  if (guestId && gakuchika.guestId === guestId) return true;
  return false;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

interface STAREvaluation {
  scores: STARScores;
  weakest_element: string;
  is_complete: boolean;
  missing_aspects?: Record<string, string[]>;
}

// Safe JSON parse for messages with backward compatibility
function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      console.error("Invalid messages format: not an array");
      return [];
    }
    return parsed
      .filter((m): m is { role: string; content: string; id?: string } =>
        m && typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
      )
      .map(m => ({
        id: m.id || crypto.randomUUID(),
        role: m.role as "user" | "assistant",
        content: m.content
      }));
  } catch (error) {
    console.error("Failed to parse messages JSON:", error);
    return [];
  }
}

// Safe JSON parse for STAR scores
function safeParseStarScores(json: string | null): STARScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      situation: parsed.situation ?? 0,
      task: parsed.task ?? 0,
      action: parsed.action ?? 0,
      result: parsed.result ?? 0,
    };
  } catch {
    return null;
  }
}

// Configuration
const STAR_COMPLETION_THRESHOLD = 70; // 各STAR要素がこの%以上で完了
const QUESTIONS_PER_CREDIT = 5; // 5問回答ごとに1クレジット消費

// FastAPI URL for AI-powered questions
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
  star_evaluation?: STAREvaluation;
  target_element?: string;
}

interface GakuchikaData {
  title: string;
  content?: string | null;
  charLimitType?: string | null;
}

async function getQuestionFromFastAPI(
  gakuchika: GakuchikaData,
  conversationHistory: Message[],
  questionCount: number,
  starScores?: STARScores | null
): Promise<{
  question: string | null;
  error: string | null;
  starEvaluation: STAREvaluation | null;
  targetElement: string | null;
}> {
  try {
    const fastApiResponse = await fetch(`${FASTAPI_URL}/api/gakuchika/next-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gakuchika_title: gakuchika.title,
        gakuchika_content: gakuchika.content || null,
        char_limit_type: gakuchika.charLimitType || null,
        conversation_history: conversationHistory,
        question_count: questionCount,
        star_scores: starScores || null,
      }),
    });

    if (fastApiResponse.ok) {
      const result: FastAPIQuestionResponse = await fastApiResponse.json();
      return {
        question: result.question,
        error: null,
        starEvaluation: result.star_evaluation || null,
        targetElement: result.target_element || null,
      };
    } else {
      console.error("FastAPI error status:", fastApiResponse.status);
      return {
        question: null,
        error: "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。",
        starEvaluation: null,
        targetElement: null,
      };
    }
  } catch (err) {
    console.error("FastAPI connection error:", err);
    return {
      question: null,
      error: "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。",
      starEvaluation: null,
      targetElement: null,
    };
  }
}

// Check if STAR is complete (all elements >= threshold)
function isStarComplete(scores: STARScores | null): boolean {
  if (!scores) return false;
  return (
    scores.situation >= STAR_COMPLETION_THRESHOLD &&
    scores.task >= STAR_COMPLETION_THRESHOLD &&
    scores.action >= STAR_COMPLETION_THRESHOLD &&
    scores.result >= STAR_COMPLETION_THRESHOLD
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
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
      conversation = await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .get();

      // Verify this session belongs to this gakuchika
      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
    } else {
      // Get latest conversation
      conversation = await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .get();
    }

    // Get gakuchika data
    const gakuchika = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .get();

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

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    // Rate limiting check
    const rateLimitKey = createRateLimitKey("conversation", userId, guestId);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.conversation);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
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
      conversation = await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .get();

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
      conversation = await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .get();

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
    const gakuchika = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .get();

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
      const canPay = await hasEnoughCredits(userId!, 1);
      if (!canPay) {
        return NextResponse.json(
          { error: "クレジットが不足しています" },
          { status: 402 }
        );
      }
    }

    // Get next question with STAR evaluation
    const { question: nextQuestion, starEvaluation, targetElement } = await getQuestionFromFastAPI(
      {
        title: gakuchikaTitle,
        content: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
      },
      messages,
      questionCount,
      currentStarScores
    );

    // Consume credit only after FastAPI success (business rule: charge on success only)
    if (shouldConsumeCredit && nextQuestion) {
      await consumeCredits(userId!, 1, "gakuchika", gakuchikaId);
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
      let summaryJson: string;

      try {
        // Call FastAPI to generate STAR-structured summary
        const summaryResponse = await fetch(`${FASTAPI_URL}/api/gakuchika/structured-summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
            gakuchika_title: gakuchikaTitle,
          }),
        });

        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          summaryJson = JSON.stringify({
            situation_text: summaryData.situation_text || "",
            task_text: summaryData.task_text || "",
            action_text: summaryData.action_text || "",
            result_text: summaryData.result_text || "",
            strengths: summaryData.strengths || [],
            learnings: summaryData.learnings || [],
            numbers: summaryData.numbers || [],
          });
        } else {
          throw new Error("FastAPI structured-summary generation failed");
        }
      } catch (error) {
        console.error("Failed to generate structured summary, using conversation fallback:", error);
        // Fallback: extract user answers directly without additional LLM call
        const userAnswers = messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n\n");
        summaryJson = JSON.stringify({
          situation_text: "",
          task_text: "",
          action_text: "",
          result_text: "",
          strengths: [],
          learnings: [],
          numbers: [],
          raw_answers: userAnswers.substring(0, 1000),
        });
      }

      await db
        .update(gakuchikaContents)
        .set({
          summary: summaryJson,
          updatedAt: now,
        })
        .where(eq(gakuchikaContents.id, gakuchikaId));

      // Parse the summary we just saved
      try {
        structuredSummary = JSON.parse(summaryJson);
      } catch {
        structuredSummary = null;
      }
    }

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
