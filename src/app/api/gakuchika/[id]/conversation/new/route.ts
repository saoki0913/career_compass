/**
 * Create New Gakuchika Conversation Session API
 *
 * POST: Create a new conversation session for re-execution
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

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
  const [gakuchika] = await db
    .select()
    .from(gakuchikaContents)
    .where(eq(gakuchikaContents.id, gakuchikaId))
    .limit(1);

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

interface GakuchikaData {
  title: string;
  content?: string | null;
  charLimitType?: string | null;
}

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
  star_evaluation?: STAREvaluation;
  target_element?: string;
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
