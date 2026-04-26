import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { motivationStreamPolicy } from "@/lib/api-route/billing/motivation-stream-policy";
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
    requires_industry_selection: args.resolvedInputs.requiresIndustrySelection,
    industry_options: args.resolvedInputs.industryOptions.length > 0 ? args.resolvedInputs.industryOptions : null,
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
  billingContext: Parameters<typeof motivationStreamPolicy.confirm>[0];
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
      lastQuestionMeta: {
        ...(((args.resolvedInputs.conversationContext.lastQuestionMeta || {}) as LastQuestionMeta)),
        ...((((args.fastApiData.captured_context?.lastQuestionMeta as LastQuestionMeta | undefined) || {}))),
        questionText: args.fastApiData.question || null,
      },
    },
    isDraftReady,
    currentDraftReadyState.unlockedAt ?? undefined,
  );

  const updatedRows = await db
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

  let billingStatus: MotivationStreamBillingStatus = "success";
  let creditsApplied = args.shouldConsumeCredit ? CONVERSATION_CREDITS_PER_TURN : 0;
  try {
    await motivationStreamPolicy.confirm(
      args.billingContext,
      {
        kind: "billable_success",
        creditsConsumed: creditsApplied,
        freeQuotaUsed: false,
      },
      null,
    );
  } catch {
    billingStatus = "failed";
    creditsApplied = 0;
  }

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
    resolvedIndustry: args.resolvedInputs.company.industry,
    requiresIndustrySelection: args.resolvedInputs.requiresIndustrySelection,
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
