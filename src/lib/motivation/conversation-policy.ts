/**
 * Motivation conversation policy: stage progression logic, draft readiness,
 * and business rule constants.
 */
import type { ConfirmedFacts, MotivationConversationContext } from "./conversation";

export const DEFAULT_CONFIRMED_FACTS: ConfirmedFacts = {
  industry_reason_confirmed: false,
  company_reason_confirmed: false,
  self_connection_confirmed: false,
  desired_work_confirmed: false,
  value_contribution_confirmed: false,
  differentiation_confirmed: false,
};

export const DEFAULT_MOTIVATION_CONTEXT: MotivationConversationContext = {
  conversationMode: "slot_fill",
  draftSource: "conversation",
  userAnchorStrengths: [],
  userAnchorEpisodes: [],
  profileAnchorIndustries: [],
  profileAnchorJobTypes: [],
  companyAnchorKeywords: [],
  companyRoleCandidates: [],
  companyWorkCandidates: [],
  turnCount: 0,
  deepdiveTurnCount: 0,
  questionStage: "industry_reason",
  stageAttemptCount: 0,
  confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS },
  openSlots: [
    "industry_reason",
    "company_reason",
    "self_connection",
    "desired_work",
    "value_contribution",
    "differentiation",
  ],
  closedSlots: [],
  recentlyClosedSlots: [],
  weakSlotRetries: {},
  slotStatusV2: {},
  draftBlockers: [],
  slotStates: {},
  slotSummaries: {},
  slotEvidenceSentences: {},
  slotIntentsAsked: {},
  reaskBudgetBySlot: {},
  forbiddenReasks: [],
  unresolvedPoints: [],
  causalGaps: [],
  roleReason: null,
  roleReasonState: "empty",
  unlockReason: null,
  currentIntent: null,
  nextAdvanceCondition: null,
  lastQuestionMeta: null,
  draftReady: false,
  draftReadyUnlockedAt: null,
};

export function resolveDraftReadyState(
  conversationContext: MotivationConversationContext | null | undefined,
  legacyStatus?: "in_progress" | "completed" | null,
): { isDraftReady: boolean; unlockedAt: string | null } {
  if (typeof conversationContext?.draftReady === "boolean") {
    return {
      isDraftReady: conversationContext.draftReady,
      unlockedAt: conversationContext.draftReadyUnlockedAt ?? null,
    };
  }

  return {
    isDraftReady: legacyStatus === "completed",
    unlockedAt: null,
  };
}

export function mergeDraftReadyContext(
  conversationContext: MotivationConversationContext,
  nextDraftReady: boolean,
  unlockedAt = new Date().toISOString(),
): MotivationConversationContext {
  if (conversationContext.draftReady) {
    return {
      ...conversationContext,
      draftReady: true,
      draftReadyUnlockedAt: conversationContext.draftReadyUnlockedAt ?? null,
    };
  }

  if (!nextDraftReady) {
    return {
      ...conversationContext,
      draftReady: false,
      draftReadyUnlockedAt: conversationContext.draftReadyUnlockedAt ?? null,
    };
  }

  return {
    ...conversationContext,
    draftReady: true,
    draftReadyUnlockedAt: conversationContext.draftReadyUnlockedAt ?? unlockedAt,
  };
}
