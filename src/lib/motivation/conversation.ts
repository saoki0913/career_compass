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

export interface SuggestionOption {
  id: string;
  label: string;
  sourceType: "company" | "gakuchika" | "profile" | "application_job_type" | "hybrid";
  intent:
    | "industry_reason"
    | "company_reason"
    | "desired_work"
    | "origin_experience"
    | "fit_connection"
    | "differentiation"
    | "closing";
  evidenceSourceIds?: string[];
  rationale?: string | null;
  isTentative?: boolean;
}

export interface EvidenceCard {
  sourceId: string;
  title: string;
  contentType: string;
  excerpt: string;
  sourceUrl: string;
  relevanceLabel: string;
}

export interface StageStatus {
  current: MotivationConversationContext["questionStage"];
  completed: MotivationConversationContext["questionStage"][];
  pending: MotivationConversationContext["questionStage"][];
}

export interface ConfirmedFacts {
  industry_reason_confirmed: boolean;
  company_reason_confirmed: boolean;
  desired_work_confirmed: boolean;
  origin_experience_confirmed: boolean;
  fit_connection_confirmed: boolean;
  differentiation_confirmed: boolean;
}

export interface LastQuestionMeta {
  questionText?: string | null;
  question_signature?: string | null;
  question_stage?: MotivationConversationContext["questionStage"] | null;
  question_focus?: string | null;
  stage_attempt_count?: number | null;
  premise_mode?: string | null;
}

export interface MotivationConversationContext {
  selectedIndustry?: string;
  selectedIndustrySource?: "company_field" | "company_override" | "user_selected";
  industryReason?: string;
  companyReason?: string;
  selectedRole?: string;
  selectedRoleSource?: "profile" | "company_doc" | "application_job_type" | "user_free_text";
  desiredWork?: string;
  originExperience?: string;
  fitConnection?: string;
  differentiationReason?: string;
  userAnchorStrengths: string[];
  userAnchorEpisodes: string[];
  profileAnchorIndustries: string[];
  profileAnchorJobTypes: string[];
  companyAnchorKeywords: string[];
  companyRoleCandidates: string[];
  companyWorkCandidates: string[];
  questionStage:
    | "industry_reason"
    | "company_reason"
    | "desired_work"
    | "origin_experience"
    | "fit_connection"
    | "differentiation"
    | "closing";
  stageAttemptCount: number;
  lastQuestionSignature?: string | null;
  confirmedFacts: ConfirmedFacts;
  openSlots: string[];
  lastQuestionMeta?: LastQuestionMeta | null;
  draftReady?: boolean;
  draftReadyUnlockedAt?: string | null;
}

export const DEFAULT_CONFIRMED_FACTS: ConfirmedFacts = {
  industry_reason_confirmed: false,
  company_reason_confirmed: false,
  desired_work_confirmed: false,
  origin_experience_confirmed: false,
  fit_connection_confirmed: false,
  differentiation_confirmed: false,
};

export const DEFAULT_MOTIVATION_CONTEXT: MotivationConversationContext = {
  userAnchorStrengths: [],
  userAnchorEpisodes: [],
  profileAnchorIndustries: [],
  profileAnchorJobTypes: [],
  companyAnchorKeywords: [],
  companyRoleCandidates: [],
  companyWorkCandidates: [],
  questionStage: "industry_reason",
  stageAttemptCount: 0,
  confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS },
  openSlots: ["industry_reason", "company_reason", "desired_work", "origin_experience"],
  lastQuestionMeta: null,
  draftReady: false,
  draftReadyUnlockedAt: null,
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { role: string; content: string; id?: string } =>
        m && typeof m === "object" &&
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

export function safeParseSuggestionOptions(json: string | null): SuggestionOption[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(Boolean) as SuggestionOption[] : [];
  } catch {
    return [];
  }
}

export function safeParseEvidenceCards(json: string | null): EvidenceCard[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(Boolean) as EvidenceCard[] : [];
  } catch {
    return [];
  }
}

function inferConfirmedFacts(context: Partial<MotivationConversationContext>): ConfirmedFacts {
  return {
    industry_reason_confirmed: Boolean(context.industryReason),
    company_reason_confirmed: Boolean(context.companyReason),
    desired_work_confirmed: Boolean(context.desiredWork),
    origin_experience_confirmed: Boolean(context.originExperience),
    fit_connection_confirmed: Boolean(context.fitConnection),
    differentiation_confirmed: Boolean(context.differentiationReason),
  };
}

function buildOpenSlots(confirmedFacts: ConfirmedFacts): string[] {
  const slots: string[] = [];
  if (!confirmedFacts.industry_reason_confirmed) slots.push("industry_reason");
  if (!confirmedFacts.company_reason_confirmed) slots.push("company_reason");
  if (!confirmedFacts.desired_work_confirmed) slots.push("desired_work");
  if (!confirmedFacts.origin_experience_confirmed) slots.push("origin_experience");
  if (!confirmedFacts.fit_connection_confirmed) slots.push("fit_connection");
  if (!confirmedFacts.differentiation_confirmed) slots.push("differentiation");
  return slots;
}

export function safeParseConversationContext(json: string | null): MotivationConversationContext {
  if (!json) {
    return { ...DEFAULT_MOTIVATION_CONTEXT, confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS }, openSlots: [...DEFAULT_MOTIVATION_CONTEXT.openSlots] };
  }

  try {
    const parsed = JSON.parse(json) as Partial<MotivationConversationContext> & {
      confirmedFacts?: Partial<ConfirmedFacts>;
      lastQuestionMeta?: LastQuestionMeta | null;
    };
    const inferredConfirmedFacts = inferConfirmedFacts(parsed);
    const confirmedFacts: ConfirmedFacts = {
      ...inferredConfirmedFacts,
      ...DEFAULT_CONFIRMED_FACTS,
      ...(parsed.confirmedFacts || {}),
    };
    return {
      ...DEFAULT_MOTIVATION_CONTEXT,
      selectedIndustry: typeof parsed.selectedIndustry === "string" ? parsed.selectedIndustry : undefined,
      selectedIndustrySource: typeof parsed.selectedIndustrySource === "string" ? parsed.selectedIndustrySource : undefined,
      industryReason: typeof parsed.industryReason === "string" ? parsed.industryReason : undefined,
      companyReason: typeof parsed.companyReason === "string" ? parsed.companyReason : undefined,
      selectedRole: typeof parsed.selectedRole === "string" ? parsed.selectedRole : undefined,
      selectedRoleSource: typeof parsed.selectedRoleSource === "string" ? parsed.selectedRoleSource : undefined,
      desiredWork: typeof parsed.desiredWork === "string" ? parsed.desiredWork : undefined,
      originExperience: typeof parsed.originExperience === "string" ? parsed.originExperience : undefined,
      fitConnection: typeof parsed.fitConnection === "string" ? parsed.fitConnection : undefined,
      differentiationReason:
        typeof parsed.differentiationReason === "string" ? parsed.differentiationReason : undefined,
      userAnchorStrengths: parseStringArray(parsed.userAnchorStrengths),
      userAnchorEpisodes: parseStringArray(parsed.userAnchorEpisodes),
      profileAnchorIndustries: parseStringArray(parsed.profileAnchorIndustries),
      profileAnchorJobTypes: parseStringArray(parsed.profileAnchorJobTypes),
      companyAnchorKeywords: parseStringArray(parsed.companyAnchorKeywords),
      companyRoleCandidates: parseStringArray(parsed.companyRoleCandidates),
      companyWorkCandidates: parseStringArray(parsed.companyWorkCandidates),
      questionStage: typeof parsed.questionStage === "string" ? parsed.questionStage as MotivationConversationContext["questionStage"] : "industry_reason",
      stageAttemptCount: typeof parsed.stageAttemptCount === "number" ? parsed.stageAttemptCount : 0,
      lastQuestionSignature: typeof parsed.lastQuestionSignature === "string" ? parsed.lastQuestionSignature : null,
      confirmedFacts,
      openSlots: parseStringArray(parsed.openSlots).length > 0 ? parseStringArray(parsed.openSlots) : buildOpenSlots(confirmedFacts),
      lastQuestionMeta: parsed.lastQuestionMeta && typeof parsed.lastQuestionMeta === "object" ? parsed.lastQuestionMeta : null,
      draftReady: typeof parsed.draftReady === "boolean" ? parsed.draftReady : undefined,
      draftReadyUnlockedAt:
        typeof parsed.draftReadyUnlockedAt === "string" ? parsed.draftReadyUnlockedAt : null,
    };
  } catch {
    return { ...DEFAULT_MOTIVATION_CONTEXT, confirmedFacts: { ...DEFAULT_CONFIRMED_FACTS }, openSlots: [...DEFAULT_MOTIVATION_CONTEXT.openSlots] };
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

export function safeParseStageStatus(json: string | null, conversationContext?: MotivationConversationContext | null): StageStatus {
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object" && typeof parsed.current === "string") {
        return {
          current: parsed.current,
          completed: Array.isArray(parsed.completed) ? parsed.completed : [],
          pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        } as StageStatus;
      }
    } catch {
      // derive below
    }
  }

  const context = conversationContext || safeParseConversationContext(null);
  const completed: StageStatus["completed"] = [];
  if (context.confirmedFacts.industry_reason_confirmed) completed.push("industry_reason");
  if (context.confirmedFacts.company_reason_confirmed) completed.push("company_reason");
  if (context.confirmedFacts.desired_work_confirmed) completed.push("desired_work");
  if (context.confirmedFacts.origin_experience_confirmed) completed.push("origin_experience");
  if (context.confirmedFacts.fit_connection_confirmed) completed.push("fit_connection");
  if (context.confirmedFacts.differentiation_confirmed) completed.push("differentiation");
  const pending = ([
    "industry_reason",
    "company_reason",
    "desired_work",
    "origin_experience",
    "fit_connection",
    "differentiation",
    "closing",
  ] as const).filter((stage) => stage !== context.questionStage && !completed.includes(stage));
  return { current: context.questionStage, completed, pending };
}

export async function getMotivationConversationByCondition(whereClause: SQL<unknown> | undefined) {
  const [row] = await db
    .select()
    .from(motivationConversations)
    .where(whereClause)
    .limit(1);
  return row ?? null;
}
