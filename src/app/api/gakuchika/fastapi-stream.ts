import {
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import {
  buildConversationStatePatch,
  defaultConversationState,
  getGakuchikaNextAction,
  isFocusKey,
  safeParseConversationState,
  type ConversationState,
  type GakuchikaNextAction,
  type Message,
} from "./state";

export interface GakuchikaData {
  title: string;
  content?: string | null;
  charLimitType?: string | null;
}

export const FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS = 60_000;

const FASTAPI_ERROR_MESSAGE = "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。";

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
              extended_deep_dive_round: conversationState.extendedDeepDiveRound,
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
