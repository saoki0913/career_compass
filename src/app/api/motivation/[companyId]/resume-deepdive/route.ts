/**
 * Motivation Resume Deepdive API
 *
 * POST: Re-fetch a deepdive follow-up question when the original
 *       generate-draft call's follow-up failed.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  safeParseConversationContext,
  safeParseMessages,
  safeParseEvidenceCards,
  safeParseScores,
  type CausalGap,
  type LastQuestionMeta,
  type MotivationConversationContext,
  type MotivationProgress,
  type MotivationSlot,
  type MotivationStage,
  type StageStatus,
} from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { buildMotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import {
  buildMotivationOwnerCondition,
  getOwnedMotivationCompanyData,
  resolveMotivationInputs,
  isMotivationSetupComplete,
  fetchMotivationApplicationJobCandidates,
} from "@/lib/motivation/motivation-input-resolver";
import { logError } from "@/lib/logger";

interface EvidenceCard {
  sourceId: string;
  title: string;
  contentType: string;
  excerpt: string;
  sourceUrl: string;
  relevanceLabel: string;
}

interface FollowUpQuestionResponse {
  question: string;
  evidence_summary?: string | null;
  evidence_cards?: EvidenceCard[];
  coaching_focus?: string | null;
  question_stage?: string | null;
  conversation_mode?: "slot_fill" | "deepdive";
  current_slot?: string | null;
  current_intent?: string | null;
  next_advance_condition?: string | null;
  progress?: Record<string, unknown> | null;
  causal_gaps?: unknown[];
  stage_status?: unknown;
  captured_context?: Record<string, unknown> | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const requestId = getRequestId(request);
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  if (!userId) {
    return NextResponse.json(
      { error: "志望動機の深掘り再開はログインが必要です" },
      { status: 401 },
    );
  }

  // Rate limit (lighter than draft generation — use conversation-level layers)
  const rateLimited = await enforceRateLimitLayers(
    request,
    [...CONVERSATION_RATE_LAYERS],
    userId,
    guestId,
    "motivation_resume_deepdive"
  );
  if (rateLimited) {
    return rateLimited;
  }

  const limitResponse = await guardDailyTokenLimit(identity);
  if (limitResponse) return limitResponse;

  // Get company
  const company = await getOwnedMotivationCompanyData(companyId, identity);
  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  // Get conversation
  const conversation = await getConversationByCondition(
    buildMotivationOwnerCondition(companyId, userId, guestId),
  );
  if (!conversation) {
    return NextResponse.json({ error: "会話が見つかりません" }, { status: 404 });
  }

  // Validate: a draft must already exist (this endpoint recovers a failed follow-up)
  if (!conversation.generatedDraft) {
    return NextResponse.json(
      { error: "ES下書きがまだ生成されていません。先にES生成を行ってください。" },
      { status: 409 },
    );
  }

  const messages = safeParseMessages(conversation.messages);
  const conversationContext = safeParseConversationContext(conversation.conversationContext ?? null);

  const MAX_DEEPDIVE_RESUMES = 3;
  const resumeCount = conversationContext.deepdiveResumeCount ?? 0;
  if (resumeCount >= MAX_DEEPDIVE_RESUMES) {
    return NextResponse.json(
      { error: `深掘り再開は1回のES生成につき${MAX_DEEPDIVE_RESUMES}回までです。` },
      { status: 429 },
    );
  }

  try {
    // Call FastAPI for follow-up question
    const followUpResponse = await fetchFastApiInternal("/api/motivation/next-question", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        generated_draft: conversation.generatedDraft,
        conversation_history: messages,
        question_count: conversation.questionCount ?? 0,
        conversation_context: {
          ...conversationContext,
          draftReady: true,
        },
      }),
    });

    if (!followUpResponse.ok) {
      logAiCreditCostSummary({
        feature: "motivation_resume_deepdive",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      return NextResponse.json(
        { error: "深掘り質問の取得に失敗しました" },
        { status: 503 },
      );
    }

    const rawFollowUp = await followUpResponse.json();
    const { payload: followUpPayload, telemetry } = splitInternalTelemetry(rawFollowUp);
    const followUp = followUpPayload as FollowUpQuestionResponse | null;

    if (!followUp?.question) {
      logAiCreditCostSummary({
        feature: "motivation_resume_deepdive",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return NextResponse.json(
        { error: "深掘り質問を生成できませんでした" },
        { status: 503 },
      );
    }

    // Extract follow-up fields
    const nextQuestion = followUp.question;
    const evidenceCards: EvidenceCard[] = Array.isArray(followUp.evidence_cards)
      ? followUp.evidence_cards
      : [];
    const coachingFocus = typeof followUp.coaching_focus === "string"
      ? followUp.coaching_focus
      : null;
    const questionStage = typeof followUp.question_stage === "string"
      ? (followUp.question_stage as MotivationStage)
      : null;
    const conversationMode = followUp.conversation_mode || null;
    const currentSlot: MotivationSlot | null = followUp.current_slot
      ? (followUp.current_slot as MotivationSlot)
      : null;
    const currentIntent = followUp.current_intent || null;
    const nextAdvanceCondition = followUp.next_advance_condition || null;
    const progress = (followUp.progress as MotivationProgress | null) || null;
    const causalGaps: CausalGap[] = Array.isArray(followUp.causal_gaps)
      ? (followUp.causal_gaps as CausalGap[])
      : [];
    const stageStatus = (followUp.stage_status as StageStatus | null) ?? null;

    const updatedMessages = [
      ...messages,
      {
        role: "assistant" as const,
        content: followUp.question,
      },
    ];

    // Update DB (same fields as generate-draft follow-up, without draft fields)
    await db
      .update(motivationConversations)
      .set({
        messages: updatedMessages,
        conversationContext: {
          ...conversationContext,
          draftReady: true,
          postDraftAwaitingResume: false,
          deepdiveResumeCount: resumeCount + 1,
          conversationMode: conversationMode || conversationContext.conversationMode || "deepdive",
          currentIntent: currentIntent || conversationContext.currentIntent || null,
          nextAdvanceCondition:
            nextAdvanceCondition || conversationContext.nextAdvanceCondition || null,
          causalGaps,
          questionStage: questionStage || conversationContext.questionStage,
          lastQuestionMeta: {
            ...((conversationContext.lastQuestionMeta || {}) as LastQuestionMeta),
            questionText: nextQuestion,
            question_stage: questionStage || conversationContext.questionStage,
          },
        } satisfies MotivationConversationContext,
        questionStage: questionStage || conversation.questionStage,
        lastEvidenceCards: evidenceCards,
        stageStatus,
        updatedAt: new Date(),
      })
      .where(eq(motivationConversations.id, conversation.id));

    logAiCreditCostSummary({
      feature: "motivation_resume_deepdive",
      requestId,
      status: "success",
      creditsUsed: 0,
      telemetry,
    });
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));

    // Build response from the updated conversation context (post-DB-write state)
    const updatedConversationContext: MotivationConversationContext = {
      ...conversationContext,
      draftReady: true,
      postDraftAwaitingResume: false,
      deepdiveResumeCount: resumeCount + 1,
      conversationMode: conversationMode || conversationContext.conversationMode || "deepdive",
      currentIntent: currentIntent || conversationContext.currentIntent || null,
      nextAdvanceCondition:
        nextAdvanceCondition || conversationContext.nextAdvanceCondition || null,
      causalGaps,
      questionStage: questionStage || conversationContext.questionStage,
      lastQuestionMeta: {
        ...((conversationContext.lastQuestionMeta || {}) as LastQuestionMeta),
        questionText: nextQuestion,
        question_stage: questionStage || conversationContext.questionStage,
      },
    };
    const scores = safeParseScores(conversation.motivationScores);
    const evidenceCardsFromDb = safeParseEvidenceCards(evidenceCards);
    let applicationJobCandidates: string[] = [];
    try {
      applicationJobCandidates = await fetchMotivationApplicationJobCandidates(
        companyId,
        userId,
        guestId,
      );
    } catch (error) {
      logError("resume-deepdive:application-job-candidates", error, {
        companyId,
        userId: userId ?? undefined,
        guestId: guestId ?? undefined,
      });
    }
    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      updatedConversationContext,
      applicationJobCandidates,
    );
    const mergedConversationContext = resolvedInputs.conversationContext;
    const setupComplete = isMotivationSetupComplete(
      mergedConversationContext,
      resolvedInputs.requiresIndustrySelection,
    );

    const payload = buildMotivationConversationPayload({
      messages: updatedMessages,
      questionCount: conversation.questionCount ?? 0,
      isDraftReady: true,
      generatedDraft: conversation.generatedDraft,
      scores,
      conversationContext: mergedConversationContext,
      persistedQuestionStage:
        (questionStage || conversation.questionStage || null) as typeof mergedConversationContext.questionStage | null,
      stageStatusValue: stageStatus,
      evidenceCards: evidenceCardsFromDb,
      coachingFocus,
      riskFlags: [],
      conversationMode: conversationMode ?? undefined,
      currentSlot: currentSlot ?? undefined,
      currentIntent: currentIntent ?? undefined,
      nextAdvanceCondition: nextAdvanceCondition ?? undefined,
      progress: progress ?? undefined,
      causalGaps,
      resolvedIndustry: resolvedInputs.company.industry,
      requiresIndustrySelection: resolvedInputs.requiresIndustrySelection,
      isSetupComplete: setupComplete,
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount: conversation.questionCount,
        status: conversation.status,
      },
      ...payload,
    });
  } catch (error) {
    logError("motivation-resume-deepdive", error, { companyId, userId, requestId });
    logAiCreditCostSummary({
      feature: "motivation_resume_deepdive",
      requestId,
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return NextResponse.json(
      { error: "深掘り再開中にエラーが発生しました" },
      { status: 503 },
    );
  }
}
