import {
  CONVERSATION_MODE_LABELS,
  INTENT_LABELS,
  STAGE_ANSWER_GUIDE,
  STAGE_LABELS,
  type ConversationMode,
  type EvidenceCard,
  type MotivationMessage,
  type MotivationSetupSnapshot,
  type MotivationStageKey,
  type RoleOptionsResponse,
  type RoleSelectionSource,
  type StageStatus,
  type MotivationProgress,
  type CausalGap,
} from "@/lib/motivation/ui";

// ---------------------------------------------------------------------------
// Input: subset of controller state consumed by business derivations
// ---------------------------------------------------------------------------

export interface MotivationViewModelInput {
  messages: MotivationMessage[];
  nextQuestion: string | null;
  questionCount: number;
  isDraftReady: boolean;
  isTextStreaming: boolean;
  isGeneratingDraft: boolean;
  isLocked: boolean;
  generatedDraft: string | null;
  questionStage: MotivationStageKey | null;
  stageStatus: StageStatus | null;
  conversationMode: ConversationMode;
  currentSlot: Exclude<MotivationStageKey, "closing"> | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  progress: MotivationProgress | null;
  coachingFocus: string | null;
  causalGaps: CausalGap[];
  evidenceCards: EvidenceCard[];
  evidenceSummary: string | null;
  roleOptionsData: RoleOptionsResponse | null;
  selectedIndustry: string;
  selectedRoleName: string;
  roleSelectionSource: RoleSelectionSource | null;
  customRoleInput: string;
  setupSnapshot: MotivationSetupSnapshot | null;
  company: { id: string; name: string; industry: string | null } | null;
}

// ---------------------------------------------------------------------------
// Output: derived business state
// ---------------------------------------------------------------------------

export interface MotivationViewModel {
  /** Whether the standalone next-question bubble should render outside the streaming flow */
  showStandaloneQuestion: boolean;
  /** Whether the user has an existing conversation (saved, has messages, or draft-ready) */
  hasSavedConversation: boolean;
  /** Whether the user has started chatting or has a generated draft */
  hasStartedConversation: boolean;
  /** Whether the role-options API says industry must be chosen */
  requiresIndustrySelection: boolean;
  /** Best-available industry value (selected > roleOptions > snapshot > company) */
  effectiveIndustry: string;
  /** Whether role + industry (if required) are both set */
  isSetupComplete: boolean;
  /** Whether we should show the setup screen (pre-conversation) */
  showSetupScreen: boolean;
  /** Whether setup fields should be disabled (conversation already started) */
  disableSetupEditing: boolean;
  /** Whether the user is using a free-text custom role */
  isCustomRoleActive: boolean;
  /** Whether we are in the post-draft deep-dive mode */
  isPostDraftMode: boolean;
  /** Human label for the current conversation mode */
  motivationModeLabel: string;
  /** Whether the "generate draft" button should be enabled */
  canGenerateDraft: boolean;
  /** The currently-active stage slot (excluding closing) */
  activeStage: Exclude<MotivationStageKey, "closing"> | null;
  /** Answer guide text for the current stage */
  answerGuide: string;
  /** Human label for the current intent (or null) */
  currentIntentLabel: string | null;
  /** Human label for the current slot being explored */
  currentSlotLabel: string | null;
  /** Helper text for the draft action bar */
  draftHelperText: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMotivationViewModel(input: MotivationViewModelInput): MotivationViewModel {
  const {
    messages,
    nextQuestion,
    questionCount,
    isDraftReady,
    isTextStreaming,
    isGeneratingDraft,
    isLocked,
    generatedDraft,
    questionStage,
    conversationMode,
    currentSlot,
    currentIntent,
    progress,
    roleOptionsData,
    selectedIndustry,
    selectedRoleName,
    roleSelectionSource,
    customRoleInput,
    setupSnapshot,
    company,
  } = input;

  // --- Standalone question visibility ---
  const showStandaloneQuestion =
    !isTextStreaming &&
    !!nextQuestion &&
    !(
      messages.length > 0 &&
      messages[messages.length - 1].role === "assistant" &&
      messages[messages.length - 1].content === nextQuestion
    );

  // --- Conversation existence ---
  const hasSavedConversation =
    setupSnapshot?.hasSavedConversation ||
    questionCount > 0 ||
    messages.length > 0 ||
    isDraftReady;

  const hasStartedConversation = messages.length > 0 || Boolean(generatedDraft);

  // --- Setup state ---
  const requiresIndustrySelection = Boolean(roleOptionsData?.requiresIndustrySelection);

  const effectiveIndustry =
    selectedIndustry ||
    roleOptionsData?.industry ||
    setupSnapshot?.resolvedIndustry ||
    company?.industry ||
    "";

  const isSetupComplete =
    Boolean(selectedRoleName.trim()) &&
    (!requiresIndustrySelection || Boolean(effectiveIndustry));

  const showSetupScreen = !hasStartedConversation;
  const disableSetupEditing = hasStartedConversation;

  const isCustomRoleActive =
    roleSelectionSource === "custom" && customRoleInput.trim().length > 0;

  // --- Conversation phase ---
  const isPostDraftMode = Boolean(generatedDraft?.trim()) && isDraftReady;
  const motivationModeLabel = CONVERSATION_MODE_LABELS[conversationMode];

  const canGenerateDraft =
    isDraftReady && messages.length >= 2 && !showSetupScreen;

  // --- Stage context ---
  const activeStage: Exclude<MotivationStageKey, "closing"> | null =
    currentSlot ||
    (questionStage !== "closing"
      ? (questionStage as Exclude<MotivationStageKey, "closing"> | null)
      : null);

  const answerGuide = activeStage
    ? STAGE_ANSWER_GUIDE[activeStage]
    : "1~2文で答えてください。";

  const currentIntentLabel = currentIntent
    ? INTENT_LABELS[currentIntent] || currentIntent
    : null;

  const currentSlotLabel =
    questionStage === "closing"
      ? CONVERSATION_MODE_LABELS[conversationMode]
      : progress?.current_slot_label ||
        (activeStage ? STAGE_LABELS[activeStage] : null);

  // --- Draft helper text ---
  const draftHelperText = deriveMotivationDraftHelperText({
    isGeneratingDraft,
    showSetupScreen,
    isPostDraftMode,
    isDraftReady,
    isLocked,
  });

  return {
    showStandaloneQuestion,
    hasSavedConversation,
    hasStartedConversation,
    requiresIndustrySelection,
    effectiveIndustry,
    isSetupComplete,
    showSetupScreen,
    disableSetupEditing,
    isCustomRoleActive,
    isPostDraftMode,
    motivationModeLabel,
    canGenerateDraft,
    activeStage,
    answerGuide,
    currentIntentLabel,
    currentSlotLabel,
    draftHelperText,
  };
}

// ---------------------------------------------------------------------------
// Pure helper (testable without React)
// ---------------------------------------------------------------------------

export function deriveMotivationDraftHelperText(flags: {
  isGeneratingDraft: boolean;
  showSetupScreen: boolean;
  isPostDraftMode: boolean;
  isDraftReady: boolean;
  isLocked: boolean;
}): string {
  if (flags.isGeneratingDraft)
    return "会話内容をもとに志望動機ESを生成しています。";
  if (flags.showSetupScreen)
    return "質問開始後に、会話内容をもとに志望動機ESを作成できます。";
  if (flags.isPostDraftMode)
    return "ES作成後の補足深掘りです。必要な材料だけを追加で整理できます。";
  if (!flags.isDraftReady)
    return "十分な材料が揃うと作成できます。会話は途中でも続けられます。";
  if (flags.isLocked)
    return "進行中の処理が終わると、志望動機ESを作成できます。";
  return "会話内容から志望動機ESを生成できます。必要なら生成後に追加で深掘りできます。";
}
