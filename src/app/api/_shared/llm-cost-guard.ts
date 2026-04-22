/**
 * Shared guard for daily LLM token cost limits.
 *
 * Call after auth check and before any FastAPI LLM invocation.
 * Returns a 429 Response if the identity has exceeded the daily token budget,
 * or null if the request may proceed.
 */

import { NextResponse } from "next/server";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { checkDailyTokenLimit, getRetryAfterSeconds } from "@/lib/llm-cost-limit";
import { getUserPlan } from "@/lib/credits/shared";

export async function guardDailyTokenLimit(
  identity: RequestIdentity,
): Promise<Response | null> {
  const plan = identity.userId
    ? await getUserPlan(identity.userId)
    : "guest";

  const result = await checkDailyTokenLimit(identity, plan);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "daily_token_limit_exceeded", resetAtUtc: result.resetAtUtc.toISOString() },
      {
        status: 429,
        headers: { "Retry-After": String(getRetryAfterSeconds()) },
      },
    );
  }
  return null;
}
