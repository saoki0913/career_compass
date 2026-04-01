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
import { fetchFastApiInternal } from "@/lib/fastapi/client";

export interface Identity {
  userId: string | null;
  guestId: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export type BuildElement = "overview" | "context" | "task" | "action" | "result" | "learning";
export type DeepDiveFocus =
  | "role"
  | "challenge"
  | "action_reason"
  | "result_evidence"
  | "learning_transfer"
  | "credibility"
  | "future"
  | "backstory";
export type FocusKey = BuildElement | DeepDiveFocus;
export type ConversationStage = "es_building" | "draft_ready" | "deep_dive_active" | "interview_ready";

export interface ConversationState {
  stage: ConversationStage;
  focusKey: FocusKey | null;
  progressLabel: string | null;
  answerHint: string | null;
  missingElements: BuildElement[];
  readyForDraft: boolean;
  draftReadinessReason: string;
  draftText: string | null;
  deepdiveStage: string | null;
}

export interface GakuchikaData {
  title: string;
  content?: string | null;
  charLimitType?: string | null;
}

export const QUESTIONS_PER_CREDIT = 5;
export const CREDITS_PER_QUESTION_BATCH = 3;
export const FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS = 60_000;

const BUILD_ELEMENTS: BuildElement[] = ["overview", "context", "task", "action", "result", "learning"];
const FOCUS_KEYS = new Set<FocusKey>([
  "overview",
  "context",
  "task",
  "action",
  "result",
  "learning",
  "role",
  "challenge",
  "action_reason",
  "result_evidence",
  "learning_transfer",
  "credibility",
  "future",
  "backstory",
]);

const FASTAPI_ERROR_MESSAGE = "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。";

function isBuildElement(value: string): value is BuildElement {
  return BUILD_ELEMENTS.includes(value as BuildElement);
}

function isFocusKey(value: string): value is FocusKey {
  return FOCUS_KEYS.has(value as FocusKey);
}

function defaultConversationState(): ConversationState {
  return {
    stage: "es_building",
    focusKey: null,
    progressLabel: null,
    answerHint: null,
    missingElements: ["context", "task", "action", "result", "learning"],
    readyForDraft: false,
    draftReadinessReason: "",
    draftText: null,
    deepdiveStage: null,
  };
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeMissingElements(value: unknown): BuildElement[] {
  if (!Array.isArray(value)) return [];
  const normalized: BuildElement[] = [];
  for (const item of value) {
    if (typeof item === "string" && isBuildElement(item) && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
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

function parseLegacyState(value: Record<string, unknown>, status: string | null | undefined): ConversationState | null {
  const hasLegacyScores = ["situation", "task", "action", "result"].some((key) => typeof value[key] === "number");
  if (!hasLegacyScores) return null;
  return {
    stage: status === "completed" ? "interview_ready" : "es_building",
    focusKey: status === "completed" ? "learning_transfer" : "task",
    progressLabel: status === "completed" ? "面接準備完了" : "作成中",
    answerHint: null,
    missingElements: [],
    readyForDraft: status === "completed",
    draftReadinessReason: "",
    draftText: null,
    deepdiveStage: status === "completed" ? "legacy_completed" : null,
  };
}

export function safeParseConversationState(
  json: string | null,
  status?: string | null,
): ConversationState {
  if (!json) {
    return status === "completed"
      ? { ...defaultConversationState(), stage: "interview_ready", readyForDraft: true, progressLabel: "面接準備完了" }
      : defaultConversationState();
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const legacy = parseLegacyState(parsed, status);
    if (legacy) return legacy;

    const stage = normalizeString(parsed.stage) as ConversationStage | null;
    const focusKeyRaw = normalizeString(parsed.focus_key ?? parsed.focusKey);
    const focusKey = focusKeyRaw && isFocusKey(focusKeyRaw) ? focusKeyRaw : null;

    return {
      stage:
        stage === "draft_ready" || stage === "deep_dive_active" || stage === "interview_ready"
          ? stage
          : "es_building",
      focusKey,
      progressLabel: normalizeString(parsed.progress_label ?? parsed.progressLabel),
      answerHint: normalizeString(parsed.answer_hint ?? parsed.answerHint),
      missingElements: normalizeMissingElements(parsed.missing_elements ?? parsed.missingElements),
      readyForDraft: Boolean(parsed.ready_for_draft ?? parsed.readyForDraft),
      draftReadinessReason: String(parsed.draft_readiness_reason ?? parsed.draftReadinessReason ?? "").trim(),
      draftText: normalizeString(parsed.draft_text ?? parsed.draftText),
      deepdiveStage: normalizeString(parsed.deepdive_stage ?? parsed.deepdiveStage),
    };
  } catch {
    return defaultConversationState();
  }
}

export function serializeConversationState(state: ConversationState): string {
  return JSON.stringify({
    stage: state.stage,
    focus_key: state.focusKey,
    progress_label: state.progressLabel,
    answer_hint: state.answerHint,
    missing_elements: state.missingElements,
    ready_for_draft: state.readyForDraft,
    draft_readiness_reason: state.draftReadinessReason,
    draft_text: state.draftText,
    deepdive_stage: state.deepdiveStage,
  });
}

export function isDraftReady(state: ConversationState | null): boolean {
  if (!state) return false;
  return state.readyForDraft || ["draft_ready", "deep_dive_active", "interview_ready"].includes(state.stage);
}

export function isInterviewReady(state: ConversationState | null): boolean {
  if (!state) return false;
  return state.stage === "interview_ready";
}

export function buildConversationStatePatch(
  current: ConversationState,
  patch: Partial<ConversationState>,
): ConversationState {
  return {
    ...current,
    ...patch,
    missingElements: patch.missingElements ?? current.missingElements,
  };
}

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
      conversationState: ConversationState;
      telemetry: InternalCostTelemetry | null;
    }
  | {
      ok: false;
      question: null;
      conversationState: ConversationState | null;
      telemetry: InternalCostTelemetry | null;
      error: string;
    };

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
      conversationState: null,
      telemetry,
      error: msg,
    };
  }

  const body = response.body;
  if (!body) {
    return {
      ok: false,
      question: null,
      conversationState: null,
      telemetry: null,
      error: FASTAPI_ERROR_MESSAGE,
    };
  }

  let streamedQuestionText = "";
  let latestTelemetry: InternalCostTelemetry | null = null;
  const partialState: Partial<ConversationState> = {};

  for await (const { event, telemetry } of iterateGakuchikaFastApiSseEvents(body)) {
    latestTelemetry = telemetry ?? latestTelemetry;
    const type = event.type;

    if (type === "string_chunk" && event.path === "question" && typeof event.text === "string") {
      streamedQuestionText += event.text;
    } else if (type === "field_complete") {
      if (event.path === "focus_key" && typeof event.value === "string" && isFocusKey(event.value)) {
        partialState.focusKey = event.value;
      } else if (event.path === "progress_label" && typeof event.value === "string") {
        partialState.progressLabel = event.value;
      } else if (event.path === "answer_hint" && typeof event.value === "string") {
        partialState.answerHint = event.value;
      } else if (event.path === "ready_for_draft") {
        partialState.readyForDraft = Boolean(event.value);
      } else if (event.path === "draft_readiness_reason" && typeof event.value === "string") {
        partialState.draftReadinessReason = event.value;
      } else if (event.path === "deepdive_stage" && typeof event.value === "string") {
        partialState.deepdiveStage = event.value;
      }
    } else if (type === "complete") {
      const data = event.data as {
        question?: string;
        conversation_state?: Record<string, unknown>;
      };
      const questionText =
        typeof data.question === "string" && data.question.trim()
          ? data.question.trim()
          : streamedQuestionText.trim();
      const state = data.conversation_state
        ? safeParseConversationState(JSON.stringify(data.conversation_state))
        : buildConversationStatePatch(defaultConversationState(), partialState);

      return {
        ok: true,
        question: questionText,
        conversationState: state,
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
        conversationState: null,
        telemetry: latestTelemetry,
        error: msg,
      };
    }
  }

  return {
    ok: false,
    question: null,
    conversationState: null,
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
  guestId: string | null,
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

export function buildHintPayload(state: ConversationState | null) {
  if (!state?.focusKey || !state.answerHint || !state.progressLabel) {
    return null;
  }

  return {
    focusKey: state.focusKey,
    answerHint: state.answerHint,
    progressLabel: state.progressLabel,
    source: "model",
  };
}

export async function getQuestionFromFastAPI(
  gakuchika: GakuchikaData,
  conversationHistory: Array<Omit<Message, "id"> | Message>,
  questionCount: number,
  conversationState?: ConversationState | null,
  requestId?: string,
): Promise<{
  question: string | null;
  error: string | null;
  conversationState: ConversationState | null;
  telemetry: InternalCostTelemetry | null;
}> {
  const abortController = new AbortController();
  const fetchTimeoutId = setTimeout(() => abortController.abort(), FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS);
  try {
    const response = await fetchFastApiInternal("/api/gakuchika/next-question/stream", {
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
        conversation_state: conversationState
          ? {
              stage: conversationState.stage,
              focus_key: conversationState.focusKey,
              progress_label: conversationState.progressLabel,
              answer_hint: conversationState.answerHint,
              missing_elements: conversationState.missingElements,
              ready_for_draft: conversationState.readyForDraft,
              draft_readiness_reason: conversationState.draftReadinessReason,
              draft_text: conversationState.draftText,
              deepdive_stage: conversationState.deepdiveStage,
            }
          : null,
      }),
      signal: abortController.signal,
    });

    const consumed = await consumeGakuchikaNextQuestionSse(response);
    if (!consumed.ok) {
      return {
        question: null,
        error: consumed.error,
        conversationState: consumed.conversationState,
        telemetry: consumed.telemetry,
      };
    }

    return {
      question: consumed.question,
      error: null,
      conversationState: consumed.conversationState,
      telemetry: consumed.telemetry,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        question: null,
        error: "AIの応答がタイムアウトしました。再度お試しください。",
        conversationState: null,
        telemetry: null,
      };
    }
    return {
      question: null,
      error: "AIサービスに接続できませんでした",
      conversationState: null,
      telemetry: null,
    };
  } finally {
    clearTimeout(fetchTimeoutId);
  }
}
