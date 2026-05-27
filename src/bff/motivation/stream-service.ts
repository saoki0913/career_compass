import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { motivationStreamPolicy } from "@/bff/billing/motivation-stream-policy";
import { CONVERSATION_CREDITS_PER_TURN } from "@/lib/credits";
import {
  type CausalGap,
  type EvidenceCard,
  type Message,
  type MotivationConversationContext,
  type MotivationProgress,
  type MotivationScores,
  resolveDraftReadyState,
  mergeDraftReadyContext,
  serializeConversationContext,
  serializeEvidenceCards,
  serializeMessages,
  serializeScores,
  serializeStageStatus,
  type LastQuestionMeta,
  type StageStatus,
} from "@/lib/motivation/conversation";
import { buildMotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import type {
  MotivationCompanyData,
  MotivationResolvedInputs,
} from "@/lib/motivation/motivation-input-resolver";

export type MotivationStreamBillingStatus = "success" | "failed" | "cancelled";

/**
 * Sentinel thrown inside the persist+confirm transaction when the optimistic
 * lock matches no rows. Lets the caller distinguish a stale-conversation
 * conflict (reload prompt) from a credit confirm failure, while still rolling
 * the transaction back and skipping confirm.
 */
class MotivationStreamConflictError extends Error {
  constructor() {
    super("motivation conversation optimistic lock conflict");
    this.name = "MotivationStreamConflictError";
  }
}

export type MotivationStreamCompleteData = {
  question?: string;
  draft_ready?: boolean;
  evaluation?: { scores: MotivationScores; is_complete: boolean };
  captured_context?: Partial<MotivationConversationContext>;
  question_stage?: string;
  evidence_summary?: string | null;
  evidence_cards?: unknown[];
  coaching_focus?: string | null;
  risk_flags?: string[];
  stage_status?: unknown;
  conversation_mode?: "slot_fill" | "deepdive";
  current_slot?: string | null;
  current_intent?: string | null;
  next_advance_condition?: string | null;
  progress?: MotivationProgress | null;
  causal_gaps?: CausalGap[];
};

export function buildMotivationStreamPayload(args: {
  company: MotivationCompanyData;
  resolvedInputs: MotivationResolvedInputs;
  messages: Message[];
  newQuestionCount: number;
  scores: MotivationScores | null;
  generatedDraft: string | null;
  gakuchikaContext: unknown[];
  profileContext: unknown;
  applicationJobCandidates: unknown[];
}) {
  return {
    company_id: args.company.id,
    company_name: args.company.name,
    industry: args.resolvedInputs.company.industry,
    generated_draft: args.generatedDraft ?? null,
    conversation_history: args.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    question_count: args.newQuestionCount,
    scores: args.scores,
    gakuchika_context: args.gakuchikaContext.length > 0 ? args.gakuchikaContext : null,
    conversation_context: args.resolvedInputs.conversationContext,
    profile_context: args.profileContext,
    application_job_candidates: args.applicationJobCandidates.length > 0 ? args.applicationJobCandidates : null,
    company_role_candidates: args.resolvedInputs.companyRoleCandidates.length > 0
      ? args.resolvedInputs.companyRoleCandidates
      : null,
    company_work_candidates: args.resolvedInputs.conversationContext.companyWorkCandidates.length > 0
      ? args.resolvedInputs.conversationContext.companyWorkCandidates
      : null,
    requires_industry_selection: args.resolvedInputs.industryState.kind === "requires_selection",
    industry_options: args.resolvedInputs.industryState.industryOptions.length > 0
      ? args.resolvedInputs.industryState.industryOptions
      : null,
  };
}

export async function completeMotivationStreamTurn(args: {
  fastApiData: MotivationStreamCompleteData;
  conversation: typeof motivationConversations.$inferSelect;
  messages: Message[];
  newQuestionCount: number;
  scores: MotivationScores | null;
  resolvedInputs: MotivationResolvedInputs;
  shouldConsumeCredit: boolean;
  billingContext: Parameters<typeof motivationStreamPolicy.confirmInTx>[1];
  reservationId: string | null;
}): Promise<{
  result: {
    replaceEvent: Record<string, unknown>;
    cancel?: boolean;
  };
  billingStatus: MotivationStreamBillingStatus;
  creditsApplied: number;
}> {
  const currentDraftReadyState = resolveDraftReadyState(
    args.resolvedInputs.conversationContext,
    args.conversation.status as "in_progress" | "completed" | null,
  );
  const wasDraftReady = currentDraftReadyState.isDraftReady;
  let isDraftReady = wasDraftReady;
  let newScores = args.scores;

  if (args.fastApiData.question) {
    args.messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: args.fastApiData.question,
    });
  }

  if (args.fastApiData.evaluation) {
    newScores = args.fastApiData.evaluation.scores;
    isDraftReady = isDraftReady || args.fastApiData.evaluation.is_complete;
  }
  isDraftReady = isDraftReady || Boolean(args.fastApiData.draft_ready);
  const draftReadyJustUnlocked = !wasDraftReady && isDraftReady;
  const nextConversationContext = mergeDraftReadyContext(
    {
      ...args.resolvedInputs.conversationContext,
      ...(args.fastApiData.captured_context || {}),
      conversationMode: wasDraftReady ? "deepdive" : (args.fastApiData.conversation_mode || args.resolvedInputs.conversationContext.conversationMode),
      postDraftAwaitingResume: wasDraftReady ? false : args.resolvedInputs.conversationContext.postDraftAwaitingResume,
      lastQuestionMeta: {
        ...(((args.resolvedInputs.conversationContext.lastQuestionMeta || {}) as LastQuestionMeta)),
        ...((((args.fastApiData.captured_context?.lastQuestionMeta as LastQuestionMeta | undefined) || {}))),
        questionText: args.fastApiData.question || null,
      },
    },
    isDraftReady,
    currentDraftReadyState.unlockedAt ?? undefined,
  );

  const creditsToConsume = args.shouldConsumeCredit ? CONVERSATION_CREDITS_PER_TURN : 0;

  // Persist the conversation update AND confirm the reservation in one
  // transaction so "saved" and "charged" share a single commit boundary. Two
  // distinct non-success terminals can occur:
  //   - optimistic-lock conflict (0 rows updated): a concurrent tab/operation
  //     moved the conversation on; we refund and tell the client to reload.
  //   - confirm claim failure: confirmInTx throws, the update rolls back, and we
  //     refund — never delivering a saved-but-uncharged turn.
  // Either way onFinally cancels the reservation (billingStatus="failed").
  let conflict = false;
  try {
    await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(motivationConversations)
        .set({
          messages: serializeMessages(args.messages),
          questionCount: args.newQuestionCount,
          status: isDraftReady ? "completed" : "in_progress",
          motivationScores: serializeScores(newScores ?? null),
          conversationContext: serializeConversationContext(nextConversationContext),
          selectedRole: nextConversationContext.selectedRole ?? null,
          selectedRoleSource: nextConversationContext.selectedRoleSource ?? null,
          desiredWork: nextConversationContext.desiredWork ?? null,
          questionStage: args.fastApiData.question_stage ?? nextConversationContext.questionStage,
          lastEvidenceCards: serializeEvidenceCards((args.fastApiData.evidence_cards || []) as EvidenceCard[]),
          stageStatus: serializeStageStatus(
            ((args.fastApiData.stage_status as StageStatus | undefined) || {
              current: args.fastApiData.question_stage || args.resolvedInputs.conversationContext.questionStage,
              completed: [],
              pending: [],
            }) as StageStatus,
          ),
          updatedAt: new Date(),
        })
        .where(and(eq(motivationConversations.id, args.conversation.id), eq(motivationConversations.updatedAt, args.conversation.updatedAt)))
        .returning({ id: motivationConversations.id });

      if (updatedRows.length === 0) {
        conflict = true;
        // Roll back (nothing was changed anyway) and skip confirm.
        throw new MotivationStreamConflictError();
      }

      await motivationStreamPolicy.confirmInTx(
        tx,
        args.billingContext,
        {
          kind: "billable_success",
          creditsConsumed: creditsToConsume,
          freeQuotaUsed: false,
        },
        args.reservationId,
      );
    });
  } catch (error) {
    if (conflict || error instanceof MotivationStreamConflictError) {
      return {
        billingStatus: "failed",
        creditsApplied: 0,
        result: {
          replaceEvent: {
            type: "error",
            message: "別のタブまたは直前の操作で会話が更新されました。画面を再読み込みしてからやり直してください。",
          },
          cancel: true,
        },
      };
    }
    // confirm claim failure (or any other tx error): the update rolled back, so
    // replace complete with an error event + cancel so the proxy refunds.
    return {
      billingStatus: "failed",
      creditsApplied: 0,
      result: {
        replaceEvent: {
          type: "error",
          message: "クレジットの確定に失敗しました。クレジットは消費されません。時間を置いて、もう一度お試しください。",
        },
        cancel: true,
      },
    };
  }

  const billingStatus: MotivationStreamBillingStatus = "success";
  const creditsApplied = creditsToConsume;

  const payload = buildMotivationConversationPayload({
    messages: args.messages,
    nextQuestion: args.fastApiData.question || null,
    questionCount: args.newQuestionCount,
    isDraftReady,
    scores: newScores,
    conversationContext: nextConversationContext,
    persistedQuestionStage:
      (args.fastApiData.question_stage as MotivationConversationContext["questionStage"] | null) ??
      nextConversationContext.questionStage,
    stageStatusValue: args.fastApiData.stage_status,
    evidenceSummary: typeof args.fastApiData.evidence_summary === "string" ? args.fastApiData.evidence_summary : null,
    evidenceCards: (args.fastApiData.evidence_cards || []) as EvidenceCard[],
    coachingFocus: typeof args.fastApiData.coaching_focus === "string" ? args.fastApiData.coaching_focus : null,
    riskFlags: Array.isArray(args.fastApiData.risk_flags) ? args.fastApiData.risk_flags : [],
    conversationMode: args.fastApiData.conversation_mode || nextConversationContext.conversationMode || "slot_fill",
    currentIntent: args.fastApiData.current_intent || null,
    nextAdvanceCondition: args.fastApiData.next_advance_condition || null,
    progress: args.fastApiData.progress || null,
    causalGaps: Array.isArray(args.fastApiData.causal_gaps) ? args.fastApiData.causal_gaps : [],
    industryState: args.resolvedInputs.industryState,
    isSetupComplete: true,
  });

  return {
    billingStatus,
    creditsApplied,
    result: {
      replaceEvent: {
        type: "complete",
        data: { ...payload, draftReadyJustUnlocked },
      },
    },
  };
}
