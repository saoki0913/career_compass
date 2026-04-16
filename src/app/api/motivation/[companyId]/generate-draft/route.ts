/**
 * Motivation ES Draft Generation API
 *
 * POST: Generate ES draft from conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { reserveCredits, confirmReservation, cancelReservation } from "@/lib/credits";
import {
  resolveDraftReadyState,
  safeParseConversationContext,
  safeParseMessages,
  type CausalGap,
  type LastQuestionMeta,
  type MotivationConversationContext,
  type MotivationStage,
  type StageStatus,
} from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import { normalizeEsDraftSingleParagraph } from "@/lib/server/es-draft-normalize";
import { messageFromFastApiDetail } from "@/lib/server/fastapi-detail-message";
import {
  buildMotivationOwnerCondition,
  getOwnedMotivationCompanyData,
} from "@/lib/motivation/motivation-input-resolver";

interface FastAPIDraftResponse {
  draft: string;
  char_count: number;
  key_points: string[];
  company_keywords: string[];
  internal_telemetry?: unknown;
}

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
      { error: "志望動機のAI下書き生成はログインが必要です" },
      { status: 401 },
    );
  }

  const limitResponse = await guardDailyTokenLimit(identity);
  if (limitResponse) return limitResponse;

  const rateLimited = await enforceRateLimitLayers(
    request,
    [...DRAFT_RATE_LAYERS],
    userId,
    guestId,
    "motivation_generate_draft"
  );
  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json();
  const { charLimit = 400 } = body;

  if (![300, 400, 500].includes(charLimit)) {
    return NextResponse.json({ error: "文字数は300, 400, 500のいずれかを指定してください" }, { status: 400 });
  }

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

  const messages = safeParseMessages(conversation.messages);
  if (messages.length < 2) {
    return NextResponse.json({ error: "会話が十分にありません" }, { status: 400 });
  }
  const conversationContext = safeParseConversationContext(conversation.conversationContext ?? null);
  const { isDraftReady } = resolveDraftReadyState(
    conversationContext,
    conversation.status as "in_progress" | "completed" | null,
  );
  if (!isDraftReady) {
    return NextResponse.json(
      { error: "十分な材料が揃ってから志望動機ESを作成できます" },
      { status: 409 },
    );
  }

  // Reserve credits upfront (6 credits for draft generation for logged-in users)
  let reservationId: string | null = null;
  if (userId) {
    const reservation = await reserveCredits(userId, 6, "motivation_draft", companyId, `志望動機ES生成: ${company.name}`);
    if (!reservation.success) {
      return NextResponse.json({ error: "クレジットが不足しています" }, { status: 402 });
    }
    reservationId = reservation.reservationId;
  }

  // Call FastAPI for draft generation (retry transient 502/503 from upstream LLM/timeouts)
  try {
    const fastApiBody = JSON.stringify({
      company_id: company.id,
      company_name: company.name,
      industry: company.industry,
      // D-2 / P2-1: RAG role-grounded モード決定のためロール軸を渡す
      selected_role: conversationContext.selectedRole ?? null,
      conversation_history: messages,
      slot_summaries: conversationContext.slotSummaries ?? {},
      slot_evidence_sentences: conversationContext.slotEvidenceSentences ?? {},
      char_limit: charLimit,
    });

    let response = await fetchFastApiInternal("/api/motivation/generate-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: fastApiBody,
    });

    const retryDelaysMs = [2500, 5000, 8000];
    for (let r = 0; r < retryDelaysMs.length; r++) {
      if (response.ok) break;
      if (response.status !== 502 && response.status !== 503) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[r]));
      response = await fetchFastApiInternal("/api/motivation/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        body: fastApiBody,
      });
    }

    if (!response.ok) {
      if (reservationId) await cancelReservation(reservationId);
      const errorData = await response.json().catch(() => ({}));
      logAiCreditCostSummary({
        feature: "motivation_draft",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      const detailMsg = messageFromFastApiDetail((errorData as { detail?: unknown }).detail);
      return NextResponse.json(
        { error: detailMsg || "ES生成に失敗しました" },
        { status: 503 }
      );
    }

    const rawData = await response.json();
    const { payload, telemetry } = splitInternalTelemetry(rawData);
    const data = payload as FastAPIDraftResponse;
    const draftNormalized = normalizeEsDraftSingleParagraph(data.draft);

    // Confirm credit reservation on success
    if (reservationId) {
      await confirmReservation(reservationId);
    }
    logAiCreditCostSummary({
      feature: "motivation_draft",
      requestId,
      status: "success",
      creditsUsed: reservationId ? 2 : 0,
      telemetry,
    });
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));

    let nextQuestion: string | null = null;
    let evidenceSummary: string | null = null;
    let evidenceCards: EvidenceCard[] = [];
    let coachingFocus: string | null = null;
    let questionStage: MotivationStage | null = null;
    let conversationMode: "slot_fill" | "deepdive" | null = null;
    let currentSlot: MotivationStage | null = null;
    let currentIntent: string | null = null;
    let nextAdvanceCondition: string | null = null;
    let progress: Record<string, unknown> | null = null;
    let causalGaps: CausalGap[] = [];
    let stageStatus: StageStatus | null = null;
    let updatedMessages = messages;

    const followUpResponse = await fetchFastApiInternal("/api/motivation/next-question", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        generated_draft: draftNormalized,
        conversation_history: messages,
        question_count: conversation.questionCount ?? 0,
        conversation_context: {
          ...conversationContext,
          draftReady: true,
        },
      }),
    }).catch(() => null);

    if (followUpResponse?.ok) {
      const rawFollowUp = await followUpResponse.json().catch(() => null);
      const followUpPayload =
        rawFollowUp && typeof rawFollowUp === "object"
          ? splitInternalTelemetry(rawFollowUp).payload
          : null;
      const followUp = followUpPayload as FollowUpQuestionResponse | null;

      if (followUp?.question) {
        nextQuestion = followUp.question;
        evidenceSummary = typeof followUp.evidence_summary === "string" ? followUp.evidence_summary : null;
        evidenceCards = Array.isArray(followUp.evidence_cards) ? followUp.evidence_cards : [];
        coachingFocus = typeof followUp.coaching_focus === "string" ? followUp.coaching_focus : null;
        questionStage = typeof followUp.question_stage === "string"
          ? (followUp.question_stage as MotivationStage)
          : null;
        conversationMode = followUp.conversation_mode || null;
        currentSlot = followUp.current_slot ? (followUp.current_slot as MotivationStage) : null;
        currentIntent = followUp.current_intent || null;
        nextAdvanceCondition = followUp.next_advance_condition || null;
        progress = followUp.progress || null;
        causalGaps = Array.isArray(followUp.causal_gaps) ? (followUp.causal_gaps as CausalGap[]) : [];
        stageStatus = (followUp.stage_status as StageStatus | null) ?? null;
        updatedMessages = [
          ...messages,
          {
            role: "assistant" as const,
            content: followUp.question,
          },
        ];
      }
    }

    await db
      .update(motivationConversations)
      .set({
        generatedDraft: draftNormalized,
        charLimitType: String(charLimit) as "300" | "400" | "500",
        messages: updatedMessages,
        conversationContext: {
          ...conversationContext,
          draftSource: "conversation",
          draftReady: true,
          conversationMode: conversationMode || conversationContext.conversationMode || "deepdive",
          currentIntent: currentIntent || conversationContext.currentIntent || null,
          nextAdvanceCondition:
            nextAdvanceCondition || conversationContext.nextAdvanceCondition || null,
          causalGaps,
          questionStage: questionStage || conversationContext.questionStage,
          lastQuestionMeta: nextQuestion
            ? {
                ...((conversationContext.lastQuestionMeta || {}) as LastQuestionMeta),
                questionText: nextQuestion,
                question_stage: questionStage || conversationContext.questionStage,
              }
            : (conversationContext.lastQuestionMeta as LastQuestionMeta | null) || null,
        } satisfies MotivationConversationContext,
        questionStage: questionStage || conversation.questionStage,
        lastEvidenceCards: evidenceCards,
        stageStatus,
        updatedAt: new Date(),
      })
      .where(eq(motivationConversations.id, conversation.id));

    return NextResponse.json({
      draft: draftNormalized,
      charCount: data.char_count,
      keyPoints: data.key_points,
      companyKeywords: data.company_keywords,
      documentId: null,
      nextQuestion,
      evidenceSummary,
      evidenceCards,
      coachingFocus,
      questionStage,
      conversationMode,
      currentSlot,
      currentIntent,
      nextAdvanceCondition,
      progress,
      causalGaps,
      stageStatus,
      messages: updatedMessages,
    });
  } catch (error) {
    if (reservationId) await cancelReservation(reservationId);
    console.error("[Motivation Draft] Error:", error);
    logAiCreditCostSummary({
      feature: "motivation_draft",
      requestId,
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return NextResponse.json({ error: "ES生成中にエラーが発生しました" }, { status: 503 });
  }
}
