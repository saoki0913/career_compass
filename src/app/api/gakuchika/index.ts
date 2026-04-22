export { getIdentity, verifyGakuchikaAccess, type Identity } from "./access";

export {
  getQuestionFromFastAPI,
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
