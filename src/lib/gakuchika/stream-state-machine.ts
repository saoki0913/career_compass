import {
  buildConversationStatePatch,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";
import type { SSEProxyProgressResult } from "@/lib/fastapi/sse-proxy";

const FORWARDED_FIELDS = new Set(["coach_progress_message", "remaining_questions_estimate"]);

export function createGakuchikaStreamStateMachine(
  baseState: ConversationState,
) {
  const partialState: Partial<ConversationState> = {};
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

    if (path === "ready_for_draft") {
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

    return {
      suppress: !FORWARDED_FIELDS.has(path),
      emitExtra: emitExtra.length > 0 ? emitExtra : undefined,
    };
  }

  return { processEvent, getPartialState, getMergedState };
}
