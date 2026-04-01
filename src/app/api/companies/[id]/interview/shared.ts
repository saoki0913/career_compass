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
  createInitialInterviewTurnState,
  getInterviewStageStatus,
  type InterviewStageStatus,
  type InterviewTurnState,
} from "@/lib/interview/session";
import {
  hydrateInterviewTurnStateFromRow,
  serializeInterviewTurnState,
  safeParseInterviewFeedback,
  safeParseInterviewMessages,
  type InterviewFeedback,
  type InterviewMessage,
} from "@/lib/interview/conversation";
import {
  getInterviewCompanySeed,
  getInterviewIndustrySeed,
} from "@/lib/interview/company-seeds";
import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import { normalizeInterviewPersistenceError } from "./persistence-errors";

export type InterviewMaterialCard = {
  label: string;
  text: string;
  kind?: "motivation" | "gakuchika" | "es" | "industry_seed" | "company_seed";
};

export type InterviewSetupState = {
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  resolvedIndustry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
};

export type InterviewFeedbackHistoryItem = {
  id: string;
  overallComment: string;
  scores: InterviewFeedback["scores"];
  strengths: string[];
  improvements: string[];
  improvedAnswer: string;
  preparationPoints: string[];
  premiseConsistency: number;
  sourceQuestionCount: number;
  createdAt: string;
};

export type HydratedInterviewConversation = {
  id: string;
  status: "setup_pending" | "in_progress" | "question_flow_completed" | "feedback_completed";
  messages: InterviewMessage[];
  turnState: InterviewTurnState;
  stageStatus: InterviewStageStatus;
  questionCount: number;
  questionStage: InterviewTurnState["currentStage"];
  questionFlowCompleted: boolean;
  feedback: InterviewFeedback | null;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
};

function clipText(value: string | null | undefined, maxLength = 500) {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength).trim()}...`;
}

function parseConversationMessages(value: string | null | undefined): InterviewMessage[] {
  return safeParseInterviewMessages(value);
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
  return hydrateInterviewTurnStateFromRow({
    currentStage: (value as { currentStage?: string }).currentStage ?? null,
    questionCount: (value as { totalQuestionCount?: number }).totalQuestionCount ?? null,
    stageQuestionCounts: JSON.stringify(
      (value as { stageQuestionCounts?: InterviewTurnState["stageQuestionCounts"] })
        .stageQuestionCounts ?? {},
    ),
    completedStages: JSON.stringify(
      (value as { completedStages?: InterviewTurnState["completedStages"] }).completedStages ?? [],
    ),
    lastQuestionFocus: (value as { lastQuestionFocus?: string }).lastQuestionFocus ?? null,
    questionFlowCompleted:
      (value as { nextAction?: InterviewTurnState["nextAction"] }).nextAction === "feedback" ||
      (value as { currentStage?: string }).currentStage === "feedback",
  });
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

async function fetchApplicationJobCandidates(identity: RequestIdentity, companyId: string) {
  const rows = await db
    .select({
      jobTypeName: jobTypes.name,
    })
    .from(applications)
    .leftJoin(jobTypes, eq(jobTypes.applicationId, applications.id))
    .where(
      identity.userId
        ? and(eq(applications.companyId, companyId), eq(applications.userId, identity.userId))
        : and(eq(applications.companyId, companyId), eq(applications.guestId, identity.guestId!)),
    );

  return rows
    .map((row) => row.jobTypeName?.trim())
    .filter((value): value is string => Boolean(value));
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
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  applicationRoles: string[];
}): InterviewSetupState {
  const resolution = resolveMotivationRoleContext({
    companyName: input.companyName,
    companyIndustry: input.companyIndustry,
    selectedIndustry: input.selectedIndustry,
    applicationRoles: input.applicationRoles,
  });

  return {
    selectedIndustry: input.selectedIndustry || resolution.resolvedIndustry,
    selectedRole: input.selectedRole,
    selectedRoleSource: input.selectedRoleSource,
    resolvedIndustry: resolution.resolvedIndustry,
    requiresIndustrySelection: resolution.requiresIndustrySelection,
    industryOptions: [...resolution.industryOptions],
  };
}

async function loadInterviewPersistence(
  companyId: string,
  identity: RequestIdentity,
) {
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
  let esDocuments: Array<{ title: string; content: string | null }> = [];
  let persistence = {
    activeConversation: null,
    feedbackRows: [],
  } as unknown as Awaited<ReturnType<typeof loadInterviewPersistence>>;
  let applicationRoles: string[] = [];

  try {
    [motivationConversation, gakuchikaRows, esDocuments, persistence, applicationRoles] =
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
          .limit(3),
        loadInterviewPersistence(companyId, identity),
        fetchApplicationJobCandidates(identity, companyId),
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

  const motivationSummary = clipText(
    motivation?.generatedDraft ||
      [
        motivation?.selectedRole ? `志望職種: ${motivation.selectedRole}` : "",
        motivation?.desiredWork ? `やりたい仕事: ${motivation.desiredWork}` : "",
        parseConversationMessages(motivation?.messages)
          .slice(-4)
          .map((message) => message.content)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    900,
  );

  const gakuchikaSummary = gakuchikaRows
    .map((row) => {
      const summary = clipText(row.summary, 320);
      return summary ? `${row.title}: ${summary}` : row.title;
    })
    .filter(Boolean)
    .join("\n");

  const esSummary = esDocuments
    .map((doc) => `${doc.title}: ${clipText(doc.content, 260)}`)
    .filter(Boolean)
    .join("\n");

  const selectedIndustry = activeConversation?.selectedIndustry ?? company.industry ?? null;
  const setup = buildSetupState({
    companyName: company.name,
    companyIndustry: company.industry,
    selectedIndustry,
    selectedRole: activeConversation?.selectedRole ?? motivation?.selectedRole ?? null,
    selectedRoleSource:
      activeConversation?.selectedRoleSource ??
      motivation?.selectedRoleSource ??
      null,
    applicationRoles,
  });

  const companySummary = [
    `企業名: ${company.name}`,
    setup.resolvedIndustry ? `業界: ${setup.resolvedIndustry}` : "",
    setup.selectedRole ? `志望職種: ${setup.selectedRole}` : "",
    company.notes ? `メモ: ${clipText(company.notes, 600)}` : "",
    company.recruitmentUrl ? `採用URL: ${company.recruitmentUrl}` : "",
    company.corporateUrl ? `企業URL: ${company.corporateUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const materials: InterviewMaterialCard[] = [];
  if (motivationSummary) {
    materials.push({ label: "志望動機", text: motivationSummary, kind: "motivation" });
  }
  if (gakuchikaSummary) {
    materials.push({ label: "ガクチカ", text: gakuchikaSummary, kind: "gakuchika" });
  }
  if (esSummary) {
    materials.push({ label: "関連ES", text: esSummary, kind: "es" });
  }
  materials.push(...buildSeedMaterials(company.name, setup.resolvedIndustry));

  const turnState = hydrateInterviewTurnStateFromRow(activeConversation);
  const hydratedConversation: HydratedInterviewConversation | null = activeConversation
    ? {
        id: activeConversation.id,
        status: activeConversation.status,
        messages: safeParseInterviewMessages(activeConversation.messages),
        turnState,
        stageStatus: getInterviewStageStatus(turnState.currentStage),
        questionCount: activeConversation.questionCount ?? turnState.totalQuestionCount,
        questionStage: turnState.currentStage,
        questionFlowCompleted: Boolean(activeConversation.questionFlowCompleted),
        feedback: safeParseInterviewFeedback(activeConversation.activeFeedbackDraft),
        selectedIndustry: activeConversation.selectedIndustry,
        selectedRole: activeConversation.selectedRole,
        selectedRoleSource: activeConversation.selectedRoleSource,
      }
    : null;

  const feedbackHistories: InterviewFeedbackHistoryItem[] = feedbackRows.map((row) => ({
    id: row.id,
    overallComment: row.overallComment,
    scores: parseFeedbackScores(row.scores),
    strengths: parseJsonArray(row.strengths),
    improvements: parseJsonArray(row.improvements),
    improvedAnswer: row.improvedAnswer,
    preparationPoints: parseJsonArray(row.preparationPoints),
    premiseConsistency: row.premiseConsistency,
    sourceQuestionCount: row.sourceQuestionCount,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    company,
    companySummary,
    motivationSummary: motivationSummary || null,
    gakuchikaSummary: gakuchikaSummary || null,
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
  setup: {
    selectedIndustry: string | null;
    selectedRole: string | null;
    selectedRoleSource: string | null;
  },
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

  if (existing[0]) {
    try {
      const [updated] = await db
        .update(interviewConversations)
        .set({
          selectedIndustry: setup.selectedIndustry,
          selectedRole: setup.selectedRole,
          selectedRoleSource: setup.selectedRoleSource,
          updatedAt: new Date(),
        })
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
        currentStage: "industry_reason",
        questionCount: 0,
        stageQuestionCounts: JSON.stringify(createInitialInterviewTurnState().stageQuestionCounts),
        completedStages: "[]",
        lastQuestionFocus: null,
        questionFlowCompleted: false,
        selectedIndustry: setup.selectedIndustry,
        selectedRole: setup.selectedRole,
        selectedRoleSource: setup.selectedRoleSource,
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
}) {
  const serializedTurnState = serializeInterviewTurnState(args.turnState);
  try {
    const [updated] = await db
      .update(interviewConversations)
      .set({
        messages: JSON.stringify(args.messages),
        status: args.status,
        currentStage: serializedTurnState.currentStage,
        questionCount: serializedTurnState.questionCount,
        stageQuestionCounts: serializedTurnState.stageQuestionCounts,
        completedStages: serializedTurnState.completedStages,
        lastQuestionFocus: serializedTurnState.lastQuestionFocus,
        questionFlowCompleted: serializedTurnState.questionFlowCompleted,
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
      improvedAnswer: args.feedback.improved_answer,
      preparationPoints: JSON.stringify(args.feedback.preparation_points ?? []),
      premiseConsistency: args.feedback.premise_consistency ?? 0,
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
      improvedAnswer: row.improvedAnswer,
      preparationPoints: parseJsonArray(row.preparationPoints),
      premiseConsistency: row.premiseConsistency,
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
        currentStage: "industry_reason",
        questionCount: 0,
        stageQuestionCounts: JSON.stringify(createInitialInterviewTurnState().stageQuestionCounts),
        completedStages: "[]",
        lastQuestionFocus: null,
        questionFlowCompleted: false,
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
