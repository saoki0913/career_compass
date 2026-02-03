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

    // Get latest conversation
    const conversation = await db
      .select()
      .from(gakuchikaConversations)
      .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
      .orderBy(desc(gakuchikaConversations.updatedAt))
      .get();

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
      // Get AI-powered initial question
      const { question: initialQuestion, error, starEvaluation } = await getQuestionFromFastAPI(
        {
          title: gakuchika.title,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        [],
        0,
        null
      );

      if (error) {
        return NextResponse.json(
          { error },
          { status: 503 }
        );
      }

      // Create conversation record with first question
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

      return NextResponse.json({
        conversation: { id: conversationId, questionCount: 0, status: "in_progress" },
        messages: initialMessages,
        nextQuestion: null,
        questionCount: 0,
        isCompleted: false,
        starScores: initialStarScores,
        starEvaluation,
        isAIPowered: true,
        gakuchikaContent: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
      });
    }

    const messages: Message[] = safeParseMessages(conversation.messages);
    const qCount = conversation.questionCount || 0;
    const currentStarScores = safeParseStarScores(conversation.starScores);
    const starComplete = isStarComplete(currentStarScores);

    // For existing conversations, get next question from FastAPI if not completed
    let nextQuestion: string | null = null;
    let starEvaluation: STAREvaluation | null = null;

    if (conversation.status !== "completed" && !starComplete) {
      const result = await getQuestionFromFastAPI(
        {
          title: gakuchika.title,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        messages,
        qCount,
        currentStarScores
      );

      if (result.error) {
        return NextResponse.json(
          { error: result.error },
          { status: 503 }
        );
      }

      nextQuestion = result.question;
      starEvaluation = result.starEvaluation;
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
      starEvaluation,
      isAIPowered: true,
      gakuchikaContent: gakuchika.content,
      charLimitType: gakuchika.charLimitType,
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
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.conversation);
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
    const { answer } = body;

    if (!answer || !answer.trim()) {
      return NextResponse.json(
        { error: "回答を入力してください" },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversation = await db
      .select()
      .from(gakuchikaConversations)
      .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
      .orderBy(desc(gakuchikaConversations.updatedAt))
      .get();

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

    // Check if we should consume credit (every 5 questions) - only for logged-in users
    if (questionCount > 0 && questionCount % QUESTIONS_PER_CREDIT === 0 && userId) {
      const canPay = await hasEnoughCredits(userId, 1);
      if (!canPay) {
        return NextResponse.json(
          { error: "クレジットが不足しています" },
          { status: 402 }
        );
      }
      await consumeCredits(userId, 1, "gakuchika", gakuchikaId);
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
    if (isCompleted) {
      const userAnswers = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n\n");
      const summary = userAnswers.substring(0, 500) + (userAnswers.length > 500 ? "..." : "");

      await db
        .update(gakuchikaContents)
        .set({
          summary,
          updatedAt: now,
        })
        .where(eq(gakuchikaContents.id, gakuchikaId));
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
    });
  } catch (error) {
    console.error("Error processing conversation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
