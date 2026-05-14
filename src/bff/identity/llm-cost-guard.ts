/**
 * Shared guard for daily LLM token cost limits.
 *
 * Call after auth check and before any FastAPI LLM invocation.
 * Returns a 429 Response if the identity has exceeded the daily token budget,
 * or null if the request may proceed.
 */

import type { NextRequest } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import type { RequestIdentity } from "@/bff/identity/request-identity";
import { checkDailyTokenLimit, getRetryAfterSeconds } from "@/lib/llm-cost-limit";
import { getUserPlan } from "@/lib/credits/shared";

export async function guardDailyTokenLimit(
  identity: RequestIdentity,
  request?: NextRequest,
): Promise<Response | null> {
  const plan = identity.userId
    ? await getUserPlan(identity.userId)
    : "guest";

  const result = await checkDailyTokenLimit(identity, plan);

  switch (result.status) {
    case "allowed":
    case "bypassed":
      return null;

    case "service_unavailable":
      return createApiErrorResponse(request, {
        status: 503,
        code: "TOKEN_LIMIT_SERVICE_UNAVAILABLE",
        userMessage: "現在、AI機能を一時的に利用できません。",
        action: "数分後にもう一度お試しください。クレジットは消費されていません。",
        retryable: true,
      });

    case "limit_exceeded":
      return createApiErrorResponse(request, {
        status: 429,
        code: "DAILY_TOKEN_LIMIT_EXCEEDED",
        userMessage: "本日のAI利用量の上限に達しました。",
        action: "日本時間の翌日0時以降にもう一度お試しください。クレジットは消費されていません。",
        retryable: true,
        extra: { resetAtUtc: result.resetAtUtc.toISOString() },
        headers: { "Retry-After": String(getRetryAfterSeconds()) },
      });
  }
}
