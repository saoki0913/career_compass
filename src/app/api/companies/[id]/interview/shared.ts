import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  documents,
  gakuchikaContents,
  interviewConversations,
  interviewFeedbackHistories,
  interviewTurnEvents,
  jobTypes,
  motivationConversations,
} from "@/lib/db/schema";
import {
  getInterviewCompanySeed,
  getInterviewIndustrySeed,
} from "@/lib/interview/company-seeds";
import {
  canonicalizeInterviewFormat,
  classifyInterviewRoleTrack,
  INTERVIEW_STAGE_OPTIONS,
  INTERVIEWER_TYPE_OPTIONS,
  ROLE_TRACK_OPTIONS,
  SELECTION_TYPE_OPTIONS,
  STRICTNESS_MODE_OPTIONS,
  createInitialInterviewTurnState,
  getInterviewStageStatus,
  normalizeInterviewTurnState,
  type InterviewFormat,
  type InterviewPlan,
  type InterviewRoleTrack,
  type InterviewRoundStage,
  type InterviewSelectionType,
  type InterviewStageStatus,
  type InterviewStrictnessMode,
  type InterviewTurnMeta,
  type InterviewTurnState,
  type InterviewerType,
} from "@/lib/interview/session";
import {
  hydrateInterviewTurnStateFromRow,
  parseInterviewTurnMeta,
  safeParseInterviewFeedback,
  safeParseInterviewMessages,
  type InterviewFeedback,
  type InterviewMessage,
} from "@/lib/interview/conversation";
import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import { normalizeInterviewPersistenceError } from "./persistence-errors";

export type InterviewMaterialCard = {
  label: string;
  text: string;
  kind?:
    | "motivation"
    | "gakuchika"
    | "es"
    | "academic"
    | "research"
    | "industry_seed"
    | "company_seed";
};

export type InterviewSetupState = {
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  resolvedIndustry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  roleTrack: InterviewRoleTrack;
  interviewFormat: InterviewFormat;
  selectionType: InterviewSelectionType;
  interviewStage: InterviewRoundStage;
  interviewerType: InterviewerType;
  strictnessMode: InterviewStrictnessMode;
};

export type InterviewFeedbackHistoryItem = {
  id: string;
  overallComment: string;
  scores: InterviewFeedback["scores"];
  strengths: string[];
  improvements: string[];
  consistencyRisks: string[];
  weakestQuestionType: string | null;
  weakestTurnId: string | null;
  weakestQuestionSnapshot: string | null;
  weakestAnswerSnapshot: string | null;
  improvedAnswer: string;
  nextPreparation: string[];
  premiseConsistency: number;
  satisfactionScore: number | null;
  sourceQuestionCount: number;
  createdAt: string;
};

export type HydratedInterviewConversation = {
  id: string;
  status: "setup_pending" | "in_progress" | "question_flow_completed" | "feedback_completed";
  messages: InterviewMessage[];
  turnState: InterviewTurnState;
  turnMeta: InterviewTurnMeta | null;
  plan: InterviewPlan | null;
  stageStatus: InterviewStageStatus;
  questionCount: number;
  questionFlowCompleted: boolean;
  feedback: InterviewFeedback | null;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  roleTrack: InterviewRoleTrack | null;
  interviewFormat: InterviewFormat | null;
  selectionType: InterviewSelectionType | null;
  interviewStage: InterviewRoundStage | null;
  interviewerType: InterviewerType | null;
  strictnessMode: InterviewStrictnessMode | null;
  isLegacySession: boolean;
};

type PersistedInterviewSetup = {
  roleTrack?: string | null;
  interviewFormat?: string | null;
  selectionType?: string | null;
  interviewStage?: string | null;
  interviewerType?: string | null;
  strictnessMode?: string | null;
};

function clipText(value: string | null | undefined, maxLength = 500) {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength).trim()}...`;
}

function buildCompanySummary(input: {
  companyName: string;
  industry: string | null;
  role: string | null;
  notes: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
}) {
  return [
    `事業: ${input.companyName}${input.industry ? ` / ${input.industry}` : ""}`,
    input.role ? `選考上の主対象職種: ${input.role}` : "",
    input.notes ? `カルチャー / 補足: ${clipText(input.notes, 600)}` : "",
    input.recruitmentUrl ? `採用URL: ${input.recruitmentUrl}` : "",
    input.corporateUrl ? `企業URL: ${input.corporateUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMotivationSummary(input: {
  generatedDraft: string | null | undefined;
  selectedRole: string | null | undefined;
  desiredWork: string | null | undefined;
  messages: string | null | undefined;
}) {
  if (input.generatedDraft) {
    return clipText(input.generatedDraft, 900);
  }

  const messageTrail = safeParseInterviewMessages(input.messages)
    .slice(-4)
    .map((message) => message.content)
    .join(" ");

  return clipText(
    [
      input.selectedRole ? `職種理由: ${input.selectedRole}` : "",
      input.desiredWork ? `やりたい仕事: ${input.desiredWork}` : "",
      messageTrail ? `経験接続: ${messageTrail}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    900,
  );
}

function buildGakuchikaSummary(rows: Array<{ title: string; summary: string | null }>) {
  return rows
    .map((row) => {
      const summary = clipText(row.summary, 320);
      return summary ? `${row.title}: 役割 / 行動 / 結果 / 再現性 -> ${summary}` : row.title;
    })
    .filter(Boolean)
    .join("\n");
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseFeedbackScores(value: string | null | undefined): InterviewFeedback["scores"] {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as InterviewFeedback["scores"]) : {};
  } catch {
    return {};
  }
}

export function normalizeInterviewPlanValue(value: unknown): InterviewPlan | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<InterviewPlan> & {
    interview_type?: unknown;
    priority_topics?: unknown;
    opening_topic?: unknown;
    must_cover_topics?: unknown;
    risk_topics?: unknown;
    suggested_timeflow?: unknown;
  };

  return {
    interviewType:
      typeof parsed.interviewType === "string"
        ? parsed.interviewType
        : typeof parsed.interview_type === "string"
          ? parsed.interview_type
          : "new_grad_behavioral",
    priorityTopics: Array.isArray(parsed.priorityTopics)
      ? parsed.priorityTopics.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.priority_topics)
        ? parsed.priority_topics.filter((item): item is string => typeof item === "string")
        : [],
    openingTopic:
      typeof parsed.openingTopic === "string"
        ? parsed.openingTopic
        : typeof parsed.opening_topic === "string"
          ? parsed.opening_topic
          : null,
    mustCoverTopics: Array.isArray(parsed.mustCoverTopics)
      ? parsed.mustCoverTopics.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.must_cover_topics)
        ? parsed.must_cover_topics.filter((item): item is string => typeof item === "string")
        : [],
    riskTopics: Array.isArray(parsed.riskTopics)
      ? parsed.riskTopics.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.risk_topics)
        ? parsed.risk_topics.filter((item): item is string => typeof item === "string")
        : [],
    suggestedTimeflow: Array.isArray(parsed.suggestedTimeflow)
      ? parsed.suggestedTimeflow.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.suggested_timeflow)
        ? parsed.suggested_timeflow.filter((item): item is string => typeof item === "string")
        : [],
  };
}

function parseInterviewPlan(value: string | null | undefined): InterviewPlan | null {
  if (!value) return null;
  try {
    return normalizeInterviewPlanValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseEnumValue<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function inferSelectionType(applicationTypes: string[]): InterviewSelectionType {
  return applicationTypes.some((type) => ["summer_intern", "fall_intern", "winter_intern"].includes(type))
    ? "internship"
    : "fulltime";
}

function inferInterviewStage(companyStatus: string | null | undefined): InterviewRoundStage {
  if (companyStatus === "final_interview") return "final";
  if (companyStatus === "interview_1" || companyStatus === "interview_2" || companyStatus === "waiting_result") {
    return "mid";
  }
  return "early";
}

function inferInterviewerType(stage: InterviewRoundStage): InterviewerType {
  if (stage === "final") return "executive";
  if (stage === "early") return "hr";
  return "line_manager";
}

function pickSummaryFromTexts(
  texts: string[],
  keywords: RegExp,
  maxLength = 700,
) {
  const matched = texts.filter((text) => keywords.test(text)).slice(0, 3);
  const joined = matched.join("\n");
  return joined ? clipText(joined, maxLength) : null;
}

async function getOwnedCompany(companyId: string, identity: RequestIdentity) {
  const [company] = await db
    .select()
    .from(companies)
    .where(
      identity.userId
        ? and(eq(companies.id, companyId), eq(companies.userId, identity.userId))
        : and(eq(companies.id, companyId), eq(companies.guestId, identity.guestId!)),
    )
    .limit(1);

  return company ?? null;
}

async function fetchApplicationContext(identity: RequestIdentity, companyId: string) {
  const rows = await db
    .select({
      applicationType: applications.type,
      jobTypeName: jobTypes.name,
    })
    .from(applications)
    .leftJoin(jobTypes, eq(jobTypes.applicationId, applications.id))
    .where(
      identity.userId
        ? and(eq(applications.companyId, companyId), eq(applications.userId, identity.userId))
        : and(eq(applications.companyId, companyId), eq(applications.guestId, identity.guestId!)),
    );

  return {
    applicationTypes: rows.flatMap((row) => (row.applicationType ? [row.applicationType] : [])),
    applicationRoles: rows
      .map((row) => row.jobTypeName?.trim())
      .filter((value): value is string => Boolean(value)),
  };
}

function buildSeedMaterials(companyName: string, industry: string | null): InterviewMaterialCard[] {
  const industrySeed = getInterviewIndustrySeed(industry);
  const companySeed = getInterviewCompanySeed(industry, companyName);
  const materials: InterviewMaterialCard[] = [];

  if (industrySeed) {
    materials.push({
      label: "業界共通論点",
      kind: "industry_seed",
      text: [...industrySeed.commonTopics, ...industrySeed.watchouts].join(" / "),
    });
  }

  if (companySeed) {
    materials.push({
      label: "企業固有論点",
      kind: "company_seed",
      text: [...companySeed.companyTopics, ...companySeed.roleTopics, ...companySeed.cultureTopics].join(" / "),
    });
  }

  return materials;
}

function buildSetupState(input: {
  companyName: string;
  companyIndustry: string | null;
  companyStatus: string | null | undefined;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  applicationTypes: string[];
  applicationRoles: string[];
  persisted?: PersistedInterviewSetup | null;
}): InterviewSetupState {
  const resolution = resolveMotivationRoleContext({
    companyName: input.companyName,
    companyIndustry: input.companyIndustry,
    selectedIndustry: input.selectedIndustry,
    applicationRoles: input.applicationRoles,
  });

  const selectedRole = input.selectedRole;
  const interviewStage = parseEnumValue(
    input.persisted?.interviewStage,
    INTERVIEW_STAGE_OPTIONS,
    inferInterviewStage(input.companyStatus),
  );

  return {
    selectedIndustry: input.selectedIndustry || resolution.resolvedIndustry,
    selectedRole,
    selectedRoleSource: input.selectedRoleSource,
    resolvedIndustry: resolution.resolvedIndustry,
    requiresIndustrySelection: resolution.requiresIndustrySelection,
    industryOptions: [...resolution.industryOptions],
    roleTrack: parseEnumValue(
      input.persisted?.roleTrack,
      ROLE_TRACK_OPTIONS,
      classifyInterviewRoleTrack(selectedRole),
    ),
    interviewFormat: canonicalizeInterviewFormat(input.persisted?.interviewFormat),
    selectionType: parseEnumValue(
      input.persisted?.selectionType,
      SELECTION_TYPE_OPTIONS,
      inferSelectionType(input.applicationTypes),
    ),
    interviewStage,
    interviewerType: parseEnumValue(
      input.persisted?.interviewerType,
      INTERVIEWER_TYPE_OPTIONS,
      inferInterviewerType(interviewStage),
    ),
    strictnessMode: parseEnumValue(
      input.persisted?.strictnessMode,
      STRICTNESS_MODE_OPTIONS,
      "standard",
    ),
  };
}

function isLegacyInterviewConversation(row: {
  turnStateJson?: string | null;
  roleTrack?: string | null;
  interviewFormat?: string | null;
  selectionType?: string | null;
  interviewStage?: string | null;
  interviewerType?: string | null;
  strictnessMode?: string | null;
} | null): boolean {
  if (!row) return false;
  return !row.turnStateJson ||
    !row.roleTrack ||
    !row.interviewFormat ||
    !row.selectionType ||
    !row.interviewStage ||
    !row.interviewerType ||
    !row.strictnessMode;
}

async function loadInterviewPersistence(companyId: string, identity: RequestIdentity) {
  const [conversation, feedbackRows] = await Promise.all([
    db
      .select()
      .from(interviewConversations)
      .where(
        identity.userId
          ? and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.userId, identity.userId))
          : and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.guestId, identity.guestId!)),
      )
      .limit(1),
    db
      .select()
      .from(interviewFeedbackHistories)
      .where(
        identity.userId
          ? and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.userId, identity.userId))
          : and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.guestId, identity.guestId!)),
      )
      .orderBy(desc(interviewFeedbackHistories.createdAt))
      .limit(8),
  ]);

  return {
    activeConversation: conversation[0] ?? null,
    feedbackRows,
  };
}

export function validateInterviewMessages(value: unknown): InterviewMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.filter(
    (message): message is InterviewMessage =>
      !!message &&
      typeof message === "object" &&
      ((message as { role?: string }).role === "user" ||
        (message as { role?: string }).role === "assistant") &&
      typeof (message as { content?: unknown }).content === "string",
  );

  if (messages.length !== value.length) return null;

  return messages.map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }));
}

export function validateInterviewTurnState(value: unknown): InterviewTurnState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return normalizeInterviewTurnState(value as Partial<InterviewTurnState>);
}

export async function buildInterviewContext(companyId: string, identity: RequestIdentity) {
  const company = await getOwnedCompany(companyId, identity);
  if (!company) {
    return null;
  }

  let motivationConversation: Array<{
    generatedDraft: string | null;
    messages: string | null;
    selectedRole: string | null;
    selectedRoleSource: string | null;
    desiredWork: string | null;
  }> = [];
  let gakuchikaRows: Array<{ title: string; summary: string | null }> = [];
  let documentRows: Array<{ title: string; content: string | null; esCategory: string | null }> = [];
  let persistence = {
    activeConversation: null,
    feedbackRows: [],
  } as unknown as Awaited<ReturnType<typeof loadInterviewPersistence>>;
  let applicationContext = {
    applicationTypes: [],
    applicationRoles: [],
  } as Awaited<ReturnType<typeof fetchApplicationContext>>;

  try {
    [motivationConversation, gakuchikaRows, documentRows, persistence, applicationContext] =
      await Promise.all([
        db
          .select({
            generatedDraft: motivationConversations.generatedDraft,
            messages: motivationConversations.messages,
            selectedRole: motivationConversations.selectedRole,
            selectedRoleSource: motivationConversations.selectedRoleSource,
            desiredWork: motivationConversations.desiredWork,
          })
          .from(motivationConversations)
          .where(
            identity.userId
              ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, identity.userId))
              : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, identity.guestId!)),
          )
          .limit(1),
        db
          .select({
            title: gakuchikaContents.title,
            summary: gakuchikaContents.summary,
          })
          .from(gakuchikaContents)
          .where(
            identity.userId
              ? and(eq(gakuchikaContents.userId, identity.userId), isNotNull(gakuchikaContents.summary))
              : and(eq(gakuchikaContents.guestId, identity.guestId!), isNotNull(gakuchikaContents.summary)),
          )
          .orderBy(desc(gakuchikaContents.updatedAt))
          .limit(3),
        db
          .select({
            title: documents.title,
            content: documents.content,
            esCategory: documents.esCategory,
          })
          .from(documents)
          .where(
            identity.userId
              ? and(
                  eq(documents.userId, identity.userId),
                  eq(documents.companyId, companyId),
                  eq(documents.type, "es"),
                  ne(documents.status, "deleted"),
                )
              : and(
                  eq(documents.guestId, identity.guestId!),
                  eq(documents.companyId, companyId),
                  eq(documents.type, "es"),
                  ne(documents.status, "deleted"),
                ),
          )
          .orderBy(desc(documents.updatedAt))
          .limit(8),
        loadInterviewPersistence(companyId, identity),
        fetchApplicationContext(identity, companyId),
      ]);
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId,
        operation: "interview:build-context",
      }) ?? error
    );
  }

  const motivation = motivationConversation[0] ?? null;
  const activeConversation = persistence.activeConversation;
  const feedbackRows = persistence.feedbackRows;

  const motivationSummary = buildMotivationSummary({
    generatedDraft: motivation?.generatedDraft,
    selectedRole: motivation?.selectedRole,
    desiredWork: motivation?.desiredWork,
    messages: motivation?.messages,
  });

  const gakuchikaSummary = buildGakuchikaSummary(gakuchikaRows);

  const textCandidates = documentRows.map((doc) => `${doc.title}: ${clipText(doc.content, 280)}`);
  const academicSummary =
    pickSummaryFromTexts(textCandidates, /(ゼミ|卒論|学業|授業|専攻|学ん|勉強)/i) ??
    pickSummaryFromTexts(textCandidates.filter((_, index) => documentRows[index]?.esCategory === "interview_prep"), /(ゼミ|卒論|学業|授業|専攻|学ん|勉強|研究)/i);
  const researchSummary = pickSummaryFromTexts(textCandidates, /(研究|実験|分析|論文|研究室|テーマ|データ)/i);

  const esSummary = documentRows
    .slice(0, 4)
    .map((doc) => `${doc.title}: ${clipText(doc.content, 260)}`)
    .filter(Boolean)
    .join("\n");

  const selectedIndustry = activeConversation?.selectedIndustry ?? company.industry ?? null;
  const setup = buildSetupState({
    companyName: company.name,
    companyIndustry: company.industry,
    companyStatus: company.status,
    selectedIndustry,
    selectedRole: activeConversation?.selectedRole ?? motivation?.selectedRole ?? null,
    selectedRoleSource: activeConversation?.selectedRoleSource ?? motivation?.selectedRoleSource ?? null,
    applicationTypes: applicationContext.applicationTypes,
    applicationRoles: applicationContext.applicationRoles,
    persisted: activeConversation
      ? {
          roleTrack: activeConversation.roleTrack,
          interviewFormat: activeConversation.interviewFormat,
          selectionType: activeConversation.selectionType,
          interviewStage: activeConversation.interviewStage,
          interviewerType: activeConversation.interviewerType,
          strictnessMode: activeConversation.strictnessMode,
        }
      : null,
  });

  const companySummary = buildCompanySummary({
    companyName: company.name,
    industry: setup.resolvedIndustry,
    role: setup.selectedRole,
    notes: company.notes,
    recruitmentUrl: company.recruitmentUrl,
    corporateUrl: company.corporateUrl,
  });

  const materials: InterviewMaterialCard[] = [];
  if (motivationSummary) materials.push({ label: "志望動機", text: motivationSummary, kind: "motivation" });
  if (gakuchikaSummary) materials.push({ label: "ガクチカ", text: gakuchikaSummary, kind: "gakuchika" });
  if (academicSummary) materials.push({ label: "学業 / ゼミ / 卒論", text: academicSummary, kind: "academic" });
  if (researchSummary) materials.push({ label: "研究", text: researchSummary, kind: "research" });
  if (esSummary) materials.push({ label: "関連ES", text: esSummary, kind: "es" });
  materials.push(...buildSeedMaterials(company.name, setup.resolvedIndustry));

  const turnState = hydrateInterviewTurnStateFromRow(activeConversation);
  const plan = parseInterviewPlan(activeConversation?.interviewPlanJson);
  const stageStatus = getInterviewStageStatus({
    currentTopicLabel: turnState.currentTopic,
    coveredTopics: turnState.coveredTopics,
    remainingTopics: turnState.remainingTopics,
  });
  const hydratedConversation: HydratedInterviewConversation | null = activeConversation
    ? {
        id: activeConversation.id,
        status: activeConversation.status,
        messages: safeParseInterviewMessages(activeConversation.messages),
        turnState,
        turnMeta: parseInterviewTurnMeta(activeConversation.turnMetaJson),
        plan,
        stageStatus,
        questionCount: activeConversation.questionCount ?? turnState.turnCount,
        questionFlowCompleted: Boolean(activeConversation.questionFlowCompleted),
        feedback: safeParseInterviewFeedback(activeConversation.activeFeedbackDraft),
        selectedIndustry: activeConversation.selectedIndustry,
        selectedRole: activeConversation.selectedRole,
        selectedRoleSource: activeConversation.selectedRoleSource,
        roleTrack: parseEnumValue(activeConversation.roleTrack, ROLE_TRACK_OPTIONS, setup.roleTrack),
        interviewFormat: canonicalizeInterviewFormat(activeConversation.interviewFormat ?? setup.interviewFormat),
        selectionType: parseEnumValue(
          activeConversation.selectionType,
          SELECTION_TYPE_OPTIONS,
          setup.selectionType,
        ),
        interviewStage: parseEnumValue(
          activeConversation.interviewStage,
          INTERVIEW_STAGE_OPTIONS,
          setup.interviewStage,
        ),
        interviewerType: parseEnumValue(
          activeConversation.interviewerType,
          INTERVIEWER_TYPE_OPTIONS,
          setup.interviewerType,
        ),
        strictnessMode: parseEnumValue(
          activeConversation.strictnessMode,
          STRICTNESS_MODE_OPTIONS,
          setup.strictnessMode,
        ),
        isLegacySession: isLegacyInterviewConversation(activeConversation),
      }
    : null;

  const feedbackHistories: InterviewFeedbackHistoryItem[] = feedbackRows.map((row) => ({
    id: row.id,
    overallComment: row.overallComment,
    scores: parseFeedbackScores(row.scores),
    strengths: parseJsonArray(row.strengths),
    improvements: parseJsonArray(row.improvements),
    consistencyRisks: parseJsonArray(row.consistencyRisks),
    weakestQuestionType: row.weakestQuestionType ?? null,
    weakestTurnId: row.weakestTurnId ?? null,
    weakestQuestionSnapshot: row.weakestQuestionSnapshot ?? null,
    weakestAnswerSnapshot: row.weakestAnswerSnapshot ?? null,
    improvedAnswer: row.improvedAnswer,
    nextPreparation: parseJsonArray(row.preparationPoints),
    premiseConsistency: row.premiseConsistency,
    satisfactionScore: row.satisfactionScore ?? null,
    sourceQuestionCount: row.sourceQuestionCount,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    company,
    companySummary,
    motivationSummary: motivationSummary || null,
    gakuchikaSummary: gakuchikaSummary || null,
    academicSummary,
    researchSummary,
    esSummary: esSummary || null,
    materials,
    setup,
    conversation: hydratedConversation,
    feedbackHistories,
  };
}

function buildConversationOwnerWhere(companyId: string, identity: RequestIdentity) {
  return identity.userId
    ? and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.userId, identity.userId))
    : and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.guestId, identity.guestId!));
}

function buildFeedbackOwnerWhere(companyId: string, identity: RequestIdentity) {
  return identity.userId
    ? and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.userId, identity.userId))
    : and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.guestId, identity.guestId!));
}

export async function ensureInterviewConversation(
  companyId: string,
  identity: RequestIdentity,
  setup: InterviewSetupState,
) {
  let existing;
  try {
    existing = await db
      .select()
      .from(interviewConversations)
      .where(buildConversationOwnerWhere(companyId, identity))
      .limit(1);
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId,
        operation: "interview:ensure-conversation",
      }) ?? error
    );
  }

  const setupPatch = {
    selectedIndustry: setup.selectedIndustry,
    selectedRole: setup.selectedRole,
    selectedRoleSource: setup.selectedRoleSource,
    roleTrack: setup.roleTrack,
    interviewFormat: setup.interviewFormat,
    selectionType: setup.selectionType,
    interviewStage: setup.interviewStage,
    interviewerType: setup.interviewerType,
    strictnessMode: setup.strictnessMode,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    try {
      const [updated] = await db
        .update(interviewConversations)
        .set(setupPatch)
        .where(eq(interviewConversations.id, existing[0].id))
        .returning();
      return updated ?? existing[0];
    } catch (error) {
      throw (
        normalizeInterviewPersistenceError(error, {
          companyId,
          operation: "interview:ensure-conversation",
        }) ?? error
      );
    }
  }

  try {
    const [created] = await db
      .insert(interviewConversations)
      .values({
        id: crypto.randomUUID(),
        companyId,
        userId: identity.userId ?? undefined,
        guestId: identity.guestId ?? undefined,
        messages: "[]",
        status: "setup_pending",
        currentStage: "setup",
        questionCount: 0,
        stageQuestionCounts: JSON.stringify({}),
        completedStages: JSON.stringify([]),
        lastQuestionFocus: null,
        questionFlowCompleted: false,
        selectedIndustry: setup.selectedIndustry,
        selectedRole: setup.selectedRole,
        selectedRoleSource: setup.selectedRoleSource,
        roleTrack: setup.roleTrack,
        interviewFormat: setup.interviewFormat,
        selectionType: setup.selectionType,
        interviewStage: setup.interviewStage,
        interviewerType: setup.interviewerType,
        strictnessMode: setup.strictnessMode,
        interviewPlanJson: null,
        turnStateJson: JSON.stringify(createInitialInterviewTurnState()),
        turnMetaJson: null,
        activeFeedbackDraft: null,
        currentFeedbackId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return created;
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId,
        operation: "interview:ensure-conversation",
      }) ?? error
    );
  }
}

export async function saveInterviewConversationProgress(args: {
  conversationId: string;
  companyId: string;
  messages: InterviewMessage[];
  turnState: InterviewTurnState;
  status: "in_progress" | "question_flow_completed" | "feedback_completed";
  feedback?: InterviewFeedback | null;
  plan?: InterviewPlan | null;
  turnMeta?: InterviewTurnMeta | null;
}) {
  const serializedTurnState = JSON.stringify(args.turnState);
  try {
    const [updated] = await db
      .update(interviewConversations)
      .set({
        messages: JSON.stringify(args.messages),
        status: args.status,
        currentStage: args.turnState.currentTopic ?? "setup",
        questionCount: args.turnState.turnCount,
        completedStages: JSON.stringify(args.turnState.coveredTopics),
        lastQuestionFocus: args.turnState.currentTurnMeta?.topic ?? args.turnState.currentTopic,
        questionFlowCompleted: args.turnState.nextAction === "feedback",
        interviewPlanJson: args.plan ? JSON.stringify(args.plan) : undefined,
        turnStateJson: serializedTurnState,
        turnMetaJson: args.turnMeta ? JSON.stringify(args.turnMeta) : null,
        activeFeedbackDraft: args.feedback ? JSON.stringify(args.feedback) : null,
        updatedAt: new Date(),
      })
      .where(eq(interviewConversations.id, args.conversationId))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId: args.companyId,
        operation: "interview:save-progress",
      }) ?? error
    );
  }
}

export async function saveInterviewTurnEvent(args: {
  conversationId: string;
  companyId: string;
  identity: RequestIdentity;
  turnId: string;
  question: string;
  answer: string;
  questionType: string | null;
  turnState: InterviewTurnState;
  turnMeta: InterviewTurnMeta | null;
}) {
  const activeCoverage = args.turnState.coverageState.find(
    (item) => item.topic === (args.turnMeta?.topic ?? args.turnState.currentTopic ?? ""),
  );

  try {
    await db.insert(interviewTurnEvents).values({
      id: crypto.randomUUID(),
      turnId: args.turnId,
      conversationId: args.conversationId,
      companyId: args.companyId,
      userId: args.identity.userId ?? undefined,
      guestId: args.identity.guestId ?? undefined,
      question: args.question,
      answer: args.answer,
      topic: args.turnMeta?.topic ?? args.turnState.currentTopic ?? null,
      questionType: args.questionType,
      turnAction: args.turnMeta?.turnAction ?? null,
      followupStyle: args.turnMeta?.followupStyle ?? null,
      intentKey: args.turnMeta?.intentKey ?? null,
      coverageChecklistSnapshot: JSON.stringify({
        topic: activeCoverage?.topic ?? args.turnMeta?.topic ?? args.turnState.currentTopic ?? null,
        requiredChecklist: activeCoverage?.requiredChecklist ?? [],
        passedChecklistKeys: activeCoverage?.passedChecklistKeys ?? [],
        missingChecklistKeys:
          activeCoverage?.requiredChecklist.filter(
            (key) => !(activeCoverage?.passedChecklistKeys ?? []).includes(key),
          ) ?? [],
      }),
      deterministicCoveragePassed: activeCoverage?.deterministicCoveragePassed ?? false,
      llmCoverageHint: activeCoverage?.llmCoverageHint ?? null,
      formatPhase: args.turnState.formatPhase,
      formatGuardApplied: args.turnMeta?.formatGuardApplied ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId: args.companyId,
        operation: "interview:save-turn-event",
      }) ?? error
    );
  }
}

export async function listInterviewTurnEvents(args: {
  conversationId: string;
  companyId: string;
  identity: RequestIdentity;
  limit?: number;
}) {
  try {
    const rows = await db
      .select()
      .from(interviewTurnEvents)
      .where(
        args.identity.userId
          ? and(
              eq(interviewTurnEvents.companyId, args.companyId),
              eq(interviewTurnEvents.conversationId, args.conversationId),
              eq(interviewTurnEvents.userId, args.identity.userId),
            )
          : and(
              eq(interviewTurnEvents.companyId, args.companyId),
              eq(interviewTurnEvents.conversationId, args.conversationId),
              eq(interviewTurnEvents.guestId, args.identity.guestId!),
            ),
      )
      .orderBy(desc(interviewTurnEvents.createdAt))
      .limit(args.limit ?? 24);

    return rows.map((row) => ({
      id: row.id,
      turnId: row.turnId,
      question: row.question,
      answer: row.answer,
      topic: row.topic ?? null,
      questionType: row.questionType ?? null,
      turnAction: row.turnAction ?? null,
      followupStyle: row.followupStyle ?? null,
      intentKey: row.intentKey ?? null,
      coverageChecklistSnapshot: (() => {
        try {
          const parsed = JSON.parse(row.coverageChecklistSnapshot);
          return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
        } catch {
          return {};
        }
      })(),
      deterministicCoveragePassed: row.deterministicCoveragePassed,
      llmCoverageHint: row.llmCoverageHint ?? null,
      formatPhase: row.formatPhase ?? null,
      formatGuardApplied: row.formatGuardApplied ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId: args.companyId,
        operation: "interview:list-turn-events",
      }) ?? error
    );
  }
}

export async function saveInterviewFeedbackHistory(args: {
  conversationId: string;
  companyId: string;
  identity: RequestIdentity;
  feedback: InterviewFeedback;
  sourceMessagesSnapshot: InterviewMessage[];
  sourceQuestionCount: number;
}) {
  const historyId = crypto.randomUUID();
  try {
    await db.insert(interviewFeedbackHistories).values({
      id: historyId,
      conversationId: args.conversationId,
      companyId: args.companyId,
      userId: args.identity.userId ?? undefined,
      guestId: args.identity.guestId ?? undefined,
      overallComment: args.feedback.overall_comment,
      scores: JSON.stringify(args.feedback.scores ?? {}),
      strengths: JSON.stringify(args.feedback.strengths ?? []),
      improvements: JSON.stringify(args.feedback.improvements ?? []),
      consistencyRisks: JSON.stringify(args.feedback.consistency_risks ?? []),
      weakestQuestionType: args.feedback.weakest_question_type ?? null,
      weakestTurnId: args.feedback.weakest_turn_id ?? null,
      weakestQuestionSnapshot: args.feedback.weakest_question_snapshot ?? null,
      weakestAnswerSnapshot: args.feedback.weakest_answer_snapshot ?? null,
      improvedAnswer: args.feedback.improved_answer,
      preparationPoints: JSON.stringify(args.feedback.next_preparation ?? []),
      premiseConsistency: args.feedback.premise_consistency ?? 0,
      satisfactionScore:
        typeof args.feedback.satisfaction_score === "number" ? args.feedback.satisfaction_score : null,
      sourceQuestionCount: args.sourceQuestionCount,
      sourceMessagesSnapshot: JSON.stringify(args.sourceMessagesSnapshot),
      createdAt: new Date(),
    });

    await db
      .update(interviewConversations)
      .set({
        currentFeedbackId: historyId,
        updatedAt: new Date(),
      })
      .where(eq(interviewConversations.id, args.conversationId));

    const rows = await db
      .select()
      .from(interviewFeedbackHistories)
      .where(buildFeedbackOwnerWhere(args.companyId, args.identity))
      .orderBy(desc(interviewFeedbackHistories.createdAt))
      .limit(8);

    return rows.map((row) => ({
      id: row.id,
      overallComment: row.overallComment,
      scores: parseFeedbackScores(row.scores),
      strengths: parseJsonArray(row.strengths),
      improvements: parseJsonArray(row.improvements),
      consistencyRisks: parseJsonArray(row.consistencyRisks),
      weakestQuestionType: row.weakestQuestionType ?? null,
      weakestTurnId: row.weakestTurnId ?? null,
      weakestQuestionSnapshot: row.weakestQuestionSnapshot ?? null,
      weakestAnswerSnapshot: row.weakestAnswerSnapshot ?? null,
      improvedAnswer: row.improvedAnswer,
      nextPreparation: parseJsonArray(row.preparationPoints),
      premiseConsistency: row.premiseConsistency,
      satisfactionScore: row.satisfactionScore ?? null,
      sourceQuestionCount: row.sourceQuestionCount,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId: args.companyId,
        operation: "interview:save-feedback-history",
      }) ?? error
    );
  }
}

export async function saveInterviewFeedbackSatisfaction(args: {
  companyId: string;
  identity: RequestIdentity;
  historyId: string;
  satisfactionScore: number;
}) {
  try {
    const [updated] = await db
      .update(interviewFeedbackHistories)
      .set({
        satisfactionScore: args.satisfactionScore,
      })
      .where(
        args.identity.userId
          ? and(
              eq(interviewFeedbackHistories.id, args.historyId),
              eq(interviewFeedbackHistories.companyId, args.companyId),
              eq(interviewFeedbackHistories.userId, args.identity.userId),
            )
          : and(
              eq(interviewFeedbackHistories.id, args.historyId),
              eq(interviewFeedbackHistories.companyId, args.companyId),
              eq(interviewFeedbackHistories.guestId, args.identity.guestId!),
            ),
      )
      .returning();
    return updated ?? null;
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId: args.companyId,
        operation: "interview:save-feedback-satisfaction",
      }) ?? error
    );
  }
}

export async function resetInterviewConversation(
  companyId: string,
  identity: RequestIdentity,
) {
  try {
    const [updated] = await db
      .update(interviewConversations)
      .set({
        messages: "[]",
        status: "setup_pending",
        currentStage: "setup",
        questionCount: 0,
        stageQuestionCounts: JSON.stringify({}),
        completedStages: JSON.stringify([]),
        lastQuestionFocus: null,
        questionFlowCompleted: false,
        interviewPlanJson: null,
        turnStateJson: JSON.stringify(createInitialInterviewTurnState()),
        turnMetaJson: null,
        activeFeedbackDraft: null,
        updatedAt: new Date(),
      })
      .where(buildConversationOwnerWhere(companyId, identity))
      .returning();

    return updated ?? null;
  } catch (error) {
    throw (
      normalizeInterviewPersistenceError(error, {
        companyId,
        operation: "interview:reset-conversation",
      }) ?? error
    );
  }
}
