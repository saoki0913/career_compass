/**
 * ES review SSE orchestration (shared by App Router POST handler).
 * Transport entrypoint: `src/app/api/documents/[id]/review/stream/route.ts`.
 * Uses shared SSE infrastructure (fetchUpstreamSSE + createSSEProxyStream).
 */

import { NextRequest } from "next/server";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { requireOwnerMutationRequest } from "@/bff/api/mutation-guard";
import { esReviewStreamPolicy } from "@/bff/billing/es-review-stream-policy";
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
import {
  sanitizePublicESReviewCompleteEvent,
  sanitizePublicESReviewErrorEvent,
  sanitizePublicESReviewProgressEvent,
} from "./public-review-stream";

function getCompleteResult(event: Record<string, unknown>): Record<string, unknown> | null {
  const direct = event.result;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  return null;
}

function isValidReviewCompleteEvent(event: Record<string, unknown>): boolean {
  const result = getCompleteResult(event);
  if (!result) return false;

  const rewrites = result.rewrites;
  return Array.isArray(rewrites)
    && rewrites.some((rewrite) => typeof rewrite === "string" && rewrite.trim().length > 0);
}

function getBillingOutcome(event: Record<string, unknown>): Record<string, unknown> | null {
  const result = getCompleteResult(event);
  const outcome = result?.billing_outcome;
  if (outcome && typeof outcome === "object" && !Array.isArray(outcome)) {
    return outcome as Record<string, unknown>;
  }
  return null;
}

function isBillableReviewCompleteEvent(event: Record<string, unknown>): boolean {
  const outcome = getBillingOutcome(event);
  return outcome?.success === true
    && outcome.billable === true
    && isValidReviewCompleteEvent(event);
}

function extractUpstreamErrorType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as Record<string, unknown>;
  const detail = body.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const errorType = (detail as Record<string, unknown>).error_type;
    return typeof errorType === "string" ? errorType : undefined;
  }
  const errorType = body.error_type;
  return typeof errorType === "string" ? errorType : undefined;
}

function upstreamFailureMessage(status: number): string {
  if (status === 429) {
    return "AI添削の利用が集中しています。少し時間を置いてからお試しください。";
  }
  if (status >= 400 && status < 500) {
    return "入力内容や設定を確認して、もう一度お試しください。";
  }
  return "AI添削を完了できませんでした。時間を置いて、もう一度お試しください。";
}

export async function handleReviewStream(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  backendPath: string = "/api/es/review/stream",
) {
  const requestId = getRequestId(request);
  try {
    const mutationGuard = requireOwnerMutationRequest(request);
    if (!mutationGuard.ok) return mutationGuard.response;

    const { id: documentId } = await params;
    const prepared = await prepareReviewStreamContext(request, documentId);
    if (!prepared.ok) return prepared.response;
    const billingContext = { ...prepared.billingContext, requestId };

    const precheckResult = await esReviewStreamPolicy.precheck(billingContext);
    if (!precheckResult.ok) return precheckResult.errorResponse!;
    const reserveResult = await esReviewStreamPolicy.reserve!(billingContext, prepared.creditCost);
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
      await esReviewStreamPolicy.cancel(billingContext, reservationId, "fastapi_fetch_exception");
      if (isSecretMissingError(fetchError)) {
        logAiCreditCostSummary({ feature: "es_review", requestId, status: "failed", creditsUsed: 0, telemetry: null });
        return createApiErrorResponse(request, {
          status: 503,
          code: "ES_REVIEW_AI_AUTH_NOT_CONFIGURED",
          userMessage: "AI機能を利用できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
          requestId,
          logContext: "es_review_stream_secret_missing",
          error: fetchError,
        });
      }
      throw fetchError;
    }

    if (!upstream.response.ok) {
      upstream.clearTimeout();
      await esReviewStreamPolicy.cancel(billingContext, reservationId, "fastapi_not_ok");
      const raw = await upstream.response.json().catch(() => null);
      const { payload: errorBody, telemetry } = raw && typeof raw === "object"
        ? splitInternalTelemetry(raw as Record<string, unknown>)
        : { payload: raw, telemetry: null as InternalCostTelemetry | null };
      const llmErrorType = extractUpstreamErrorType(errorBody);
      logAiCreditCostSummary({ feature: "es_review", requestId, status: "failed", creditsUsed: 0, telemetry });
      return createApiErrorResponse(request, {
        status: upstream.response.status,
        code: "ES_REVIEW_UPSTREAM_FAILED",
        userMessage: upstreamFailureMessage(upstream.response.status),
        action: "時間を置いて、もう一度お試しください。",
        retryable: upstream.response.status >= 500 || upstream.response.status === 429,
        llmErrorType,
        requestId,
        logContext: "es_review_stream_upstream_not_ok",
        extra: {
          upstreamStatus: upstream.response.status,
          ...(llmErrorType ? { llmErrorType } : {}),
        },
      });
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
      onProgress: sanitizePublicESReviewProgressEvent,
      onComplete: async (event) => {
        if (!isBillableReviewCompleteEvent(event)) {
          logOnce("failed", 0);
          return {
            cancel: true,
            replaceEvent: {
              type: "error",
              message: "添削結果の形式が不正です。クレジットは消費されません。",
              code: "ES_REVIEW_INVALID_COMPLETE_PAYLOAD",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
          };
        }
        if (creditConfirmed) return;
        await esReviewStreamPolicy.confirm(
          billingContext,
          { kind: "billable_success", creditsConsumed: prepared.creditCost, freeQuotaUsed: false },
          reservationId,
        );
        creditConfirmed = true;
        logOnce("success", prepared.creditCost);
        void incrementDailyTokenCount(prepared.identity, computeTotalTokens(latestTelemetry));
        return { replaceEvent: sanitizePublicESReviewCompleteEvent(event) };
      },
      onErrorEvent: sanitizePublicESReviewErrorEvent,
      onError: async () => { logOnce("failed", 0); },
      onFinally: async () => {
        if (!creditConfirmed && reservationId) {
          await esReviewStreamPolicy.cancel(billingContext, reservationId, "stream_ended_without_complete");
        }
        if (!summaryLogged) logOnce("cancelled", 0);
      },
    });
  } catch (error) {
    logAiCreditCostSummary({ feature: "es_review", requestId, status: "failed", creditsUsed: 0, telemetry: null });
    return createApiErrorResponse(request, {
      status: 500,
      code: "ES_REVIEW_STREAM_INTERNAL_ERROR",
      userMessage: "ES添削を開始できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      requestId,
      logContext: "es_review_stream_unhandled_error",
      error,
    });
  }
}
