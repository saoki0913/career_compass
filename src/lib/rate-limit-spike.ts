/**
 * Layered rate limits + structured logging when a layer blocks (abuse / spike visibility).
 */

import type { NextRequest } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import {
  checkRateLimit,
  createRateLimitKey,
  RATE_LIMITS,
  type RateLimitConfig,
} from "@/lib/rate-limit";

/** Tighter burst buckets (same identity keys as primary limiters). */
export const BURST_RATE_LIMITS = {
  reviewBurst: { maxTokens: 5, refillRate: 0.083, windowMs: 60_000 },
  fetchInfoBurst: { maxTokens: 4, refillRate: 0.05, windowMs: 60_000 },
  conversationBurst: { maxTokens: 12, refillRate: 0.2, windowMs: 60_000 },
  companySearchBurst: { maxTokens: 3, refillRate: 0.05, windowMs: 60_000 },
  draftBurst: { maxTokens: 1, refillRate: 0.0167, windowMs: 60_000 },
  corporateMutateBurst: { maxTokens: 1, refillRate: 0.0112, windowMs: 60_000 },
} as const;

export function logRateLimitBlock(
  route: string,
  limiter: string,
  request: NextRequest,
  resetIn: number,
  identity: { userId: string | null; guestId: string | null }
) {
  console.warn(
    JSON.stringify({
      event: "rate_limit_block",
      route,
      limiter,
      resetIn,
      requestId: request.headers.get("x-request-id"),
      auth: identity.userId ? "user" : identity.guestId ? "guest" : "none",
    })
  );
}

/**
 * Apply limiters in order. First failure returns 429 Response.
 */
export async function enforceRateLimitLayers(
  request: NextRequest,
  layers: Array<{ limiterName: string; config: RateLimitConfig }>,
  userId: string | null,
  guestId: string | null,
  route: string
): Promise<Response | null> {
  for (const { limiterName, config } of layers) {
    const key = createRateLimitKey(limiterName, userId, guestId);
    const result = await checkRateLimit(key, config, limiterName);
    if (!result.allowed) {
      logRateLimitBlock(route, limiterName, request, result.resetIn, {
        userId,
        guestId,
      });
      const response = createApiErrorResponse(request, {
        status: 429,
        code: "RATE_LIMITED",
        userMessage: "リクエストが多すぎます。しばらく待ってから再試行してください。",
        action: `${result.resetIn}秒ほど待ってから、もう一度お試しください。`,
      });
      response.headers.set("Retry-After", String(result.resetIn));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
      return response;
    }
  }
  return null;
}

export const REVIEW_RATE_LAYERS = [
  { limiterName: "reviewBurst", config: BURST_RATE_LIMITS.reviewBurst },
  { limiterName: "review", config: RATE_LIMITS.review },
] as const;

export const FETCH_INFO_RATE_LAYERS = [
  { limiterName: "fetchInfoBurst", config: BURST_RATE_LIMITS.fetchInfoBurst },
  { limiterName: "fetchInfo", config: RATE_LIMITS.fetchInfo },
] as const;

export const CONVERSATION_RATE_LAYERS = [
  { limiterName: "conversationBurst", config: BURST_RATE_LIMITS.conversationBurst },
  { limiterName: "conversation", config: RATE_LIMITS.conversation },
] as const;

export const COMPANY_SEARCH_RATE_LAYERS = [
  { limiterName: "companySearchBurst", config: BURST_RATE_LIMITS.companySearchBurst },
  { limiterName: "companySearch", config: RATE_LIMITS.companySearch },
] as const;

export const COMPANY_COMPLIANCE_RATE_LAYERS = [
  { limiterName: "companySearchBurst", config: BURST_RATE_LIMITS.companySearchBurst },
  { limiterName: "companyCompliance", config: RATE_LIMITS.companyCompliance },
] as const;

export const DRAFT_RATE_LAYERS = [
  { limiterName: "draftBurst", config: BURST_RATE_LIMITS.draftBurst },
  { limiterName: "draft", config: RATE_LIMITS.draft },
] as const;

export const CORPORATE_MUTATE_RATE_LAYERS = [
  { limiterName: "corporateMutateBurst", config: BURST_RATE_LIMITS.corporateMutateBurst },
  { limiterName: "corporateMutate", config: RATE_LIMITS.corporateMutate },
] as const;

export const CORPORATE_DELETE_RATE_LAYERS = [
  { limiterName: "corporateDelete", config: RATE_LIMITS.corporateDelete },
] as const;

export const STATUS_POLL_RATE_LAYERS = [
  { limiterName: "statusPoll", config: RATE_LIMITS.statusPoll },
] as const;
