/**
 * Re-export shim: implementation moved to @/lib/interview/persistence.
 * Kept for backward-compatible test mocks and any direct imports.
 */
export {
  ensureInterviewConversation,
  listInterviewTurnEvents,
  resetInterviewConversation,
  saveInterviewConversationProgress,
  saveInterviewFeedbackHistory,
  saveInterviewFeedbackSatisfaction,
  saveInterviewTurnEvent,
} from "@/lib/interview/persistence";

export type { InterviewVersionMetadata } from "@/lib/interview/persistence";
