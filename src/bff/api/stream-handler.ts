import "server-only";

import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity, type RequestIdentity } from "@/bff/identity/request-identity";
import { guardDailyTokenLimit } from "@/bff/identity/llm-cost-guard";
import {
  CONVERSATION_RATE_LAYERS,
  enforceRateLimitLayers,
} from "@/lib/rate-limit-spike";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { buildFastApiErrorResponseOptions } from "@/lib/server/fastapi-detail-message";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import {
  STREAM_FEATURE_CONFIGS,
  type StreamFeature,
} from "@/lib/fastapi/stream-config";
import {
  createConfiguredSSEProxyResponse,
  fetchConfiguredUpstreamSSE,
} from "@/lib/fastapi/stream-pipeline";
import type { CreateCareerPrincipalInput } from "@/lib/fastapi/career-principal";
import type {
  SSEProxyCompleteResult,
  SSEProxyProgressResult,
} from "@/lib/fastapi/sse-proxy";

export interface StreamCompleteMeta {
  telemetry: InternalCostTelemetry | null;
  identity: RequestIdentity;
}

export interface StreamFinalSummary {
  success: boolean;
  errorSeen: boolean;
  telemetry: InternalCostTelemetry | null;
  identity: RequestIdentity;
}

export interface StreamHandlerConfig<TContext> {
  feature: StreamFeature;
  rateLimit?: boolean;

  prepare: (args: {
    request: NextRequest;
    paramId: string;
    identity: RequestIdentity;
    requestId: string;
    answer: string;
    body: Record<string, unknown>;
  }) => Promise<TContext | Response>;

  getUpstream: (ctx: TContext) => {
    payload: Record<string, unknown>;
    endpointPath?: string;
    principal: CreateCareerPrincipalInput;
  };

  onProgress?: (
    ctx: TContext,
    event: Record<string, unknown>,
  ) => SSEProxyProgressResult | void;

  onComplete: (
    ctx: TContext,
    event: Record<string, unknown>,
    meta: StreamCompleteMeta,
  ) => Promise<SSEProxyCompleteResult | void>;

  onStreamError?: (ctx: TContext) => Promise<void>;

  onFinally?: (
    ctx: TContext,
    summary: StreamFinalSummary,
  ) => void | Promise<void>;

  errorMeta: {
    authCode: string;
    authMessage: string;
  };
}

export function createConversationStreamHandler<TContext>(
  config: StreamHandlerConfig<TContext>,
) {
  return async function POST(
    request: NextRequest,
    { params }: { params: Promise<Record<string, string>> },
  ) {
    const resolvedParams = await params;
    const paramId =
      resolvedParams.id ??
      resolvedParams.companyId ??
      Object.values(resolvedParams)[0] ??
      "";
    const requestId = getRequestId(request);

    try {
      const identity = await getRequestIdentity(request);
      if (!identity?.userId) {
        return createApiErrorResponse(request, {
          status: 401,
          code: config.errorMeta.authCode,
          userMessage: config.errorMeta.authMessage,
          action: "ログインしてから、もう一度お試しください。",
        });
      }

      const limitResponse = await guardDailyTokenLimit(identity, request);
      if (limitResponse) return limitResponse;

      if (config.rateLimit) {
        const rateLimited = await enforceRateLimitLayers(
          request,
          [...CONVERSATION_RATE_LAYERS],
          identity.userId,
          identity.guestId,
          `${config.feature}_conversation_stream`,
        );
        if (rateLimited) return rateLimited;
      }

      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

      const answer =
        typeof body.answer === "string" && body.answer.trim().length > 0
          ? body.answer.trim()
          : "";
      if (!answer) {
        return createApiErrorResponse(request, {
          status: 400,
          code: `${config.feature.toUpperCase()}_ANSWER_REQUIRED`,
          userMessage: "回答内容が空です。",
          action: "回答を入力してから送信してください。",
        });
      }

      const contextOrResponse = await config.prepare({
        request,
        paramId,
        identity,
        requestId,
        answer,
        body,
      });
      if (contextOrResponse instanceof Response) return contextOrResponse;
      const context = contextOrResponse;

      const upstream = config.getUpstream(context);
      const streamConfig = STREAM_FEATURE_CONFIGS[config.feature];

      let upstreamResult;
      try {
        upstreamResult = await fetchConfiguredUpstreamSSE({
          config: streamConfig,
          requestId,
          principal: upstream.principal,
          payload: upstream.payload,
          endpointPath: upstream.endpointPath,
        });
      } catch (fetchError) {
        logAiCreditCostSummary({
          feature: config.feature,
          requestId,
          status: "failed",
          creditsUsed: 0,
          telemetry: null,
        });
        await config.onStreamError?.(context);
        if (isSecretMissingError(fetchError)) {
          return createApiErrorResponse(request, {
            status: 503,
            code: "FASTAPI_SECRET_NOT_CONFIGURED",
            userMessage: "AI機能を利用できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            error: fetchError,
            logContext: `${config.feature}-stream:secret`,
          });
        }
        const status =
          fetchError instanceof Error && fetchError.name === "AbortError"
            ? 504
            : 502;
        return createApiErrorResponse(request, {
          status,
          code:
            status === 504
              ? "FASTAPI_TIMEOUT"
              : `${config.feature.toUpperCase()}_STREAM_FAILED`,
          userMessage:
            status === 504
              ? "AIの応答がタイムアウトしました。再度お試しください。"
              : "AIサービスに接続できませんでした",
          action: "時間をおいて、もう一度お試しください。",
          retryable: true,
          error: fetchError,
          logContext: `${config.feature}-stream:fetch`,
        });
      }

      if (!upstreamResult.response.ok) {
        upstreamResult.clearTimeout();
        await config.onStreamError?.(context);
        const raw = await upstreamResult.response.json().catch(() => ({}));
        const { payload: errPayload, telemetry } =
          raw && typeof raw === "object"
            ? splitInternalTelemetry(raw as Record<string, unknown>)
            : {
                payload: raw,
                telemetry: null as InternalCostTelemetry | null,
              };
        logAiCreditCostSummary({
          feature: config.feature,
          requestId,
          status: "failed",
          creditsUsed: 0,
          telemetry,
        });
        return createApiErrorResponse(request, {
          ...buildFastApiErrorResponseOptions({
            status: upstreamResult.response.status,
            payload: errPayload,
            defaultCode: `${config.feature.toUpperCase()}_STREAM_FAILED`,
            defaultUserMessage: "AIサービスに接続できませんでした",
            defaultAction: "時間をおいて、もう一度お試しください。",
          }),
          logContext: `${config.feature}-stream:fastapi`,
        });
      }

      let latestTelemetry: InternalCostTelemetry | null = null;
      let errorSeen = false;

      return createConfiguredSSEProxyResponse({
        config: streamConfig,
        upstreamResponse: upstreamResult.response,
        clearUpstreamTimeout: upstreamResult.clearTimeout,
        requestId,
        onCostTelemetry: (t) => {
          latestTelemetry = t ?? latestTelemetry;
        },
        onProgress: config.onProgress
          ? (event) => config.onProgress!(context, event)
          : undefined,
        onComplete: (event) =>
          config.onComplete(context, event, {
            telemetry: latestTelemetry,
            identity,
          }),
        onError: config.onStreamError
          ? async () => {
              errorSeen = true;
              await config.onStreamError!(context);
            }
          : undefined,
        onFinally: config.onFinally
          ? async (summary) =>
              config.onFinally!(context, {
                ...summary,
                errorSeen,
                telemetry: latestTelemetry,
                identity,
              })
          : undefined,
      });
    } catch (error) {
      return createApiErrorResponse(request, {
        status: 500,
        code: `${config.feature.toUpperCase()}_STREAM_INTERNAL_ERROR`,
        userMessage: "ストリーミング処理中にエラーが発生しました。",
        action: "時間をおいて、もう一度お試しください。",
        error,
        logContext: `${config.feature}-stream`,
      });
    }
  };
}
