import { and, desc, eq } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  interviewConversations,
  interviewFeedbackHistories,
  interviewTurnEvents,
} from "@/lib/db/schema";
import {
  createInitialInterviewTurnState,
  type InterviewPlan,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";
import {
  serializeInterviewFeedback,
  serializeInterviewMessages,
  serializeInterviewPlan,
  serializeInterviewTurnMeta,
  serializeInterviewTurnState,
  type InterviewFeedback,
  type InterviewMessage,
} from "@/lib/interview/conversation";
import { normalizeInterviewPersistenceError } from "./persistence-errors";
import { parseFeedbackScores, parseJsonArray } from "./serialization";
import type { InterviewSetupState } from "./types";

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
        messages: [],
        status: "setup_pending",
        currentStage: "setup",
        questionCount: 0,
        stageQuestionCounts: {},
        completedStages: [],
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
        turnStateJson: serializeInterviewTurnState(createInitialInterviewTurnState()).turnStateJson,
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
  const serializedTurnState = serializeInterviewTurnState(args.turnState);
  try {
    const [updated] = await db
      .update(interviewConversations)
      .set({
        messages: serializeInterviewMessages(args.messages),
        status: args.status,
        ...serializedTurnState,
        interviewPlanJson: serializeInterviewPlan(args.plan),
        turnMetaJson: serializeInterviewTurnMeta(args.turnMeta),
        activeFeedbackDraft: serializeInterviewFeedback(args.feedback),
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
          return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
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
      scores: args.feedback.scores ?? {},
      strengths: args.feedback.strengths ?? [],
      improvements: args.feedback.improvements ?? [],
      consistencyRisks: args.feedback.consistency_risks ?? [],
      weakestQuestionType: args.feedback.weakest_question_type ?? null,
      weakestTurnId: args.feedback.weakest_turn_id ?? null,
      weakestQuestionSnapshot: args.feedback.weakest_question_snapshot ?? null,
      weakestAnswerSnapshot: args.feedback.weakest_answer_snapshot ?? null,
      improvedAnswer: args.feedback.improved_answer,
      preparationPoints: args.feedback.next_preparation ?? [],
      premiseConsistency: args.feedback.premise_consistency ?? 0,
      satisfactionScore:
        typeof args.feedback.satisfaction_score === "number" ? args.feedback.satisfaction_score : null,
      sourceQuestionCount: args.sourceQuestionCount,
      sourceMessagesSnapshot: args.sourceMessagesSnapshot,
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

export async function resetInterviewConversation(companyId: string, identity: RequestIdentity) {
  try {
    const [updated] = await db
      .update(interviewConversations)
      .set({
        messages: [],
        status: "setup_pending",
        currentStage: "setup",
        questionCount: 0,
        stageQuestionCounts: {},
        completedStages: [],
        lastQuestionFocus: null,
        questionFlowCompleted: false,
        interviewPlanJson: null,
        turnStateJson: serializeInterviewTurnState(createInitialInterviewTurnState()).turnStateJson,
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
