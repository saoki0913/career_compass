import { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { isSecretMissingError } from "@/lib/fastapi/secret-guard";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { splitInternalTelemetry } from "@/lib/ai/cost-summary-log";
import { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } from "@/lib/credits";
import { STREAM_FEATURE_CONFIGS } from "@/lib/fastapi/stream-config";
import {
  createConfiguredSSEProxyResponse,
  fetchConfiguredUpstreamSSE,
} from "@/lib/fastapi/stream-pipeline";
import type {
  InterviewClientCompleteData,
  UpstreamCompleteData,
} from "./stream-shared";
import { computeTotalTokens, incrementDailyTokenCount } from "@/lib/llm-cost-limit";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import {
  INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
  normalizeInterviewPersistenceError,
} from "./persistence-errors";

export {
  createImmediateInterviewStream,
  normalizeFeedback,
  type InterviewClientCompleteData,
  type UpstreamCompleteData,
} from "./stream-shared";

export async function createInterviewUpstreamStream(options: {
  request: NextRequest;
  identity?: RequestIdentity;
  companyId?: string;
  upstreamPath:
    | "/api/interview/start"
    | "/api/interview/turn"
    | "/api/interview/feedback"
    | "/api/interview/continue";
  upstreamPayload: Record<string, unknown>;
  onComplete: (data: UpstreamCompleteData) => Promise<InterviewClientCompleteData>;
  onAbort?: () => Promise<void>;
  onError?: () => Promise<void>;
}) {
  const principalPlan = await getViewerPlan(options.identity ?? { userId: null, guestId: null });
  let upstreamResponse: Response;
  let clearUpstreamTimeout: () => void;
  try {
    const result = await fetchConfiguredUpstreamSSE({
      config: STREAM_FEATURE_CONFIGS.interview,
      endpointPath: options.upstreamPath,
      payload: options.upstreamPayload,
      principal: {
        scope: "ai-stream",
        actor: options.identity?.userId
          ? { kind: "user", id: options.identity.userId }
          : { kind: "guest", id: options.identity?.guestId ?? "guest" },
        companyId: options.companyId ?? null,
        plan: principalPlan,
      },
    });
    upstreamResponse = result.response;
    clearUpstreamTimeout = result.clearTimeout;
  } catch (fetchError) {
    if (isSecretMissingError(fetchError)) {
      return createApiErrorResponse(options.request, {
        status: 503,
        code: "AI_AUTH_CONFIG_MISSING",
        userMessage: "AI認証設定が未完了です。",
        action: "管理側で設定確認後に再度お試しください。",
        retryable: true,
      });
    }
    throw fetchError;
  }

  if (!upstreamResponse.ok) {
    clearUpstreamTimeout();
    await options.onError?.();
    const data = await upstreamResponse.json().catch(() => null);
    return createApiErrorResponse(options.request, {
      status: upstreamResponse.status,
      code: "INTERVIEW_UPSTREAM_FAILED",
      userMessage:
        typeof data?.detail === "string"
          ? data.detail
          : "面接対策の応答生成に失敗しました。",
      action: "時間をおいて、もう一度お試しください。",
    });
  }

  let errorSeen = false;

  return createConfiguredSSEProxyResponse({
    config: STREAM_FEATURE_CONFIGS.interview,
    upstreamResponse,
    clearUpstreamTimeout,
    requestId: options.request.headers.get("x-request-id") ?? "",
    onComplete: async (event) => {
      // Interview complete events nest telemetry inside `data`, not at top level.
      const rawData = (event.data || {}) as Record<string, unknown>;
      const { payload: cleanData, telemetry } = splitInternalTelemetry(rawData);

      try {
        const clientData = await options.onComplete(cleanData as UpstreamCompleteData);
        if (options.identity && telemetry) {
          void incrementDailyTokenCount(options.identity, computeTotalTokens(telemetry));
        }
        return {
          replaceEvent: {
            type: "complete",
            data: {
              ...clientData,
              creditCost: clientData.creditCost ?? DEFAULT_INTERVIEW_SESSION_CREDIT_COST,
            },
          },
        };
      } catch (error) {
        // Persistence errors produce a specific SSE error event instead of
        // letting sse-proxy emit a generic one.
        const normalized = normalizeInterviewPersistenceError(error, {
          companyId: "unknown",
          operation: "interview:stream:onComplete",
        });
        if (normalized) {
          return {
            replaceEvent: {
              type: "error",
              code: INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE,
              message:
                "現在、面接対策の保存機能を一時的に利用できません。しばらくしてから再度お試しください。",
            },
          };
        }
        throw error;
      }
    },
    onError: async () => {
      errorSeen = true;
      await options.onError?.();
    },
    onFinally: async ({ success }) => {
      if (!success && !errorSeen) {
        await options.onAbort?.();
      }
    },
  });
}
