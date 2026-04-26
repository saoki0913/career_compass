import { NextRequest } from "next/server";
import { fetchGakuchikaContext, fetchProfileContext } from "@/lib/ai/user-context";
import { motivationStreamPolicy } from "@/lib/api-route/billing/motivation-stream-policy";
import { STREAM_FEATURE_CONFIGS } from "@/lib/fastapi/stream-config";
import {
  createConfiguredSSEProxyResponse,
  fetchConfiguredUpstreamSSE,
} from "@/lib/fastapi/stream-pipeline";
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

const jsonErr = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const requestId = getRequestId(request);
    const identity = await getRequestIdentity(request);
    if (!identity) return jsonErr("認証が必要です", 401);
    const { userId, guestId } = identity;
    if (!userId) return jsonErr("志望動機のAI支援はログインが必要です", 401);

    const limitResponse = await guardDailyTokenLimit(identity);
    if (limitResponse) return limitResponse;
    const rateLimited = await enforceRateLimitLayers(request, [...CONVERSATION_RATE_LAYERS], userId, guestId, "motivation_conversation_stream");
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { answer } = body;
    if (!answer || typeof answer !== "string" || !answer.trim()) return jsonErr("回答を入力してください", 400);

    const company = await getOwnedMotivationCompanyData(companyId, identity);
    if (!company) return jsonErr("企業が見つかりません", 404);

    const conversation = await getConversationByCondition(
      buildMotivationOwnerCondition(companyId, userId, guestId),
    );
    if (!conversation) return jsonErr("会話が見つかりません", 404);

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
      return jsonErr("先に業界・職種の設定を完了してください", 400);
    }
    if (messages.length === 0) return jsonErr("先に質問を開始してください", 400);

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
        return jsonErr("AI認証設定が未完了です。管理側で設定確認後に再度お試しください。", 503);
      }
      const s = fetchError instanceof Error && fetchError.name === "AbortError" ? 504 : 502;
      return jsonErr(s === 504 ? "AIの応答がタイムアウトしました。再度お試しください。" : "AIサービスに接続できませんでした", s);
    }

    if (!upstream.response.ok) {
      upstream.clearTimeout();
      const raw = await upstream.response.json().catch(() => ({}));
      const { payload, telemetry } = raw && typeof raw === "object"
        ? splitInternalTelemetry(raw as Record<string, unknown>)
        : { payload: raw, telemetry: null as InternalCostTelemetry | null };
      logAiCreditCostSummary({ feature: "motivation", requestId, status: "failed", creditsUsed: 0, telemetry });
      return jsonErr(
        (payload as { detail?: { error?: string } } | null)?.detail?.error || "AIサービスに接続できませんでした",
        upstream.response.status,
      );
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
    console.error("Error in motivation stream:", error);
    return jsonErr("Internal server error", 500);
  }
}
