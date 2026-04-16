import type { MotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import type {
  CausalGap,
  ConversationMode,
  EvidenceCard,
  MotivationMessage,
  MotivationProgress,
  MotivationSetupSnapshot,
  MotivationStageKey,
  RoleOptionsResponse,
  RoleSelectionSource,
  StageStatus,
} from "@/lib/motivation/ui";

export type ConversationPayload = Partial<
  Omit<
    MotivationConversationPayload,
    "questionStage" | "conversationMode" | "currentSlot" | "conversationContext" | "setup"
  >
> & {
  questionStage?: MotivationStageKey | null;
  conversationMode?: ConversationMode | null;
  currentSlot?: Exclude<MotivationStageKey, "closing"> | null;
  conversationContext?: {
    selectedIndustry?: string | null;
    selectedRole?: string | null;
    selectedRoleSource?: string | null;
  } | null;
  setup?: MotivationSetupSnapshot | null;
};

export type PendingCompleteData = {
  messages: MotivationMessage[];
  nextQuestion: string | null;
  questionCount: number;
  isDraftReady: boolean;
  draftReadyJustUnlocked: boolean;
  evidenceSummary: string | null;
  evidenceCards: EvidenceCard[];
  questionStage: MotivationStageKey | null;
  stageStatus: StageStatus | null;
  coachingFocus: string | null;
  conversationMode: ConversationMode;
  currentSlot: Exclude<MotivationStageKey, "closing"> | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  progress: MotivationProgress | null;
  causalGaps: CausalGap[];
};

export interface MotivationSetupState {
  roleOptionsData: RoleOptionsResponse | null;
  isRoleOptionsLoading: boolean;
  roleOptionsError: string | null;
  setupSnapshot: MotivationSetupSnapshot | null;
  selectedIndustry: string;
  selectedRoleName: string;
  roleSelectionSource: RoleSelectionSource | null;
  customRoleInput: string;
}
