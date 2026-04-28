import { NextRequest } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { fetchGakuchikaContext, fetchProfileContext } from "@/lib/ai/user-context";
import { motivationStreamPolicy } from "@/lib/api-route/billing/motivation-stream-policy";
import { STREAM_FEATURE_CONFIGS } from "@/lib/fastapi/stream-config";
import {
  createConfiguredSSEProxyResponse,
  fetchConfiguredUpstreamSSE,
} from "@/lib/fastapi/stream-pipeline";
import { buildFastApiErrorResponseOptions } from "@/lib/server/fastapi-detail-message";
import { type Message, safeParseConversationContext as parseConversationContext, safeParseMessages, safeParseScores } from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
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
} from "./stream-service";

const apiErr = (
  request: NextRequest,
  status: number,
  code: string,
  userMessage: string,
  action?: string,
  retryable = false,
) =>
  createApiErrorResponse(request, {
    status,
    code,
    userMessage,
    action,
    retryable,
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const requestId = getRequestId(request);
    const identity = await getRequestIdentity(request);
    if (!identity) return apiErr(request, 401, "MOTIVATION_STREAM_AUTH_REQUIRED", "認証が必要です");
    const { userId, guestId } = identity;
    if (!userId) return apiErr(request, 401, "MOTIVATION_STREAM_AUTH_REQUIRED", "志望動機のAI支援はログインが必要です");

    const limitResponse = await guardDailyTokenLimit(identity);
    if (limitResponse) return limitResponse;
    const rateLimited = await enforceRateLimitLayers(request, [...CONVERSATION_RATE_LAYERS], userId, guestId, "motivation_conversation_stream");
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { answer } = body;
    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return apiErr(request, 400, "MOTIVATION_STREAM_EMPTY_ANSWER", "回答を入力してください");
    }

    const company = await getOwnedMotivationCompanyData(companyId, identity);
    if (!company) return apiErr(request, 404, "MOTIVATION_COMPANY_NOT_FOUND", "企業が見つかりません");

    const conversation = await getConversationByCondition(
      buildMotivationOwnerCondition(companyId, userId, guestId),
    );
    if (!conversation) return apiErr(request, 404, "MOTIVATION_CONVERSATION_NOT_FOUND", "会話が見つかりません");

    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
    const newQuestionCount = currentQuestionCount + 1;
    const profileContext = await fetchProfileContext(userId);
    const applicationJobCandidates = await fetchMotivationApplicationJobCandidates(companyId, userId, guestId);
    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      parseConversationContext(conversation.conversationContext),
      applicationJobCandidates,
    );

    if (!isMotivationSetupComplete(resolvedInputs.conversationContext, resolvedInputs.requiresIndustrySelection)) {
      return apiErr(request, 400, "MOTIVATION_SETUP_INCOMPLETE", "先に業界・職種の設定を完了してください");
    }
    if (messages.length === 0) return apiErr(request, 400, "MOTIVATION_CONVERSATION_NOT_STARTED", "先に質問を開始してください");

    const shouldConsumeCredit = !!userId;
    const billingContext = { userId: userId!, newQuestionCount, companyId };
    const precheckResult = await motivationStreamPolicy.precheck(billingContext);
    if (!precheckResult.ok) return precheckResult.errorResponse!;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: answer.trim() };
    messages.push(userMessage);

    const scores = safeParseScores(conversation.motivationScores);
    const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];

    const principalPlan = await getViewerPlan(identity);
    const streamConfig = STREAM_FEATURE_CONFIGS.motivation;
    let upstream: Awaited<ReturnType<typeof fetchConfiguredUpstreamSSE>>;
    try {
      upstream = await fetchConfiguredUpstreamSSE({
        config: streamConfig,
        requestId,
        principal: {
          scope: "ai-stream",
          actor: userId ? { kind: "user", id: userId } : { kind: "guest", id: guestId! },
          companyId,
          plan: principalPlan,
        },
        payload: buildMotivationStreamPayload({
          company,
          resolvedInputs,
          messages,
          newQuestionCount,
          scores,
          generatedDraft: conversation.generatedDraft ?? null,
          gakuchikaContext,
          profileContext,
          applicationJobCandidates,
        }),
      });
    } catch (fetchError) {
      logAiCreditCostSummary({ feature: "motivation", requestId, status: "failed", creditsUsed: 0, telemetry: null });
      if (isSecretMissingError(fetchError)) {
        return createApiErrorResponse(request, {
          status: 503,
          code: "FASTAPI_SECRET_NOT_CONFIGURED",
          userMessage: "AI認証設定が未完了です。管理側で設定確認後に再度お試しください。",
          action: "管理側で AI 認証設定を確認してから、もう一度お試しください。",
          error: fetchError,
          logContext: "motivation-conversation-stream:secret",
        });
      }
      const s = fetchError instanceof Error && fetchError.name === "AbortError" ? 504 : 502;
      return createApiErrorResponse(request, {
        status: s,
        code: s === 504 ? "FASTAPI_TIMEOUT" : "MOTIVATION_CONVERSATION_STREAM_FAILED",
        userMessage: s === 504 ? "AIの応答がタイムアウトしました。再度お試しください。" : "AIサービスに接続できませんでした",
        action: "時間をおいて、もう一度お試しください。",
        retryable: true,
        error: fetchError,
        logContext: "motivation-conversation-stream:fetch",
      });
    }

    if (!upstream.response.ok) {
      upstream.clearTimeout();
      const raw = await upstream.response.json().catch(() => ({}));
      const { payload, telemetry } = raw && typeof raw === "object"
        ? splitInternalTelemetry(raw as Record<string, unknown>)
        : { payload: raw, telemetry: null as InternalCostTelemetry | null };
      logAiCreditCostSummary({ feature: "motivation", requestId, status: "failed", creditsUsed: 0, telemetry });
      return createApiErrorResponse(request, {
        ...buildFastApiErrorResponseOptions({
          status: upstream.response.status,
          payload,
          defaultCode: "MOTIVATION_CONVERSATION_STREAM_FAILED",
          defaultUserMessage: "AIサービスに接続できませんでした",
          defaultAction: "時間をおいて、もう一度お試しください。",
        }),
        logContext: "motivation-conversation-stream:fastapi",
      });
    }

    let latestTelemetry: InternalCostTelemetry | null = null;
    let billingOutcomeStatus: MotivationStreamBillingStatus | null = null;
    let creditsAppliedForSummary = 0;
    let summaryLogged = false;
    const logOnce = (st: "success" | "failed" | "cancelled", cr: number) => {
      if (summaryLogged) return;
      summaryLogged = true;
      logAiCreditCostSummary({ feature: "motivation", requestId, status: st, creditsUsed: cr, telemetry: latestTelemetry });
    };

    return createConfiguredSSEProxyResponse({
      config: streamConfig,
      upstreamResponse: upstream.response,
      clearUpstreamTimeout: upstream.clearTimeout,
      requestId,
      onCostTelemetry: (telemetry) => { latestTelemetry = telemetry ?? latestTelemetry; },
      onComplete: async (event) => {
        const completeResult = await completeMotivationStreamTurn({
          fastApiData: (event.data || {}) as MotivationStreamCompleteData,
          conversation,
          messages,
          newQuestionCount,
          scores,
          resolvedInputs,
          shouldConsumeCredit,
          billingContext,
        });
        billingOutcomeStatus = completeResult.billingStatus;
        creditsAppliedForSummary = completeResult.creditsApplied;
        return completeResult.result;
      },
      onError: async () => { billingOutcomeStatus = "failed"; },
      onFinally: () => {
        if (billingOutcomeStatus === "success") {
          logOnce("success", creditsAppliedForSummary);
          void incrementDailyTokenCount(identity, computeTotalTokens(latestTelemetry));
        } else if (billingOutcomeStatus === "failed") {
          logOnce("failed", 0);
        } else {
          logOnce("cancelled", 0);
        }
      },
    });

  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "MOTIVATION_CONVERSATION_STREAM_INTERNAL_ERROR",
      userMessage: "ストリーミング処理中にエラーが発生しました。",
      action: "時間をおいて、もう一度お試しください。",
      error,
      logContext: "motivation-conversation-stream",
    });
  }
}
