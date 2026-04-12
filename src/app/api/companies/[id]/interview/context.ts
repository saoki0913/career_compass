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
  getInterviewStageStatus,
  type InterviewSelectionType,
  type InterviewRoundStage,
  type InterviewerType,
} from "@/lib/interview/session";
import {
  hydrateInterviewTurnStateFromRow,
  parseInterviewPlanJson,
  parseInterviewTurnMeta,
  safeParseInterviewFeedback,
  safeParseInterviewMessages,
} from "@/lib/interview/conversation";
import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import { normalizeInterviewPersistenceError } from "./persistence-errors";
import {
  parseFeedbackScores,
  parseJsonArray,
} from "./serialization";
import type {
  HydratedInterviewConversation,
  InterviewFeedbackHistoryItem,
  InterviewMaterialCard,
  InterviewSetupState,
  PersistedInterviewSetup,
} from "./types";

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
  messages: unknown;
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

function pickSummaryFromTexts(texts: string[], keywords: RegExp, maxLength = 700) {
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
  turnStateJson?: unknown;
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

async function loadInterviewPersistence(
  companyId: string,
  identity: RequestIdentity,
): Promise<{
  activeConversation: typeof interviewConversations.$inferSelect | null;
  feedbackRows: Array<typeof interviewFeedbackHistories.$inferSelect>;
}> {
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

function toFeedbackHistoryItem(row: typeof interviewFeedbackHistories.$inferSelect): InterviewFeedbackHistoryItem {
  return {
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
  };
}

export async function buildInterviewContext(companyId: string, identity: RequestIdentity) {
  const company = await getOwnedCompany(companyId, identity);
  if (!company) return null;

  type InterviewPersistence = Awaited<ReturnType<typeof loadInterviewPersistence>>;
  type ApplicationContext = Awaited<ReturnType<typeof fetchApplicationContext>>;

  let motivationConversation: Array<{
    generatedDraft: string | null;
    messages: unknown;
    selectedRole: string | null;
    selectedRoleSource: string | null;
    desiredWork: string | null;
  }> = [];
  let gakuchikaRows: Array<{ title: string; summary: string | null }> = [];
  let documentRows: Array<{ title: string; content: string | null; esCategory: string | null }> = [];
  let persistence: InterviewPersistence = {
    activeConversation: null,
    feedbackRows: [],
  };
  let applicationContext: ApplicationContext = {
    applicationTypes: [],
    applicationRoles: [],
  };

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
    pickSummaryFromTexts(
      textCandidates.filter((_, index) => documentRows[index]?.esCategory === "interview_prep"),
      /(ゼミ|卒論|学業|授業|専攻|学ん|勉強|研究)/i,
    );
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
  const plan = parseInterviewPlanJson(activeConversation?.interviewPlanJson);
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
        selectionType: parseEnumValue(activeConversation.selectionType, SELECTION_TYPE_OPTIONS, setup.selectionType),
        interviewStage: parseEnumValue(activeConversation.interviewStage, INTERVIEW_STAGE_OPTIONS, setup.interviewStage),
        interviewerType: parseEnumValue(
          activeConversation.interviewerType,
          INTERVIEWER_TYPE_OPTIONS,
          setup.interviewerType,
        ),
        strictnessMode: parseEnumValue(activeConversation.strictnessMode, STRICTNESS_MODE_OPTIONS, setup.strictnessMode),
        isLegacySession: isLegacyInterviewConversation(activeConversation),
      }
    : null;

  const feedbackHistories: InterviewFeedbackHistoryItem[] = feedbackRows.map(toFeedbackHistoryItem);

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
