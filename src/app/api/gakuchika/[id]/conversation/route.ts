/**
 * Gakuchika Conversation API
 *
 * GET: Get conversation history
 * POST: Send answer and get next question
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";

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

// Safe JSON parse for messages with backward compatibility
function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      console.error("Invalid messages format: not an array");
      return [];
    }
    // Add IDs to messages that don't have them (backward compatibility)
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

// Configuration per SPEC Section 17.2
const TARGET_QUESTIONS = 8; // 目安8問（内容により早終了/追加あり）
const QUESTIONS_PER_CREDIT = 5; // 5問回答ごとに1クレジット消費

// FastAPI URL for AI-powered questions
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
}

interface GakuchikaData {
  title: string;
  content?: string | null;
  charLimitType?: string | null;
}

async function getQuestionFromFastAPI(
  gakuchika: GakuchikaData,
  conversationHistory: Message[],
  questionCount: number
): Promise<{
  question: string | null;
  error: string | null;
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
      }),
    });

    if (fastApiResponse.ok) {
      const result: FastAPIQuestionResponse = await fastApiResponse.json();
      return { question: result.question, error: null };
    } else {
      console.error("FastAPI error status:", fastApiResponse.status);
      return { question: null, error: "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。" };
    }
  } catch (err) {
    console.error("FastAPI connection error:", err);
    return { question: null, error: "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。" };
  }
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
      const { question: initialQuestion, error } = await getQuestionFromFastAPI(
        {
          title: gakuchika.title,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        [],
        0
      );

      if (error) {
        return NextResponse.json(
          { error },
          { status: 503 }
        );
      }

      // Create conversation record immediately with first question persisted
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
        messages: JSON.stringify(initialMessages),
        questionCount: 0,
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
      });

      return NextResponse.json({
        conversation: { id: conversationId, questionCount: 0, status: "in_progress" },
        messages: initialMessages,
        nextQuestion: null, // Already in messages
        questionCount: 0,
        isCompleted: false,
        suggestedEnd: false,
        targetQuestions: TARGET_QUESTIONS,
        isAIPowered: true,
        gakuchikaContent: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
      });
    }

    const messages: Message[] = safeParseMessages(conversation.messages);
    const qCount = conversation.questionCount || 0;

    // For existing conversations, get next question from FastAPI if not completed
    let nextQuestion: string | null = null;

    if (conversation.status !== "completed") {
      const { question, error } = await getQuestionFromFastAPI(
        {
          title: gakuchika.title,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        messages,
        qCount
      );

      if (error) {
        return NextResponse.json(
          { error },
          { status: 503 }
        );
      }

      nextQuestion = question;
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
      isCompleted: conversation.status === "completed",
      suggestedEnd: qCount >= TARGET_QUESTIONS - 1,
      targetQuestions: TARGET_QUESTIONS,
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

    if (conversation) {
      messages = JSON.parse(conversation.messages);
      questionCount = conversation.questionCount || 0;
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

    // Get the current AI question that the user is answering (from the most recent assistant message or initial)
    // For first answer, use the initial question from FastAPI or static
    let currentQuestion: string;
    const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();

    if (lastAssistantMessage) {
      currentQuestion = lastAssistantMessage.content;
    } else {
      // This is the first answer - use a contextual initial question
      currentQuestion = `「${gakuchikaTitle}」について、具体的にどのようなことに取り組みましたか？`;
    }

    // Add the question (if not already added) and user's answer
    if (!lastAssistantMessage || messages[messages.length - 1].role !== "assistant") {
      messages.push({ role: "assistant", content: currentQuestion });
    }
    messages.push({ role: "user", content: answer.trim() });
    questionCount++;

    // Check if we should consume credit (every 5 questions) - only for logged-in users
    // Per SPEC Section 17.2: 5問回答ごとに1クレジット消費、5問未満で終了した場合は消費なし
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

    // Check if completed (target ~8 questions per SPEC Section 17.2)
    // Allow user to continue beyond target if needed
    const isCompleted = questionCount >= TARGET_QUESTIONS;
    const suggestedEnd = questionCount >= TARGET_QUESTIONS - 1;
    let nextQuestion: string | null = null;

    if (!isCompleted) {
      // Get AI-powered question from FastAPI (no fallback to static questions)
      const { question, error } = await getQuestionFromFastAPI(
        {
          title: gakuchikaTitle,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        messages,
        questionCount
      );

      if (error) {
        return NextResponse.json(
          { error },
          { status: 503 }
        );
      }

      nextQuestion = question;
    } else {
      // Already at or past target, but user can continue
      nextQuestion = "他に印象的だった出来事や学びはありますか？";
    }

    const aiQuestion = nextQuestion;

    // Note: conversation is not marked as "completed" automatically at target
    // User can choose to end or continue. Only mark completed when user explicitly ends.
    // For now, we keep status as "in_progress" until target is reached
    const status = isCompleted ? "completed" : "in_progress";

    if (conversation) {
      await db
        .update(gakuchikaConversations)
        .set({
          messages: JSON.stringify(messages),
          questionCount,
          status,
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
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update gakuchika summary if completed
    if (isCompleted) {
      // Generate summary from answers
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
      nextQuestion: aiQuestion,
      questionCount,
      isCompleted,
      suggestedEnd,
      targetQuestions: TARGET_QUESTIONS,
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
