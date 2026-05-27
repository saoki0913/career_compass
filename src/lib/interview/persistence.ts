import { eq } from "drizzle-orm";

import type { RequestIdentity } from "@/bff/identity/request-identity";
import { db } from "@/lib/db";
import type { CreditsTransaction } from "@/lib/credits";
import { interviewConversations } from "@/lib/db/schema";
import {
  createInitialInterviewTurnState,
  type InterviewPlan,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";
import {
  serializeInterviewFeedback,
  serializeInterviewPlan,
  serializeInterviewTurnMeta,
  serializeInterviewTurnState,
  type InterviewFeedback,
  type InterviewMessage,
} from "@/lib/interview/conversation";
import { normalizeInterviewPersistenceError } from "@/lib/interview/persistence-errors";
import { buildConversationOwnerWhere } from "@/lib/interview/persistence-owner";
import type { InterviewSetupState } from "@/lib/interview/types";

export {
  listInterviewTurnEvents,
  saveInterviewTurnEvent,
  saveInterviewTurnEventTx,
} from "@/lib/interview/persistence-turn-events";
export {
  saveInterviewFeedbackHistory,
  saveInterviewFeedbackHistoryTx,
  saveInterviewFeedbackSatisfaction,
  saveInterviewFeedbackSheet,
} from "@/lib/interview/persistence-feedback";
export type { InterviewVersionMetadata } from "@/lib/interview/persistence-version";

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

type SaveInterviewConversationProgressArgs = {
  conversationId: string;
  companyId: string;
  messages: InterviewMessage[];
  turnState: InterviewTurnState;
  status: "in_progress" | "question_flow_completed" | "feedback_completed";
  feedback?: InterviewFeedback | null;
  plan?: InterviewPlan | null;
  turnMeta?: InterviewTurnMeta | null;
};

/**
 * Transaction-bound variant of {@link saveInterviewConversationProgress}. Runs
 * the conversation UPDATE on the caller's `tx` so persistence can share one
 * commit boundary with the credit confirm.
 */
export async function saveInterviewConversationProgressTx(
  tx: CreditsTransaction,
  args: SaveInterviewConversationProgressArgs,
) {
  const serializedTurnState = serializeInterviewTurnState(args.turnState);
  try {
    const [updated] = await tx
      .update(interviewConversations)
      .set({
        messages: args.messages,
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

export async function saveInterviewConversationProgress(
  args: SaveInterviewConversationProgressArgs,
) {
  return db.transaction((tx) => saveInterviewConversationProgressTx(tx, args));
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
