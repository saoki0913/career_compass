import { type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";

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

export interface MotivationConversationContext {
  conversationMode?: "slot_fill" | "deepdive";
  selectedIndustry?: string;
  selectedIndustrySource?: "company_field" | "company_override" | "user_selected";
  industryReason?: string;
  companyReason?: string;
  selectedRole?: string;
  selectedRoleSource?: "profile" | "company_doc" | "application_job_type" | "user_free_text";
  selfConnection?: string;
  desiredWork?: string;
  valueContribution?: string;
  differentiationReason?: string;
  // legacy fields kept for backward-compatible reads
  originExperience?: string;
  fitConnection?: string;
  userAnchorStrengths: string[];
  userAnchorEpisodes: string[];
  profileAnchorIndustries: string[];
  profileAnchorJobTypes: string[];
  companyAnchorKeywords: string[];
  companyRoleCandidates: string[];
  companyWorkCandidates: string[];
  turnCount?: number;
  deepdiveTurnCount?: number;
  questionStage: MotivationStage;
  stageAttemptCount: number;
  lastQuestionSignature?: string | null;
  lastQuestionSemanticSignature?: string | null;
  confirmedFacts: ConfirmedFacts;
  openSlots: string[];
  closedSlots?: MotivationStage[];
  recentlyClosedSlots?: MotivationStage[];
  weakSlotRetries?: Partial<Record<MotivationStage, number>>;
  slotStatusV2?: Partial<Record<MotivationStage, SlotStatusV2>>;
  draftBlockers?: MotivationStage[];
  slotStates?: Partial<Record<MotivationSlot, SlotState>>;
  slotSummaries?: Partial<Record<MotivationSlot, string | null>>;
  slotEvidenceSentences?: Partial<Record<MotivationSlot, string[]>>;
  slotIntentsAsked?: Partial<Record<MotivationSlot, string[]>>;
  reaskBudgetBySlot?: Partial<Record<MotivationSlot, number>>;
  forbiddenReasks?: ForbiddenReask[];
  unresolvedPoints?: string[];
  causalGaps?: CausalGap[];
  roleReason?: string | null;
  roleReasonState?: SlotState;
  unlockReason?: string | null;
  currentIntent?: string | null;
  nextAdvanceCondition?: string | null;
  lastQuestionMeta?: LastQuestionMeta | null;
  draftReady?: boolean;
  draftReadyUnlockedAt?: string | null;
}

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

const ALL_SLOTS: MotivationStage[] = [
  "industry_reason",
  "company_reason",
  "self_connection",
  "desired_work",
  "value_contribution",
  "differentiation",
];

function parseSlotState(value: unknown): SlotState | null {
  return value === "empty" || value === "rough" || value === "sufficient" || value === "locked"
    ? value
    : null;
}

function parseSlotStateMap(
  value: unknown,
): Partial<Record<MotivationSlot, SlotState>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      const state = parseSlotState(raw);
      return state && key !== "closing" ? [[key, state]] : [];
    }),
  ) as Partial<Record<MotivationSlot, SlotState>>;
}

function parseStringMap(value: unknown): Partial<Record<MotivationSlot, string | null>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) =>
      key !== "closing" ? [[key, typeof raw === "string" ? raw : null]] : [],
    ),
  ) as Partial<Record<MotivationSlot, string | null>>;
}

function parseStringArrayMap(value: unknown): Partial<Record<MotivationSlot, string[]>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) =>
      key !== "closing" ? [[key, parseStringArray(raw)]] : [],
    ),
  ) as Partial<Record<MotivationSlot, string[]>>;
}

function parseNumberMap(value: unknown): Partial<Record<MotivationSlot, number>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) =>
      key !== "closing" && typeof raw === "number" ? [[key, raw]] : [],
    ),
  ) as Partial<Record<MotivationSlot, number>>;
}

function parseForbiddenReasks(value: unknown): ForbiddenReask[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ForbiddenReask =>
    Boolean(
      item &&
      typeof item === "object" &&
      item.slot &&
      item.slot !== "closing" &&
      typeof item.intent === "string" &&
      typeof item.reason === "string",
    ),
  );
}

function parseCausalGaps(value: unknown): CausalGap[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CausalGap =>
    Boolean(
      item &&
      typeof item === "object" &&
      item.slot &&
      item.slot !== "closing" &&
      typeof item.id === "string" &&
      typeof item.reason === "string" &&
      typeof item.promptHint === "string",
    ),
  );
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function coerceQuestionStage(value: unknown): MotivationStage {
  if (value === "origin_experience" || value === "fit_connection") {
    return "self_connection";
  }
  if (value === "closing") {
    return "differentiation";
  }
  if (
    value === "industry_reason" ||
    value === "company_reason" ||
    value === "self_connection" ||
    value === "desired_work" ||
    value === "value_contribution" ||
    value === "differentiation"
  ) {
    return value;
  }
  return "industry_reason";
}

export function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { role: string; content: string; id?: string } =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
      )
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  } catch {
    return [];
  }
}

export function safeParseScores(json: string | null): MotivationScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      company_understanding: parsed.company_understanding ?? 0,
      self_analysis: parsed.self_analysis ?? 0,
      career_vision: parsed.career_vision ?? 0,
      differentiation: parsed.differentiation ?? 0,
    };
  } catch {
    return null;
  }
}

export function safeParseEvidenceCards(json: string | null): EvidenceCard[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed.filter(Boolean) as EvidenceCard[]) : [];
  } catch {
    return [];
  }
}

function inferConfirmedFacts(context: Partial<MotivationConversationContext>): ConfirmedFacts {
  const selfConnection = context.selfConnection || context.fitConnection || context.originExperience;
  return {
    industry_reason_confirmed: Boolean(context.industryReason),
    company_reason_confirmed: Boolean(context.companyReason),
    self_connection_confirmed: Boolean(selfConnection),
    desired_work_confirmed: Boolean(context.desiredWork),
    value_contribution_confirmed: Boolean(context.valueContribution),
    differentiation_confirmed: Boolean(context.differentiationReason),
  };
}

function buildOpenSlots(confirmedFacts: ConfirmedFacts): string[] {
  const slots: string[] = [];
  if (!confirmedFacts.industry_reason_confirmed) slots.push("industry_reason");
  if (!confirmedFacts.company_reason_confirmed) slots.push("company_reason");
  if (!confirmedFacts.self_connection_confirmed) slots.push("self_connection");
  if (!confirmedFacts.desired_work_confirmed) slots.push("desired_work");
  if (!confirmedFacts.value_contribution_confirmed) slots.push("value_contribution");
  if (!confirmedFacts.differentiation_confirmed) slots.push("differentiation");
  return slots;
}

export function safeParseConversationContext(json: string | null): MotivationConversationContext {
  if (!json) {
    return {
      ...DEFAULT_MOTIVATION_CONTEXT,
      confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS },
      openSlots: [...DEFAULT_MOTIVATION_CONTEXT.openSlots],
    };
  }

  try {
    const parsed = JSON.parse(json) as Partial<MotivationConversationContext> & {
      confirmedFacts?: Partial<ConfirmedFacts> & {
        origin_experience_confirmed?: boolean;
        fit_connection_confirmed?: boolean;
      };
      lastQuestionMeta?: LastQuestionMeta | null;
      questionStage?: MotivationStage | "origin_experience" | "fit_connection";
    };
    const inferredConfirmedFacts = inferConfirmedFacts(parsed);
    const legacySelfConnectionConfirmed = Boolean(
      parsed.confirmedFacts?.self_connection_confirmed ??
        parsed.confirmedFacts?.fit_connection_confirmed ??
        parsed.confirmedFacts?.origin_experience_confirmed,
    );
    const confirmedFacts: ConfirmedFacts = {
      ...DEFAULT_CONFIRMED_FACTS,
      ...inferredConfirmedFacts,
      ...(parsed.confirmedFacts || {}),
      self_connection_confirmed:
        parsed.confirmedFacts?.self_connection_confirmed ??
        legacySelfConnectionConfirmed ??
        inferredConfirmedFacts.self_connection_confirmed,
    };
    const selfConnection =
      typeof parsed.selfConnection === "string"
        ? parsed.selfConnection
        : typeof parsed.fitConnection === "string"
          ? parsed.fitConnection
          : typeof parsed.originExperience === "string"
            ? parsed.originExperience
            : undefined;

    return {
      ...DEFAULT_MOTIVATION_CONTEXT,
      conversationMode: parsed.conversationMode === "deepdive" ? "deepdive" : "slot_fill",
      selectedIndustry: typeof parsed.selectedIndustry === "string" ? parsed.selectedIndustry : undefined,
      selectedIndustrySource:
        typeof parsed.selectedIndustrySource === "string" ? parsed.selectedIndustrySource : undefined,
      industryReason: typeof parsed.industryReason === "string" ? parsed.industryReason : undefined,
      companyReason: typeof parsed.companyReason === "string" ? parsed.companyReason : undefined,
      selectedRole: typeof parsed.selectedRole === "string" ? parsed.selectedRole : undefined,
      selectedRoleSource: typeof parsed.selectedRoleSource === "string" ? parsed.selectedRoleSource : undefined,
      selfConnection,
      desiredWork: typeof parsed.desiredWork === "string" ? parsed.desiredWork : undefined,
      valueContribution:
        typeof parsed.valueContribution === "string" ? parsed.valueContribution : undefined,
      differentiationReason:
        typeof parsed.differentiationReason === "string" ? parsed.differentiationReason : undefined,
      originExperience:
        typeof parsed.originExperience === "string" ? parsed.originExperience : undefined,
      fitConnection: typeof parsed.fitConnection === "string" ? parsed.fitConnection : undefined,
      userAnchorStrengths: parseStringArray(parsed.userAnchorStrengths),
      userAnchorEpisodes: parseStringArray(parsed.userAnchorEpisodes),
      profileAnchorIndustries: parseStringArray(parsed.profileAnchorIndustries),
      profileAnchorJobTypes: parseStringArray(parsed.profileAnchorJobTypes),
      companyAnchorKeywords: parseStringArray(parsed.companyAnchorKeywords),
      companyRoleCandidates: parseStringArray(parsed.companyRoleCandidates),
      companyWorkCandidates: parseStringArray(parsed.companyWorkCandidates),
      turnCount: typeof parsed.turnCount === "number" ? parsed.turnCount : 0,
      deepdiveTurnCount: typeof parsed.deepdiveTurnCount === "number" ? parsed.deepdiveTurnCount : 0,
      questionStage: coerceQuestionStage(parsed.questionStage),
      stageAttemptCount: typeof parsed.stageAttemptCount === "number" ? parsed.stageAttemptCount : 0,
      lastQuestionSignature:
        typeof parsed.lastQuestionSignature === "string" ? parsed.lastQuestionSignature : null,
      lastQuestionSemanticSignature:
        typeof parsed.lastQuestionSemanticSignature === "string"
          ? parsed.lastQuestionSemanticSignature
          : null,
      confirmedFacts,
      openSlots:
        parseStringArray(parsed.openSlots).length > 0
          ? parseStringArray(parsed.openSlots)
          : buildOpenSlots(confirmedFacts),
      closedSlots: parseStringArray(parsed.closedSlots) as MotivationStage[],
      recentlyClosedSlots: parseStringArray(parsed.recentlyClosedSlots) as MotivationStage[],
      weakSlotRetries:
        parsed.weakSlotRetries && typeof parsed.weakSlotRetries === "object"
          ? Object.fromEntries(
              Object.entries(parsed.weakSlotRetries).filter(
                ([key, value]) =>
                  typeof key === "string" &&
                  typeof value === "number" &&
                  value >= 0,
              ),
            ) as Partial<Record<MotivationStage, number>>
          : {},
      slotStatusV2:
        parsed.slotStatusV2 && typeof parsed.slotStatusV2 === "object"
          ? Object.fromEntries(
              Object.entries(parsed.slotStatusV2).filter(
                ([key, value]) =>
                  typeof key === "string" &&
                  (value === "filled_strong" ||
                    value === "filled_weak" ||
                    value === "partial" ||
                    value === "missing"),
              ),
            ) as Partial<Record<MotivationStage, SlotStatusV2>>
          : {},
      draftBlockers: parseStringArray(parsed.draftBlockers) as MotivationStage[],
      slotStates: parseSlotStateMap(parsed.slotStates),
      slotSummaries: parseStringMap(parsed.slotSummaries),
      slotEvidenceSentences: parseStringArrayMap(parsed.slotEvidenceSentences),
      slotIntentsAsked: parseStringArrayMap(parsed.slotIntentsAsked),
      reaskBudgetBySlot: parseNumberMap(parsed.reaskBudgetBySlot),
      forbiddenReasks: parseForbiddenReasks(parsed.forbiddenReasks),
      unresolvedPoints: parseStringArray(parsed.unresolvedPoints),
      causalGaps: parseCausalGaps(parsed.causalGaps),
      roleReason: typeof parsed.roleReason === "string" ? parsed.roleReason : null,
      roleReasonState: parseSlotState(parsed.roleReasonState) ?? "empty",
      unlockReason: typeof parsed.unlockReason === "string" ? parsed.unlockReason : null,
      currentIntent: typeof parsed.currentIntent === "string" ? parsed.currentIntent : null,
      nextAdvanceCondition:
        typeof parsed.nextAdvanceCondition === "string" ? parsed.nextAdvanceCondition : null,
      lastQuestionMeta:
        parsed.lastQuestionMeta && typeof parsed.lastQuestionMeta === "object"
          ? {
              ...parsed.lastQuestionMeta,
              question_stage: parsed.lastQuestionMeta.question_stage
                ? coerceQuestionStage(parsed.lastQuestionMeta.question_stage)
                : parsed.lastQuestionMeta.question_stage,
            }
          : null,
      draftReady: typeof parsed.draftReady === "boolean" ? parsed.draftReady : undefined,
      draftReadyUnlockedAt:
        typeof parsed.draftReadyUnlockedAt === "string" ? parsed.draftReadyUnlockedAt : null,
    };
  } catch {
    return {
      ...DEFAULT_MOTIVATION_CONTEXT,
      confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS },
      openSlots: [...DEFAULT_MOTIVATION_CONTEXT.openSlots],
    };
  }
}

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

export function safeParseStageStatus(
  json: string | null,
  conversationContext?: MotivationConversationContext | null,
): StageStatus {
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object" && typeof parsed.current === "string") {
        return {
          current: coerceQuestionStage(parsed.current),
          completed: Array.isArray(parsed.completed)
            ? parsed.completed.map((stage: unknown) => coerceQuestionStage(stage))
            : [],
          pending: Array.isArray(parsed.pending)
            ? parsed.pending.map((stage: unknown) => coerceQuestionStage(stage))
            : [],
        };
      }
    } catch {
      // derive below
    }
  }

  const context = conversationContext || safeParseConversationContext(null);
  const completed: StageStatus["completed"] = [];
  if (context.confirmedFacts.industry_reason_confirmed) completed.push("industry_reason");
  if (context.confirmedFacts.company_reason_confirmed) completed.push("company_reason");
  if (context.confirmedFacts.self_connection_confirmed) completed.push("self_connection");
  if (context.confirmedFacts.desired_work_confirmed) completed.push("desired_work");
  if (context.confirmedFacts.value_contribution_confirmed) completed.push("value_contribution");
  if (context.confirmedFacts.differentiation_confirmed) completed.push("differentiation");
  const pending = ALL_SLOTS.filter(
    (stage) => stage !== context.questionStage && !completed.includes(stage),
  );
  return { current: context.questionStage, completed, pending };
}

export async function getMotivationConversationByCondition(whereClause: SQL<unknown> | undefined) {
  const [row] = await db.select().from(motivationConversations).where(whereClause).limit(1);
  return row ?? null;
}
