import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import { createConversationStreamHandler } from "@/bff/api/stream-handler";
import { fetchGakuchikaContext, fetchProfileContext } from "@/lib/ai/user-context";
import { motivationStreamPolicy } from "@/bff/billing/motivation-stream-policy";
import {
  logAiCreditCostSummary,
} from "@/lib/ai/cost-summary-log";
import {
  type Message,
  safeParseConversationContext as parseConversationContext,
  safeParseMessages,
  safeParseScores,
} from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import {
  buildMotivationOwnerCondition,
  fetchMotivationApplicationJobCandidates,
  getOwnedMotivationCompanyData,
  isMotivationSetupComplete,
  resolveMotivationInputs,
} from "@/lib/motivation/motivation-input-resolver";
import {
  buildMotivationStreamPayload,
  completeMotivationStreamTurn,
  type MotivationStreamBillingStatus,
  type MotivationStreamCompleteData,
} from "@/bff/motivation/stream-service";
import type { CreateCareerPrincipalInput } from "@/lib/fastapi/career-principal";

interface MotivationStreamContext {
  companyId: string;
  userId: string;
  guestId: string | null;
  conversation: Awaited<ReturnType<typeof getConversationByCondition>>;
  messages: Message[];
  newQuestionCount: number;
  scores: ReturnType<typeof safeParseScores>;
  resolvedInputs: ReturnType<typeof resolveMotivationInputs>;
  shouldConsumeCredit: boolean;
  billingContext: { userId: string; newQuestionCount: number; companyId: string };
  principal: CreateCareerPrincipalInput;
  upstreamPayload: Record<string, unknown>;
  billingOutcomeStatus: MotivationStreamBillingStatus | null;
  creditsAppliedForSummary: number;
}

export const POST = createConversationStreamHandler<MotivationStreamContext>({
  feature: "motivation",
  rateLimit: true,
  errorMeta: {
    authCode: "MOTIVATION_STREAM_AUTH_REQUIRED",
    authMessage: "志望動機のAI支援はログインが必要です",
  },

  async prepare({
    paramId: companyId,
    identity,
    answer,
    request,
  }) {
    const { userId, guestId } = identity;

    const company = await getOwnedMotivationCompanyData(companyId, identity);
    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "MOTIVATION_COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりません",
      });
    }

    const conversation = await getConversationByCondition(
      buildMotivationOwnerCondition(companyId, userId!, guestId),
    );
    if (!conversation) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "MOTIVATION_CONVERSATION_NOT_FOUND",
        userMessage: "会話が見つかりません",
      });
    }

    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
    const newQuestionCount = currentQuestionCount + 1;
    const profileContext = await fetchProfileContext(userId!);
    const applicationJobCandidates = await fetchMotivationApplicationJobCandidates(
      companyId,
      userId!,
      guestId,
    );
    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      parseConversationContext(conversation.conversationContext),
      applicationJobCandidates,
    );

    if (
      !isMotivationSetupComplete(
        resolvedInputs.conversationContext,
        resolvedInputs.requiresIndustrySelection,
      )
    ) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "MOTIVATION_SETUP_INCOMPLETE",
        userMessage: "先に業界・職種の設定を完了してください",
      });
    }
    if (messages.length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "MOTIVATION_CONVERSATION_NOT_STARTED",
        userMessage: "先に質問を開始してください",
      });
    }

    const shouldConsumeCredit = !!userId;
    const billingContext = { userId: userId!, newQuestionCount, companyId };
    const precheckResult = await motivationStreamPolicy.precheck(billingContext);
    if (!precheckResult.ok) return precheckResult.errorResponse!;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: answer.trim(),
    };
    messages.push(userMessage);

    const scores = safeParseScores(conversation.motivationScores);
    const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];

    const principalPlan = await getViewerPlan(identity);
    const upstreamPayload = buildMotivationStreamPayload({
      company,
      resolvedInputs,
      messages,
      newQuestionCount,
      scores,
      generatedDraft: conversation.generatedDraft ?? null,
      gakuchikaContext,
      profileContext,
      applicationJobCandidates,
    });

    return {
      companyId,
      userId: userId!,
      guestId,
      conversation,
      messages,
      newQuestionCount,
      scores,
      resolvedInputs,
      shouldConsumeCredit,
      billingContext,
      principal: {
        scope: "ai-stream" as const,
        actor: userId
          ? { kind: "user" as const, id: userId }
          : { kind: "guest" as const, id: guestId! },
        companyId,
        plan: principalPlan,
      },
      upstreamPayload,
      billingOutcomeStatus: null,
      creditsAppliedForSummary: 0,
    };
  },

  getUpstream(ctx) {
    return {
      payload: ctx.upstreamPayload,
      principal: ctx.principal,
    };
  },

  async onComplete(ctx, event) {
    const completeResult = await completeMotivationStreamTurn({
      fastApiData: (event.data || {}) as MotivationStreamCompleteData,
      conversation: ctx.conversation!,
      messages: ctx.messages,
      newQuestionCount: ctx.newQuestionCount,
      scores: ctx.scores,
      resolvedInputs: ctx.resolvedInputs,
      shouldConsumeCredit: ctx.shouldConsumeCredit,
      billingContext: ctx.billingContext,
    });
    ctx.billingOutcomeStatus = completeResult.billingStatus;
    ctx.creditsAppliedForSummary = completeResult.creditsApplied;
    return completeResult.result;
  },

  async onStreamError(ctx) {
    ctx.billingOutcomeStatus = "failed";
  },

  async onFinally(ctx, { telemetry, identity }) {
    if (ctx.billingOutcomeStatus === "success") {
      logAiCreditCostSummary({
        feature: "motivation",
        requestId: "",
        status: "success",
        creditsUsed: ctx.creditsAppliedForSummary,
        telemetry,
      });
      void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));
    } else if (ctx.billingOutcomeStatus === "failed") {
      logAiCreditCostSummary({
        feature: "motivation",
        requestId: "",
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
    } else {
      logAiCreditCostSummary({
        feature: "motivation",
        requestId: "",
        status: "cancelled",
        creditsUsed: 0,
        telemetry,
      });
    }
  },
});
