/**
 * Motivation Conversation API
 *
 * GET: Get conversation history
 * POST: Send answer and get next question
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { motivationConversations, companies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
}

interface MotivationEvaluation {
  scores: MotivationScores;
  weakest_element: string;
  is_complete: boolean;
  missing_aspects?: Record<string, string[]>;
}

function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
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
  } catch {
    return [];
  }
}

function safeParseScores(json: string | null): MotivationScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      company_understanding: parsed.company_understanding ?? 0,
      self_analysis: parsed.self_analysis ?? 0,
      career_vision: parsed.career_vision ?? 0,
      differentiation: parsed.differentiation ?? 0,
    };
  } catch {
    return null;
  }
}

// Configuration
const ELEMENT_COMPLETION_THRESHOLD = 70;
const QUESTIONS_PER_CREDIT = 5;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
  evaluation?: MotivationEvaluation;
  target_element?: string;
  company_insight?: string;
}

interface CompanyData {
  id: string;
  name: string;
  industry: string | null;
}

async function getQuestionFromFastAPI(
  company: CompanyData,
  conversationHistory: Message[],
  questionCount: number,
  scores?: MotivationScores | null
): Promise<{
  question: string | null;
  error: string | null;
  evaluation: MotivationEvaluation | null;
}> {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/motivation/next-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        conversation_history: conversationHistory.map(m => ({
          role: m.role,
          content: m.content,
        })),
        question_count: questionCount,
        scores: scores,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        question: null,
        error: errorData.detail?.error || "AIサービスに接続できませんでした",
        evaluation: null,
      };
    }

    const data: FastAPIQuestionResponse = await response.json();
    return {
      question: data.question,
      error: null,
      evaluation: data.evaluation || null,
    };
  } catch (error) {
    console.error("[Motivation] FastAPI error:", error);
    return {
      question: null,
      error: "AIサービスに接続できませんでした",
      evaluation: null,
    };
  }
}

// GET: Fetch conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  // Get company
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();

  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  // Find or create conversation
  let conversation = await db
    .select()
    .from(motivationConversations)
    .where(
      userId
        ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
        : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
    )
    .get();

  if (!conversation) {
    // Create new conversation
    const newId = crypto.randomUUID();
    const now = new Date();

    await db.insert(motivationConversations).values({
      id: newId,
      userId,
      guestId,
      companyId,
      messages: "[]",
      questionCount: 0,
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
    });

    conversation = await db
      .select()
      .from(motivationConversations)
      .where(eq(motivationConversations.id, newId))
      .get();
  }

  if (!conversation) {
    return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
  }

  const messages = safeParseMessages(conversation.messages);
  const scores = safeParseScores(conversation.motivationScores);
  const isCompleted = conversation.status === "completed";

  // Get next question if not completed
  let nextQuestion: string | null = null;
  if (!isCompleted && messages.length === 0) {
    const result = await getQuestionFromFastAPI(
      { id: company.id, name: company.name, industry: company.industry },
      [],
      0
    );
    nextQuestion = result.question;
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      questionCount: conversation.questionCount,
      status: conversation.status,
    },
    messages,
    nextQuestion,
    questionCount: conversation.questionCount ?? 0,
    isCompleted,
    scores,
    generatedDraft: conversation.generatedDraft,
  });
}

// POST: Send answer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  const body = await request.json();
  const { answer } = body;

  if (!answer || typeof answer !== "string" || !answer.trim()) {
    return NextResponse.json({ error: "回答を入力してください" }, { status: 400 });
  }

  // Get company
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();

  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  // Get conversation
  const conversation = await db
    .select()
    .from(motivationConversations)
    .where(
      userId
        ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
        : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
    )
    .get();

  if (!conversation) {
    return NextResponse.json({ error: "会話が見つかりません" }, { status: 404 });
  }

  if (conversation.status === "completed") {
    return NextResponse.json({ error: "この会話は既に完了しています" }, { status: 400 });
  }

  const messages = safeParseMessages(conversation.messages);
  const currentQuestionCount = conversation.questionCount ?? 0;
  const newQuestionCount = currentQuestionCount + 1;

  // Credit check (every QUESTIONS_PER_CREDIT questions for logged-in users)
  if (newQuestionCount > 0 && newQuestionCount % QUESTIONS_PER_CREDIT === 0 && userId) {
    const canPay = await hasEnoughCredits(userId, 1);
    if (!canPay) {
      return NextResponse.json({ error: "クレジットが不足しています" }, { status: 402 });
    }
    await consumeCredits(userId, 1, "motivation", companyId);
  }

  // Add user answer
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: answer.trim(),
  };
  messages.push(userMessage);

  // Get next question from FastAPI
  const scores = safeParseScores(conversation.motivationScores);
  const result = await getQuestionFromFastAPI(
    { id: company.id, name: company.name, industry: company.industry },
    messages,
    newQuestionCount,
    scores
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  // Add AI question
  let isCompleted = false;
  let newScores = scores;

  if (result.question) {
    const aiMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.question,
    };
    messages.push(aiMessage);
  }

  if (result.evaluation) {
    newScores = result.evaluation.scores;
    isCompleted = result.evaluation.is_complete;
  }

  // Check completion (8+ questions or all elements >= threshold)
  if (newQuestionCount >= 8 && newScores) {
    const allComplete =
      newScores.company_understanding >= ELEMENT_COMPLETION_THRESHOLD &&
      newScores.self_analysis >= ELEMENT_COMPLETION_THRESHOLD &&
      newScores.career_vision >= ELEMENT_COMPLETION_THRESHOLD &&
      newScores.differentiation >= ELEMENT_COMPLETION_THRESHOLD;
    if (allComplete) {
      isCompleted = true;
    }
  }

  // Update database
  await db
    .update(motivationConversations)
    .set({
      messages: JSON.stringify(messages),
      questionCount: newQuestionCount,
      status: isCompleted ? "completed" : "in_progress",
      motivationScores: newScores ? JSON.stringify(newScores) : null,
      updatedAt: new Date(),
    })
    .where(eq(motivationConversations.id, conversation.id));

  return NextResponse.json({
    messages,
    nextQuestion: isCompleted ? null : result.question,
    questionCount: newQuestionCount,
    isCompleted,
    scores: newScores,
  });
}
