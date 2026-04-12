import {
  safeParseStageStatus,
  type CausalGap,
  type EvidenceCard,
  type Message,
  type MotivationConversationContext,
  type MotivationProgress,
  type MotivationScores,
  type MotivationSlot,
  type MotivationStage,
  type StageStatus,
} from "./conversation";

export type MotivationConversationMode = NonNullable<MotivationConversationContext["conversationMode"]>;

export interface MotivationSetupSnapshot {
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  requiresIndustrySelection: boolean;
  resolvedIndustry: string | null;
  isComplete: boolean;
  hasSavedConversation: boolean;
  requiresRestart: boolean;
}

export interface MotivationConversationPayload {
  messages: Message[];
  nextQuestion: string | null;
  questionCount: number;
  isDraftReady: boolean;
  generatedDraft: string | null;
  scores: MotivationScores | null;
  evidenceSummary: string | null;
  evidenceCards: EvidenceCard[];
  coachingFocus: string | null;
  riskFlags: string[];
  questionStage: MotivationStage;
  stageStatus: StageStatus | null;
  conversationMode: MotivationConversationMode;
  currentSlot: MotivationSlot | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  progress: MotivationProgress | null;
  causalGaps: CausalGap[];
  conversationContext: MotivationConversationContext;
  setup: MotivationSetupSnapshot;
  error: string | null;
}

function countLockedSlots(slotStates: MotivationConversationContext["slotStates"]): number {
  return Object.values(slotStates ?? {}).filter((state) => state === "locked").length;
}

function inferNextQuestion(
  messages: Message[],
  conversationContext: MotivationConversationContext,
  nextQuestion?: string | null,
): string | null {
  if (nextQuestion !== undefined) {
    return nextQuestion;
  }

  if (conversationContext.lastQuestionMeta?.questionText) {
    return conversationContext.lastQuestionMeta.questionText;
  }

  const lastMessage = messages.at(-1);
  return lastMessage?.role === "assistant" ? lastMessage.content : null;
}

function buildProgressFromContext(args: {
  conversationContext: MotivationConversationContext;
  currentSlot: MotivationSlot | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  conversationMode: MotivationConversationMode;
}): MotivationProgress | null {
  if (!args.conversationContext.slotStates) {
    return null;
  }

  return {
    completed: countLockedSlots(args.conversationContext.slotStates),
    total: 6,
    current_slot: args.currentSlot,
    current_slot_label: null,
    current_intent: args.currentIntent,
    next_advance_condition: args.nextAdvanceCondition,
    mode: args.conversationMode,
  };
}

export function buildMotivationEvidenceSummaryFromCards(
  cards: EvidenceCard[],
): string | null {
  if (cards.length === 0) {
    return null;
  }
  return cards
    .slice(0, 2)
    .map((card) => `${card.sourceId} ${card.title}: ${card.excerpt}`)
    .join(" / ");
}

export function buildMotivationSetupSnapshot(args: {
  conversationContext: MotivationConversationContext;
  resolvedIndustry: string | null;
  requiresIndustrySelection: boolean;
  isDraftReady: boolean;
  messages: Message[];
  questionCount: number;
  isComplete?: boolean;
  requiresRestart?: boolean;
}): MotivationSetupSnapshot {
  const hasIndustry = Boolean(
    args.conversationContext.selectedIndustry || args.resolvedIndustry,
  );
  const hasRole = Boolean(args.conversationContext.selectedRole);

  return {
    selectedIndustry: args.conversationContext.selectedIndustry || args.resolvedIndustry,
    selectedRole: args.conversationContext.selectedRole || null,
    selectedRoleSource: args.conversationContext.selectedRoleSource || null,
    requiresIndustrySelection: args.requiresIndustrySelection,
    resolvedIndustry: args.resolvedIndustry,
    isComplete:
      args.isComplete ??
      (hasRole && (!args.requiresIndustrySelection || hasIndustry)),
    requiresRestart: args.requiresRestart ?? false,
    hasSavedConversation:
      args.questionCount > 0 || args.messages.length > 0 || args.isDraftReady,
  };
}

export function buildMotivationConversationPayload(args: {
  messages: Message[];
  questionCount: number;
  isDraftReady: boolean;
  generatedDraft?: string | null;
  scores?: MotivationScores | null;
  conversationContext: MotivationConversationContext;
  persistedQuestionStage?: MotivationStage | null;
  stageStatus?: StageStatus | null;
  stageStatusValue?: unknown;
  evidenceSummary?: string | null;
  evidenceCards?: EvidenceCard[];
  coachingFocus?: string | null;
  riskFlags?: string[];
  conversationMode?: MotivationConversationMode | null;
  currentSlot?: MotivationSlot | null;
  currentIntent?: string | null;
  nextAdvanceCondition?: string | null;
  progress?: MotivationProgress | null;
  causalGaps?: CausalGap[];
  resolvedIndustry: string | null;
  requiresIndustrySelection: boolean;
  isSetupComplete?: boolean;
  nextQuestion?: string | null;
  error?: string | null;
}): MotivationConversationPayload {
  const questionStage = args.persistedQuestionStage ?? args.conversationContext.questionStage;
  const stageStatus =
    safeParseStageStatus(args.stageStatusValue ?? args.stageStatus, {
      ...args.conversationContext,
      questionStage,
    });
  const conversationMode =
    args.conversationMode ?? args.conversationContext.conversationMode ?? "slot_fill";
  const currentSlot =
    args.currentSlot ??
    (questionStage === "closing" ? null : questionStage);
  const currentIntent = args.currentIntent ?? args.conversationContext.currentIntent ?? null;
  const nextAdvanceCondition =
    args.nextAdvanceCondition ?? args.conversationContext.nextAdvanceCondition ?? null;
  const progress =
    args.progress ??
    buildProgressFromContext({
      conversationContext: args.conversationContext,
      currentSlot,
      currentIntent,
      nextAdvanceCondition,
      conversationMode,
    });
  const evidenceCards = args.evidenceCards ?? [];

  return {
    messages: args.messages,
    nextQuestion: inferNextQuestion(args.messages, args.conversationContext, args.nextQuestion),
    questionCount: args.questionCount,
    isDraftReady: args.isDraftReady,
    generatedDraft: args.generatedDraft ?? null,
    scores: args.scores ?? null,
    evidenceSummary: args.evidenceSummary ?? buildMotivationEvidenceSummaryFromCards(evidenceCards),
    evidenceCards,
    coachingFocus: args.coachingFocus ?? null,
    riskFlags: args.riskFlags ?? [],
    questionStage,
    stageStatus,
    conversationMode,
    currentSlot,
    currentIntent,
    nextAdvanceCondition,
    progress,
    causalGaps: args.causalGaps ?? args.conversationContext.causalGaps ?? [],
    conversationContext: args.conversationContext,
    setup: buildMotivationSetupSnapshot({
      conversationContext: args.conversationContext,
      resolvedIndustry: args.resolvedIndustry,
        requiresIndustrySelection: args.requiresIndustrySelection,
        isDraftReady: args.isDraftReady,
        messages: args.messages,
        questionCount: args.questionCount,
        isComplete:
          args.isSetupComplete ??
          Boolean(
            args.conversationContext.selectedRole &&
              (!args.requiresIndustrySelection || args.conversationContext.selectedIndustry || args.resolvedIndustry),
          ),
    }),
    error: args.error ?? null,
  };
}
