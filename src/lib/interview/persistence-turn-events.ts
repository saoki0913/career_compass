import { and, desc, eq } from "drizzle-orm";

import type { RequestIdentity } from "@/bff/identity/request-identity";
import { db } from "@/lib/db";
import type { CreditsTransaction } from "@/lib/credits";
import { interviewTurnEvents } from "@/lib/db/schema";
import type { InterviewTurnMeta, InterviewTurnState } from "@/lib/interview/session";
import { normalizeInterviewPersistenceError } from "@/lib/interview/persistence-errors";
import {
  resolveNullableVersionString,
  resolveVersionString,
  type InterviewVersionMetadata,
} from "@/lib/interview/persistence-version";

type SaveInterviewTurnEventArgs = {
  conversationId: string;
  companyId: string;
  identity: RequestIdentity;
  turnId: string;
  question: string;
  answer: string;
  questionType: string | null;
  turnState: InterviewTurnState;
  turnMeta: InterviewTurnMeta | null;
  versionMetadata?: InterviewVersionMetadata;
};

/**
 * Transaction-bound variant of {@link saveInterviewTurnEvent}. Inserts the turn
 * event on the caller's `tx` so it commits atomically with the progress update
 * and the credit confirm.
 */
export async function saveInterviewTurnEventTx(
  tx: CreditsTransaction,
  args: SaveInterviewTurnEventArgs,
) {
  const activeCoverage = args.turnState.coverageState.find(
    (item) => item.topic === (args.turnMeta?.topic ?? args.turnState.currentTopic ?? ""),
  );

  try {
    await tx.insert(interviewTurnEvents).values({
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
      promptVersion: resolveVersionString(args.versionMetadata?.promptVersion),
      followupPolicyVersion: resolveVersionString(args.versionMetadata?.followupPolicyVersion),
      caseSeedVersion: resolveNullableVersionString(args.versionMetadata?.caseSeedVersion),
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

export async function saveInterviewTurnEvent(args: SaveInterviewTurnEventArgs) {
  return db.transaction((tx) => saveInterviewTurnEventTx(tx, args));
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
