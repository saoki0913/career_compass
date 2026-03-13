import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";

export interface Identity {
  userId: string | null;
  guestId: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

export interface STAREvaluation {
  scores: STARScores;
  weakest_element: string;
  is_complete: boolean;
}

export interface GakuchikaData {
  title: string;
  content?: string | null;
  charLimitType?: string | null;
}

interface FastAPIQuestionResponse {
  question: string;
  star_evaluation?: STAREvaluation;
  target_element?: string;
}

export const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
export const STAR_COMPLETION_THRESHOLD = 70;
export const QUESTIONS_PER_CREDIT = 5;

const STAR_HINT_TEXTS: Record<string, string> = {
  situation: "この質問では、当時の状況や背景が伝わると答えやすくなります",
  task: "この質問では、何が課題だったのかをはっきりさせると伝わりやすいです",
  action: "この質問では、自分がどう考えて動いたかまで話せると強くなります",
  result: "この質問では、結果とそこから得た学びまでつなげるとまとまりやすいです",
};

const STAR_ELEMENT_KEYS = ["situation", "task", "action", "result"] as const;

const FASTAPI_ERROR_MESSAGE = "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。";

export async function getIdentity(request: NextRequest): Promise<Identity | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (!deviceToken) {
    return null;
  }

  const guest = await getGuestUser(deviceToken);
  if (!guest) {
    return null;
  }

  return { userId: null, guestId: guest.id };
}

export async function verifyGakuchikaAccess(
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

export function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((message): message is { id?: string; role: string; content: string } =>
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
      )
      .map((message) => ({
        id: message.id || crypto.randomUUID(),
        role: message.role as "user" | "assistant",
        content: message.content,
      }));
  } catch {
    return [];
  }
}

export function safeParseStarScores(json: string | null): STARScores | null {
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

export function getWeakestElement(scores: STARScores | null): string | null {
  if (!scores) return null;

  return STAR_ELEMENT_KEYS.reduce(
    (weakest, key) => (scores[key] < scores[weakest] ? key : weakest),
    STAR_ELEMENT_KEYS[0]
  );
}

export function isStarComplete(scores: STARScores | null): boolean {
  if (!scores) return false;
  return (
    scores.situation >= STAR_COMPLETION_THRESHOLD &&
    scores.task >= STAR_COMPLETION_THRESHOLD &&
    scores.action >= STAR_COMPLETION_THRESHOLD &&
    scores.result >= STAR_COMPLETION_THRESHOLD
  );
}

export function buildHintPayload(targetElement: string | null) {
  if (!targetElement || !STAR_HINT_TEXTS[targetElement]) {
    return null;
  }

  return {
    targetElement,
    hintText: STAR_HINT_TEXTS[targetElement],
    source: "rule",
  };
}

export async function getQuestionFromFastAPI(
  gakuchika: GakuchikaData,
  conversationHistory: Array<Omit<Message, "id"> | Message>,
  questionCount: number,
  starScores?: STARScores | null
): Promise<{
  question: string | null;
  error: string | null;
  starEvaluation: STAREvaluation | null;
  targetElement: string | null;
}> {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/gakuchika/next-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gakuchika_title: gakuchika.title,
        gakuchika_content: gakuchika.content || null,
        char_limit_type: gakuchika.charLimitType || null,
        conversation_history: conversationHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        question_count: questionCount,
        star_scores: starScores || null,
      }),
    });

    if (!response.ok) {
      return {
        question: null,
        error: FASTAPI_ERROR_MESSAGE,
        starEvaluation: null,
        targetElement: null,
      };
    }

    const result: FastAPIQuestionResponse = await response.json();
    return {
      question: result.question || null,
      error: null,
      starEvaluation: result.star_evaluation || null,
      targetElement: result.target_element || result.star_evaluation?.weakest_element || null,
    };
  } catch {
    return {
      question: null,
      error: FASTAPI_ERROR_MESSAGE,
      starEvaluation: null,
      targetElement: null,
    };
  }
}
