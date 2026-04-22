export { getIdentity, verifyGakuchikaAccess, type Identity } from "./access";

export {
  FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS,
  getQuestionFromFastAPI,
  iterateGakuchikaFastApiSseEvents,
  consumeGakuchikaNextQuestionSse,
  type GakuchikaData,
  type ConsumeGakuchikaNextQuestionSseResult,
} from "./fastapi-stream";

export {
  buildConversationStatePatch,
  getGakuchikaNextAction,
  getDefaultConversationState,
  isDraftReady,
  isInterviewReady,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
  type BuildElement,
  type ConversationStage,
  type ConversationState,
  type DeepDiveFocus,
  type DraftQualityChecks,
  type FocusKey,
  type GakuchikaNextAction,
  type InputRichnessMode,
  type Message,
} from "@/lib/gakuchika/conversation-state";

export { CONVERSATION_CREDITS_PER_TURN } from "@/lib/credits";

export function buildHintPayload(state: import("@/lib/gakuchika/conversation-state").ConversationState | null) {
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
