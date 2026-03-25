import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import { gakuchikaContents } from "@/lib/db/schema";
import {
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";

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

export const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
export const STAR_COMPLETION_THRESHOLD = 70;
export const QUESTIONS_PER_CREDIT = 5;
/** 上記 N 問ごとに一度まとめて消費するクレジット数 */
export const CREDITS_PER_QUESTION_BATCH = 3;

const STAR_HINT_TEXTS: Record<string, string> = {
  situation: "この質問では、当時の状況や背景が伝わると答えやすくなります",
  task: "この質問では、何が課題だったのかをはっきりさせると伝わりやすいです",
  action: "この質問では、自分がどう考えて動いたかまで話せると強くなります",
  result: "この質問では、結果とそこから得た学びまでつなげるとまとまりやすいです",
};

const STAR_ELEMENT_KEYS = ["situation", "task", "action", "result"] as const;

const FASTAPI_ERROR_MESSAGE = "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。";
/** FastAPI ガクチカ stream 呼び出しのタイムアウト（new / resume / 会話ストリームで共通） */
export const FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS = 60_000;

/** FastAPI `next-question/stream` の SSE を行単位でパースする（Next の中継と new/resume の完読で共用） */
export async function* iterateGakuchikaFastApiSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: Record<string, unknown>; telemetry: InternalCostTelemetry | null }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const rawEvent = JSON.parse(jsonStr) as Record<string, unknown>;
          const { payload, telemetry } = splitInternalTelemetry(rawEvent);
          yield { event: payload as Record<string, unknown>, telemetry };
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type ConsumeGakuchikaNextQuestionSseResult =
  | {
      ok: true;
      question: string;
      starEvaluation: STAREvaluation | null;
      targetElement: string | null;
      telemetry: InternalCostTelemetry | null;
    }
  | {
      ok: false;
      question: null;
      starEvaluation: null;
      targetElement: null;
      telemetry: InternalCostTelemetry | null;
      error: string;
    };

/** SSE を最後まで読み、`complete` または `error` で終了する（new / resume 用） */
export async function consumeGakuchikaNextQuestionSse(
  response: Response,
): Promise<ConsumeGakuchikaNextQuestionSseResult> {
  if (!response.ok) {
    const rawErrorBody = await response.json().catch(() => ({}));
    const { payload, telemetry } =
      rawErrorBody && typeof rawErrorBody === "object"
        ? splitInternalTelemetry(rawErrorBody as Record<string, unknown>)
        : { payload: rawErrorBody, telemetry: null as InternalCostTelemetry | null };
    const msg =
      (payload as { detail?: { error?: string } } | null)?.detail?.error || FASTAPI_ERROR_MESSAGE;
    return {
      ok: false,
      question: null,
      starEvaluation: null,
      targetElement: null,
      telemetry,
      error: msg,
    };
  }

  const body = response.body;
  if (!body) {
    return {
      ok: false,
      question: null,
      starEvaluation: null,
      targetElement: null,
      telemetry: null,
      error: FASTAPI_ERROR_MESSAGE,
    };
  }

  let streamedQuestionText = "";
  let latestTelemetry: InternalCostTelemetry | null = null;
  let hintedTargetElement: string | null = null;

  for await (const { event, telemetry } of iterateGakuchikaFastApiSseEvents(body)) {
    latestTelemetry = telemetry ?? latestTelemetry;
    const type = event.type;

    if (
      type === "string_chunk" &&
      event.path === "question" &&
      typeof event.text === "string"
    ) {
      streamedQuestionText += event.text;
    } else if (
      type === "field_complete" &&
      event.path === "star_scores" &&
      event.value &&
      typeof event.value === "object"
    ) {
      const v = event.value as Record<string, unknown>;
      const partialScores: STARScores = {
        situation: Number(v.situation ?? 0),
        task: Number(v.task ?? 0),
        action: Number(v.action ?? 0),
        result: Number(v.result ?? 0),
      };
      hintedTargetElement = getWeakestElement(partialScores);
    } else if (type === "complete") {
      const data = event.data as {
        question?: string;
        target_element?: string;
        star_evaluation?: STAREvaluation;
      };
      const questionText =
        typeof data.question === "string" && data.question.trim()
          ? data.question.trim()
          : streamedQuestionText.trim() || "";
      if (!questionText) {
        return {
          ok: false,
          question: null,
          starEvaluation: null,
          targetElement: null,
          telemetry: latestTelemetry,
          error: FASTAPI_ERROR_MESSAGE,
        };
      }

      const starEvaluation = data.star_evaluation ?? null;
      let targetElement: string | null =
        typeof data.target_element === "string" ? data.target_element : hintedTargetElement;

      if (starEvaluation) {
        targetElement =
          (typeof data.target_element === "string" && data.target_element) ||
          starEvaluation.weakest_element ||
          getWeakestElement(starEvaluation.scores);
      }
      if (!targetElement && starEvaluation?.scores) {
        targetElement = getWeakestElement(starEvaluation.scores);
      }

      return {
        ok: true,
        question: questionText,
        starEvaluation,
        targetElement,
        telemetry: latestTelemetry,
      };
    } else if (type === "error") {
      const msg =
        typeof event.message === "string" && event.message.trim()
          ? event.message.trim()
          : FASTAPI_ERROR_MESSAGE;
      return {
        ok: false,
        question: null,
        starEvaluation: null,
        targetElement: null,
        telemetry: latestTelemetry,
        error: msg,
      };
    }
  }

  return {
    ok: false,
    question: null,
    starEvaluation: null,
    targetElement: null,
    telemetry: latestTelemetry,
    error: FASTAPI_ERROR_MESSAGE,
  };
}

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
  starScores?: STARScores | null,
  requestId?: string,
): Promise<{
  question: string | null;
  error: string | null;
  starEvaluation: STAREvaluation | null;
  targetElement: string | null;
  telemetry: InternalCostTelemetry | null;
}> {
  const abortController = new AbortController();
  const fetchTimeoutId = setTimeout(() => abortController.abort(), FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${FASTAPI_URL}/api/gakuchika/next-question/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
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
      signal: abortController.signal,
    });

    const consumed = await consumeGakuchikaNextQuestionSse(response);
    if (!consumed.ok) {
      return {
        question: null,
        error: consumed.error,
        starEvaluation: consumed.starEvaluation,
        targetElement: consumed.targetElement,
        telemetry: consumed.telemetry,
      };
    }
    return {
      question: consumed.question,
      error: null,
      starEvaluation: consumed.starEvaluation,
      targetElement:
        consumed.targetElement ||
        consumed.starEvaluation?.weakest_element ||
        null,
      telemetry: consumed.telemetry,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        question: null,
        error: "AIの応答がタイムアウトしました。再度お試しください。",
        starEvaluation: null,
        targetElement: null,
        telemetry: null,
      };
    }
    return {
      question: null,
      error: "AIサービスに接続できませんでした",
      starEvaluation: null,
      targetElement: null,
      telemetry: null,
    };
  } finally {
    clearTimeout(fetchTimeoutId);
  }
}
