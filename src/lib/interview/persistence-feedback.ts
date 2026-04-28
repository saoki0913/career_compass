import { and, desc, eq } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  interviewConversations,
  interviewFeedbackHistories,
} from "@/lib/db/schema";
import type {
  InterviewFeedback,
  InterviewMessage,
} from "@/lib/interview/conversation";
import { normalizeInterviewPersistenceError } from "@/lib/interview/persistence-errors";
import { buildFeedbackOwnerWhere } from "@/lib/interview/persistence-owner";
import {
  resolveNullableVersionString,
  resolveVersionString,
  type InterviewVersionMetadata,
} from "@/lib/interview/persistence-version";
import { parseFeedbackScores, parseJsonArray } from "@/lib/interview/read-model";

function parseStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  for (const [key, rawItems] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawItems)) continue;
    const items = rawItems.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (items.length > 0) result[key] = items;
  }
  return result;
}

function parseStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      result[key] = rawValue.trim();
    }
  }
  return result;
}

export async function saveInterviewFeedbackHistory(args: {
  conversationId: string;
  companyId: string;
  identity: RequestIdentity;
  feedback: InterviewFeedback;
  sourceMessagesSnapshot: InterviewMessage[];
  sourceQuestionCount: number;
  versionMetadata?: InterviewVersionMetadata;
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
      scoreEvidenceByAxis: args.feedback.score_evidence_by_axis ?? {},
      scoreRationaleByAxis: args.feedback.score_rationale_by_axis ?? {},
      confidenceByAxis: args.feedback.confidence_by_axis ?? {},
      sourceQuestionCount: args.sourceQuestionCount,
      sourceMessagesSnapshot: args.sourceMessagesSnapshot,
      promptVersion: resolveVersionString(args.versionMetadata?.promptVersion),
      followupPolicyVersion: resolveVersionString(args.versionMetadata?.followupPolicyVersion),
      caseSeedVersion: resolveNullableVersionString(args.versionMetadata?.caseSeedVersion),
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
      scoreEvidenceByAxis: parseStringArrayMap(row.scoreEvidenceByAxis),
      scoreRationaleByAxis: parseStringMap(row.scoreRationaleByAxis),
      confidenceByAxis: parseStringMap(row.confidenceByAxis),
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
