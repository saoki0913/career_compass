/**
 * Motivation conversation barrel module.
 *
 * Type definitions live here. Implementation is split into:
 *   - conversation-read-model.ts   (parse / restore / hydration)
 *   - conversation-serialization.ts (serialize for DB persistence)
 *   - conversation-policy.ts       (stage logic, defaults, draft readiness)
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

export interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
}

export type MotivationStage =
  | "industry_reason"
  | "company_reason"
  | "self_connection"
  | "desired_work"
  | "value_contribution"
  | "differentiation"
  | "closing";

export type MotivationSlot = Exclude<MotivationStage, "closing">;
export type SlotState = "empty" | "rough" | "sufficient" | "locked";

export interface EvidenceCard {
  sourceId: string;
  title: string;
  contentType: string;
  excerpt: string;
  sourceUrl: string;
  relevanceLabel: string;
}

export interface StageStatus {
  current: MotivationStage;
  completed: MotivationStage[];
  pending: MotivationStage[];
}

export interface ConfirmedFacts {
  industry_reason_confirmed: boolean;
  company_reason_confirmed: boolean;
  self_connection_confirmed: boolean;
  desired_work_confirmed: boolean;
  value_contribution_confirmed: boolean;
  differentiation_confirmed: boolean;
}

export interface LastQuestionMeta {
  questionText?: string | null;
  question_signature?: string | null;
  semantic_question_signature?: string | null;
  question_stage?: MotivationStage | null;
  question_focus?: string | null;
  stage_attempt_count?: number | null;
  question_difficulty_level?: number | null;
  premise_mode?: string | null;
}

export type SlotStatusV2 = "filled_strong" | "filled_weak" | "partial" | "missing";

export interface ForbiddenReask {
  slot: MotivationSlot;
  intent: string;
  reason: string;
}

export interface CausalGap {
  id: string;
  slot: MotivationSlot;
  reason: string;
  promptHint: string;
}

export interface MotivationProgress {
  completed: number;
  total: number;
  current_slot: MotivationSlot | null;
  current_slot_label: string | null;
  current_intent: string | null;
  next_advance_condition: string | null;
  mode: "slot_fill" | "deepdive";
}

/**
 * Motivation conversation context.
 *
 * **Ownership:** the Python backend (`backend/app/routers/motivation.py` ->
 * `_capture_answer_into_context`) is the single source of truth for
 * answer capture and slot / stage transitions. The TS side only:
 *   1. Resolves `selectedIndustry` / `selectedRole` / `companyRoleCandidates`
 *      via `resolveMotivationInputs`
 *   2. Forwards raw `conversation_history` and the current `conversation_context`
 *      to FastAPI
 *   3. Writes the returned `conversationContext` back to Postgres as-is
 *
 * Fields marked `Python-owned` below must not be mutated on the TS side.
 */
export interface MotivationConversationContext {
  /** Python-owned; read-only on TS side */
  conversationMode?: "slot_fill" | "deepdive";
  draftSource?: "conversation" | "profile_only";
  selectedIndustry?: string;
  selectedIndustrySource?: "company_field" | "company_override" | "user_selected";
  /** Python-owned; read-only on TS side */
  industryReason?: string;
  /** Python-owned; read-only on TS side */
  companyReason?: string;
  selectedRole?: string;
  selectedRoleSource?: "profile" | "company_doc" | "application_job_type" | "user_free_text";
  /** Python-owned; read-only on TS side */
  selfConnection?: string;
  /** Python-owned; read-only on TS side */
  desiredWork?: string;
  /** Python-owned; read-only on TS side */
  valueContribution?: string;
  /** Python-owned; read-only on TS side */
  differentiationReason?: string;
  // legacy fields kept for backward-compatible reads
  /** Python-owned; read-only on TS side */
  originExperience?: string;
  /** Python-owned; read-only on TS side */
  fitConnection?: string;
  userAnchorStrengths: string[];
  userAnchorEpisodes: string[];
  profileAnchorIndustries: string[];
  profileAnchorJobTypes: string[];
  companyAnchorKeywords: string[];
  companyRoleCandidates: string[];
  companyWorkCandidates: string[];
  /** Python-owned; read-only on TS side */
  turnCount?: number;
  /** Python-owned; read-only on TS side */
  deepdiveTurnCount?: number;
  /** Python-owned; read-only on TS side */
  questionStage: MotivationStage;
  stageAttemptCount: number;
  lastQuestionSignature?: string | null;
  lastQuestionSemanticSignature?: string | null;
  /** Python-owned; read-only on TS side */
  confirmedFacts: ConfirmedFacts;
  /** Python-owned; read-only on TS side */
  openSlots: string[];
  /** Python-owned; read-only on TS side */
  closedSlots?: MotivationStage[];
  recentlyClosedSlots?: MotivationStage[];
  weakSlotRetries?: Partial<Record<MotivationStage, number>>;
  slotStatusV2?: Partial<Record<MotivationStage, SlotStatusV2>>;
  draftBlockers?: MotivationStage[];
  /** Python-owned; read-only on TS side */
  slotStates?: Partial<Record<MotivationSlot, SlotState>>;
  /** Python-owned; read-only on TS side */
  slotSummaries?: Partial<Record<MotivationSlot, string | null>>;
  /** Python-owned; read-only on TS side */
  slotEvidenceSentences?: Partial<Record<MotivationSlot, string[]>>;
  slotIntentsAsked?: Partial<Record<MotivationSlot, string[]>>;
  reaskBudgetBySlot?: Partial<Record<MotivationSlot, number>>;
  forbiddenReasks?: ForbiddenReask[];
  unresolvedPoints?: string[];
  /** Python-owned; read-only on TS side */
  causalGaps?: CausalGap[];
  roleReason?: string | null;
  roleReasonState?: SlotState;
  unlockReason?: string | null;
  currentIntent?: string | null;
  nextAdvanceCondition?: string | null;
  lastQuestionMeta?: LastQuestionMeta | null;
  /** Python-owned; read-only on TS side */
  draftReady?: boolean;
  draftReadyUnlockedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Re-exports from sub-modules (barrel)
// ---------------------------------------------------------------------------

// Policy: defaults, stage logic, draft readiness
export {
  DEFAULT_CONFIRMED_FACTS,
  DEFAULT_MOTIVATION_CONTEXT,
  resolveDraftReadyState,
  mergeDraftReadyContext,
} from "./conversation-policy";

// Read-model: parse / restore / hydration
export {
  safeParseMessages,
  safeParseScores,
  safeParseEvidenceCards,
  safeParseConversationContext,
  safeParseStageStatus,
} from "./conversation-read-model";

// Serialization: DB persistence helpers
export {
  serializeMessages,
  serializeScores,
  serializeConversationContext,
  serializeEvidenceCards,
  serializeStageStatus,
} from "./conversation-serialization";
