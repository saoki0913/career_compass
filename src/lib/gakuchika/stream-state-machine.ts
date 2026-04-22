import {
  buildConversationStatePatch,
  isFocusKey,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";
import type { SSEProxyProgressResult } from "@/lib/fastapi/sse-proxy";

interface HintPayload {
  focusKey: string;
  answerHint: string;
  progressLabel: string;
  source: "model";
}

function buildHintPayload(state: ConversationState | null): HintPayload | null {
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

const FORWARDED_FIELDS = new Set(["coach_progress_message", "remaining_questions_estimate"]);

export function createGakuchikaStreamStateMachine(
  baseState: ConversationState,
) {
  let partialState: Partial<ConversationState> = {};
  let hasStartedQuestionStream = false;

  function getPartialState(): Partial<ConversationState> {
    return partialState;
  }

  function getMergedState(): ConversationState {
    return buildConversationStatePatch(baseState, partialState);
  }

  function processEvent(event: Record<string, unknown>): SSEProxyProgressResult | void {
    const type = event.type;

    if (type === "progress" && !hasStartedQuestionStream) {
      return;
    }

    if (type === "string_chunk" && event.path === "question" && typeof event.text === "string") {
      hasStartedQuestionStream = true;
      return;
    }

    if (type !== "field_complete") return;

    const path = event.path as string;
    const value = event.value;

    if (path === "focus_key" && typeof value === "string" && isFocusKey(value)) {
      partialState.focusKey = value;
    } else if (path === "progress_label" && typeof value === "string") {
      partialState.progressLabel = value;
    } else if (path === "answer_hint" && typeof value === "string") {
      partialState.answerHint = value;
    } else if (path === "ready_for_draft") {
      partialState.readyForDraft = Boolean(value);
    } else if (path === "deepdive_stage" && typeof value === "string") {
      partialState.deepdiveStage = value;
    } else if (path === "coach_progress_message") {
      partialState.coachProgressMessage = typeof value === "string" ? value : null;
    } else if (
      path === "remaining_questions_estimate" &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      partialState.remainingQuestionsEstimate = Math.floor(value);
    }

    const emitExtra: Record<string, unknown>[] = [];

    if (path === "coach_progress_message") {
      emitExtra.push({
        type: "field_complete",
        path: "coach_progress_message",
        value: typeof value === "string" ? value : null,
      });
    } else if (path === "remaining_questions_estimate") {
      const normalized =
        typeof value === "number" && Number.isFinite(value) && value >= 0
          ? Math.floor(value)
          : null;
      emitExtra.push({
        type: "field_complete",
        path: "remaining_questions_estimate",
        value: normalized,
      });
    }

    const hintPayload = buildHintPayload(getMergedState());
    if (hintPayload) {
      emitExtra.push({ type: "hint_ready", data: hintPayload });
    }

    return {
      suppress: !FORWARDED_FIELDS.has(path),
      emitExtra: emitExtra.length > 0 ? emitExtra : undefined,
    };
  }

  return { processEvent, getPartialState, getMergedState };
}
