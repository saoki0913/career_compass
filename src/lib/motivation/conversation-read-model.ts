/**
 * Motivation conversation read-model: parse/restore functions for DB row hydration.
 */
import type {
  CausalGap,
  ConfirmedFacts,
  EvidenceCard,
  ForbiddenReask,
  LastQuestionMeta,
  Message,
  MotivationConversationContext,
  MotivationScores,
  MotivationSlot,
  MotivationStage,
  SlotState,
  SlotStatusV2,
  StageStatus,
} from "./conversation";
import {
  DEFAULT_CONFIRMED_FACTS,
  DEFAULT_MOTIVATION_CONTEXT,
} from "./conversation";

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

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function safeParseJsonValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
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

export function safeParseMessages(value: unknown): Message[] {
  try {
    const parsed = safeParseJsonValue(value);
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

export function safeParseScores(value: unknown): MotivationScores | null {
  const parsed = safeParseJsonValue(value);
  if (!parsed || typeof parsed !== "object") return null;
  try {
    return {
      company_understanding: (parsed as MotivationScores).company_understanding ?? 0,
      self_analysis: (parsed as MotivationScores).self_analysis ?? 0,
      career_vision: (parsed as MotivationScores).career_vision ?? 0,
      differentiation: (parsed as MotivationScores).differentiation ?? 0,
    };
  } catch {
    return null;
  }
}

export function safeParseEvidenceCards(value: unknown): EvidenceCard[] {
  const parsed = safeParseJsonValue(value);
  if (!parsed) return [];
  try {
    return Array.isArray(parsed) ? (parsed.filter(Boolean) as EvidenceCard[]) : [];
  } catch {
    return [];
  }
}

export function safeParseConversationContext(value: unknown): MotivationConversationContext {
  const parsedValue = safeParseJsonValue(value);
  if (!parsedValue || typeof parsedValue !== "object") {
    return {
      ...DEFAULT_MOTIVATION_CONTEXT,
      confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS },
      openSlots: [...DEFAULT_MOTIVATION_CONTEXT.openSlots],
    };
  }

  try {
    const parsed = parsedValue as Partial<MotivationConversationContext> & {
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
      draftSource:
        parsed.draftSource === "profile_only" || parsed.draftSource === "conversation"
          ? parsed.draftSource
          : "conversation",
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

const ALL_SLOTS: MotivationStage[] = [
  "industry_reason",
  "company_reason",
  "self_connection",
  "desired_work",
  "value_contribution",
  "differentiation",
];

export function safeParseStageStatus(
  value: unknown,
  conversationContext?: MotivationConversationContext | null,
): StageStatus {
  const parsedValue = safeParseJsonValue(value);
  if (parsedValue && typeof parsedValue === "object") {
    try {
      const parsed = parsedValue as Partial<StageStatus>;
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
