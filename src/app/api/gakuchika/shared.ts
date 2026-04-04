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
export type InputRichnessMode = "seed_only" | "rough_episode" | "almost_draftable";
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
export type GakuchikaNextAction =
  | "ask"
  | "show_generate_draft_cta"
  | "continue_deep_dive"
  | "show_interview_ready";

export interface DraftQualityChecks {
  task_clarity?: boolean;
  action_ownership?: boolean;
  role_required?: boolean;
  role_clarity?: boolean;
  result_traceability?: boolean;
  learning_reusability?: boolean;
}

export interface ConversationState {
  stage: ConversationStage;
  focusKey: FocusKey | null;
  progressLabel: string | null;
  answerHint: string | null;
  inputRichnessMode: InputRichnessMode | null;
  missingElements: BuildElement[];
  draftQualityChecks: DraftQualityChecks;
  causalGaps: string[];
  completionChecks: Record<string, boolean>;
  readyForDraft: boolean;
  draftReadinessReason: string;
  draftText: string | null;
  strengthTags: string[];
  issueTags: string[];
  deepdiveRecommendationTags: string[];
  credibilityRiskTags: string[];
  deepdiveStage: string | null;
  deepdiveComplete: boolean;
  completionReasons: string[];
  askedFocuses: FocusKey[];
  resolvedFocuses: FocusKey[];
  deferredFocuses: FocusKey[];
  blockedFocuses: FocusKey[];
  focusAttemptCounts: Partial<Record<FocusKey, number>>;
  lastQuestionSignature: string | null;
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
    inputRichnessMode: null,
    missingElements: ["context", "task", "action", "result"],
    draftQualityChecks: {},
    causalGaps: [],
    completionChecks: {},
    readyForDraft: false,
    draftReadinessReason: "",
    draftText: null,
    strengthTags: [],
    issueTags: [],
    deepdiveRecommendationTags: [],
    credibilityRiskTags: [],
    deepdiveStage: null,
    deepdiveComplete: false,
    completionReasons: [],
    askedFocuses: [],
    resolvedFocuses: [],
    deferredFocuses: [],
    blockedFocuses: [],
    focusAttemptCounts: {},
    lastQuestionSignature: null,
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

function normalizeInputRichnessMode(value: unknown): InputRichnessMode | null {
  return value === "seed_only" || value === "rough_episode" || value === "almost_draftable"
    ? value
    : null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeDraftQualityChecks(value: unknown): DraftQualityChecks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    task_clarity: typeof record.task_clarity === "boolean" ? record.task_clarity : undefined,
    action_ownership: typeof record.action_ownership === "boolean" ? record.action_ownership : undefined,
    role_required: typeof record.role_required === "boolean" ? record.role_required : undefined,
    role_clarity: typeof record.role_clarity === "boolean" ? record.role_clarity : undefined,
    result_traceability: typeof record.result_traceability === "boolean" ? record.result_traceability : undefined,
    learning_reusability:
      typeof record.learning_reusability === "boolean" ? record.learning_reusability : undefined,
  };
}

function normalizeCompletionChecks(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item === "boolean")
  ) as Record<string, boolean>;
}

function normalizeFocusList(value: unknown): FocusKey[] {
  if (!Array.isArray(value)) return [];
  const normalized: FocusKey[] = [];
  for (const item of value) {
    if (typeof item === "string" && isFocusKey(item) && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
}

function normalizeFocusAttemptCounts(value: unknown): Partial<Record<FocusKey, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Partial<Record<FocusKey, number>> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!isFocusKey(key)) continue;
    if (typeof item !== "number" || !Number.isFinite(item) || item <= 0) continue;
    next[key] = Math.floor(item);
  }
  return next;
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
    stage: status === "completed" ? "draft_ready" : "es_building",
    focusKey: status === "completed" ? "result" : "task",
    progressLabel: status === "completed" ? "ES作成可" : "作成中",
    answerHint: null,
    inputRichnessMode: null,
    missingElements: [],
    draftQualityChecks: {},
    causalGaps: [],
    completionChecks: {},
    readyForDraft: status === "completed",
    draftReadinessReason: "",
    draftText: null,
    strengthTags: [],
    issueTags: [],
    deepdiveRecommendationTags: [],
    credibilityRiskTags: [],
    deepdiveStage: null,
    deepdiveComplete: false,
    completionReasons: [],
    askedFocuses: [],
    resolvedFocuses: status === "completed" ? ["context", "task", "action", "result"] : [],
    deferredFocuses: status === "completed" ? ["learning"] : [],
    blockedFocuses: [],
    focusAttemptCounts: {},
    lastQuestionSignature: null,
  };
}

export function safeParseConversationState(
  json: string | null,
  status?: string | null,
): ConversationState {
  if (!json) {
    return status === "completed"
      ? {
          ...defaultConversationState(),
          stage: "draft_ready",
          readyForDraft: true,
          progressLabel: "ES作成可",
          resolvedFocuses: ["context", "task", "action", "result"],
          deferredFocuses: ["learning"],
        }
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
      inputRichnessMode: normalizeInputRichnessMode(parsed.input_richness_mode ?? parsed.inputRichnessMode),
      missingElements: normalizeMissingElements(parsed.missing_elements ?? parsed.missingElements),
      draftQualityChecks: normalizeDraftQualityChecks(parsed.draft_quality_checks ?? parsed.draftQualityChecks),
      causalGaps: normalizeStringList(parsed.causal_gaps ?? parsed.causalGaps),
      completionChecks: normalizeCompletionChecks(parsed.completion_checks ?? parsed.completionChecks),
      readyForDraft: Boolean(parsed.ready_for_draft ?? parsed.readyForDraft),
      draftReadinessReason: String(parsed.draft_readiness_reason ?? parsed.draftReadinessReason ?? "").trim(),
      draftText: normalizeString(parsed.draft_text ?? parsed.draftText),
      strengthTags: normalizeStringList(parsed.strength_tags ?? parsed.strengthTags),
      issueTags: normalizeStringList(parsed.issue_tags ?? parsed.issueTags),
      deepdiveRecommendationTags: normalizeStringList(
        parsed.deepdive_recommendation_tags ?? parsed.deepdiveRecommendationTags
      ),
      credibilityRiskTags: normalizeStringList(parsed.credibility_risk_tags ?? parsed.credibilityRiskTags),
      deepdiveStage: normalizeString(parsed.deepdive_stage ?? parsed.deepdiveStage),
      deepdiveComplete: Boolean(parsed.deepdive_complete ?? parsed.deepdiveComplete),
      completionReasons: normalizeStringList(parsed.completion_reasons ?? parsed.completionReasons),
      askedFocuses: normalizeFocusList(parsed.asked_focuses ?? parsed.askedFocuses),
      resolvedFocuses: normalizeFocusList(parsed.resolved_focuses ?? parsed.resolvedFocuses),
      deferredFocuses: normalizeFocusList(parsed.deferred_focuses ?? parsed.deferredFocuses),
      blockedFocuses: normalizeFocusList(parsed.blocked_focuses ?? parsed.blockedFocuses),
      focusAttemptCounts: normalizeFocusAttemptCounts(parsed.focus_attempt_counts ?? parsed.focusAttemptCounts),
      lastQuestionSignature: normalizeString(parsed.last_question_signature ?? parsed.lastQuestionSignature),
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
    input_richness_mode: state.inputRichnessMode,
    missing_elements: state.missingElements,
    draft_quality_checks: state.draftQualityChecks,
    causal_gaps: state.causalGaps,
    completion_checks: state.completionChecks,
    ready_for_draft: state.readyForDraft,
    draft_readiness_reason: state.draftReadinessReason,
    draft_text: state.draftText,
    strength_tags: state.strengthTags,
    issue_tags: state.issueTags,
    deepdive_recommendation_tags: state.deepdiveRecommendationTags,
    credibility_risk_tags: state.credibilityRiskTags,
    deepdive_stage: state.deepdiveStage,
    deepdive_complete: state.deepdiveComplete,
    completion_reasons: state.completionReasons,
    asked_focuses: state.askedFocuses,
    resolved_focuses: state.resolvedFocuses,
    deferred_focuses: state.deferredFocuses,
    blocked_focuses: state.blockedFocuses,
    focus_attempt_counts: state.focusAttemptCounts,
    last_question_signature: state.lastQuestionSignature,
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

export function getGakuchikaNextAction(state: ConversationState | null): GakuchikaNextAction {
  if (!state) return "ask";
  if (state.stage === "interview_ready") return "show_interview_ready";
  if (state.stage === "draft_ready") {
    return state.draftText ? "continue_deep_dive" : "show_generate_draft_cta";
  }
  return "ask";
}

export function buildConversationStatePatch(
  current: ConversationState,
  patch: Partial<ConversationState>,
): ConversationState {
  return {
    ...current,
    ...patch,
    missingElements: patch.missingElements ?? current.missingElements,
    draftQualityChecks: patch.draftQualityChecks ?? current.draftQualityChecks,
    causalGaps: patch.causalGaps ?? current.causalGaps,
    completionChecks: patch.completionChecks ?? current.completionChecks,
    strengthTags: patch.strengthTags ?? current.strengthTags,
    issueTags: patch.issueTags ?? current.issueTags,
    deepdiveRecommendationTags: patch.deepdiveRecommendationTags ?? current.deepdiveRecommendationTags,
    credibilityRiskTags: patch.credibilityRiskTags ?? current.credibilityRiskTags,
    completionReasons: patch.completionReasons ?? current.completionReasons,
    askedFocuses: patch.askedFocuses ?? current.askedFocuses,
    resolvedFocuses: patch.resolvedFocuses ?? current.resolvedFocuses,
    deferredFocuses: patch.deferredFocuses ?? current.deferredFocuses,
    blockedFocuses: patch.blockedFocuses ?? current.blockedFocuses,
    focusAttemptCounts: patch.focusAttemptCounts ?? current.focusAttemptCounts,
    lastQuestionSignature: patch.lastQuestionSignature ?? current.lastQuestionSignature,
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
      nextAction: GakuchikaNextAction;
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
        next_action?: string;
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
        nextAction:
          typeof data.next_action === "string"
            ? (data.next_action as GakuchikaNextAction)
            : getGakuchikaNextAction(state),
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
  nextAction: GakuchikaNextAction | null;
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
              input_richness_mode: conversationState.inputRichnessMode,
              draft_quality_checks: conversationState.draftQualityChecks,
              causal_gaps: conversationState.causalGaps,
              completion_checks: conversationState.completionChecks,
              strength_tags: conversationState.strengthTags,
              issue_tags: conversationState.issueTags,
              deepdive_recommendation_tags: conversationState.deepdiveRecommendationTags,
              credibility_risk_tags: conversationState.credibilityRiskTags,
              deepdive_stage: conversationState.deepdiveStage,
              deepdive_complete: conversationState.deepdiveComplete,
              completion_reasons: conversationState.completionReasons,
              asked_focuses: conversationState.askedFocuses,
              resolved_focuses: conversationState.resolvedFocuses,
              deferred_focuses: conversationState.deferredFocuses,
              blocked_focuses: conversationState.blockedFocuses,
              focus_attempt_counts: conversationState.focusAttemptCounts,
              last_question_signature: conversationState.lastQuestionSignature,
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
        nextAction: null,
        telemetry: consumed.telemetry,
      };
    }

    return {
      question: consumed.question,
      error: null,
      conversationState: consumed.conversationState,
      nextAction: consumed.nextAction,
      telemetry: consumed.telemetry,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        question: null,
        error: "AIの応答がタイムアウトしました。再度お試しください。",
        conversationState: null,
        nextAction: null,
        telemetry: null,
      };
    }
    return {
      question: null,
      error: "AIサービスに接続できませんでした",
      conversationState: null,
      nextAction: null,
      telemetry: null,
    };
  } finally {
    clearTimeout(fetchTimeoutId);
  }
}
