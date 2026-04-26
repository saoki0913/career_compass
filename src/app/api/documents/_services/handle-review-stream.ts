/**
 * ES review SSE orchestration (shared by App Router POST handler).
 * Transport entrypoint: `src/app/api/documents/[id]/review/stream/route.ts`.
 * Uses shared SSE infrastructure (fetchUpstreamSSE + createSSEProxyStream).
 */

import { NextRequest } from "next/server";
import { esReviewStreamPolicy } from "@/lib/api-route/billing/es-review-stream-policy";
import { STREAM_FEATURE_CONFIGS } from "@/lib/fastapi/stream-config";
import {
  createConfiguredSSEProxyResponse,
  fetchConfiguredUpstreamSSE,
} from "@/lib/fastapi/stream-pipeline";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import { prepareReviewStreamContext } from "./review-stream-context";

const jsonErr = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });

export async function handleReviewStream(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  backendPath: string = "/api/es/review/stream",
) {
  const requestId = getRequestId(request);
  try {
    const { id: documentId } = await params;
    const prepared = await prepareReviewStreamContext(request, documentId);
    if (!prepared.ok) return prepared.response;

    const precheckResult = await esReviewStreamPolicy.precheck(prepared.billingContext);
    if (!precheckResult.ok) return precheckResult.errorResponse!;
    const reserveResult = await esReviewStreamPolicy.reserve!(prepared.billingContext, prepared.creditCost);
    if (reserveResult.errorResponse) return reserveResult.errorResponse;
    const reservationId: string | null = reserveResult.reservationId;

    const streamConfig = STREAM_FEATURE_CONFIGS.es_review;
    let upstream: Awaited<ReturnType<typeof fetchConfiguredUpstreamSSE>>;
    try {
      upstream = await fetchConfiguredUpstreamSSE({
        config: streamConfig,
        endpointPath: backendPath,
        requestId,
        principal: prepared.principal,
        payload: prepared.payload,
      });
    } catch (fetchError) {
      await esReviewStreamPolicy.cancel(prepared.billingContext, reservationId, "fastapi_fetch_exception");
      if (isSecretMissingError(fetchError)) {
        logAiCreditCostSummary({ feature: "es_review", requestId, status: "failed", creditsUsed: 0, telemetry: null });
        return jsonErr("AI認証設定が未完了です。管理側で設定確認後に再度お試しください。", 503);
      }
      throw fetchError;
    }

    if (!upstream.response.ok) {
      upstream.clearTimeout();
      await esReviewStreamPolicy.cancel(prepared.billingContext, reservationId, "fastapi_not_ok");
      const raw = await upstream.response.json().catch(() => null);
      const { payload: errorBody, telemetry } = raw && typeof raw === "object"
        ? splitInternalTelemetry(raw as Record<string, unknown>)
        : { payload: raw, telemetry: null as InternalCostTelemetry | null };
      logAiCreditCostSummary({ feature: "es_review", requestId, status: "failed", creditsUsed: 0, telemetry });
      return new Response(
        JSON.stringify({
          error: (errorBody as { detail?: { error?: string } } | null)?.detail?.error || "AI review failed",
          error_type: (errorBody as { detail?: { error_type?: string } } | null)?.detail?.error_type,
        }),
        { status: upstream.response.status, headers: { "Content-Type": "application/json" } },
      );
    }

    let creditConfirmed = false;
    let summaryLogged = false;
    let latestTelemetry: InternalCostTelemetry | null = null;
    const logOnce = (st: "success" | "failed" | "cancelled", cr: number) => {
      if (summaryLogged) return;
      summaryLogged = true;
      logAiCreditCostSummary({ feature: "es_review", requestId, status: st, creditsUsed: cr, telemetry: latestTelemetry });
    };

    return createConfiguredSSEProxyResponse({
      config: streamConfig,
      upstreamResponse: upstream.response,
      clearUpstreamTimeout: upstream.clearTimeout,
      requestId,
      onCostTelemetry: (telemetry) => { latestTelemetry = telemetry ?? latestTelemetry; },
      onComplete: async () => {
        if (creditConfirmed) return;
        await esReviewStreamPolicy.confirm(
          prepared.billingContext,
          { kind: "billable_success", creditsConsumed: prepared.creditCost, freeQuotaUsed: false },
          reservationId,
        );
        creditConfirmed = true;
        logOnce("success", prepared.creditCost);
        void incrementDailyTokenCount(prepared.identity, computeTotalTokens(latestTelemetry));
      },
      onError: async () => { logOnce("failed", 0); },
      onFinally: async () => {
        if (!creditConfirmed && reservationId) {
          await esReviewStreamPolicy.cancel(prepared.billingContext, reservationId, "stream_ended_without_complete");
        }
        if (!summaryLogged) logOnce("cancelled", 0);
      },
    });
  } catch {
    logAiCreditCostSummary({ feature: "es_review", requestId, status: "failed", creditsUsed: 0, telemetry: null });
    return jsonErr("Internal server error", 500);
  }
}
