/**
 * LLM daily token cost limiter (Upstash Redis-backed).
 *
 * Tracks per-identity daily token consumption and enforces plan-based limits.
 * Follows the same patterns as src/lib/rate-limit.ts:
 *   - Lazy Redis initialization
 *   - Fail-open on Redis unavailability or errors
 *   - DISABLE_TOKEN_LIMIT env var bypass
 */

import { Redis } from "@upstash/redis";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import type { InternalCostTelemetry } from "@/lib/ai/cost-summary-log";
import { getJstDateKey, startOfJstDayAsUtc } from "@/lib/datetime/jst";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAILY_TOKEN_LIMITS: Record<string, number> = {
  guest: 100_000,
  free: 500_000,
  standard: 2_000_000,
  pro: 5_000_000,
};

const REDIS_KEY_PREFIX = "daily_llm_tokens";

/** 25 hours -- generous TTL so key survives JST day boundary even with clock skew */
const TTL_SECONDS = 90_000;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** JST (UTC+9) date string in YYYY-MM-DD format */
function getJstDateString(): string {
  return getJstDateKey(new Date());
}

/** Build the Redis key for a given identity's daily token bucket */
function buildDailyTokenKey(identityId: string): string {
  return `${REDIS_KEY_PREFIX}:${identityId}:${getJstDateString()}`;
}

/** Seconds until next JST midnight (00:00 Asia/Tokyo) */
export function getRetryAfterSeconds(): number {
  const now = new Date();
  // Start of *today* in JST, expressed as UTC Date
  const todayStart = startOfJstDayAsUtc(now);
  // Next JST midnight = today's start + 24h
  const nextMidnightUtc = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const diffMs = nextMidnightUtc.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

/** Compute the next JST midnight as a UTC Date */
function getNextJstMidnightUtc(): Date {
  const todayStart = startOfJstDayAsUtc(new Date());
  return new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Redis initialization (lazy, singleton)
// ---------------------------------------------------------------------------

function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!isUpstashConfigured()) return null;
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type DailyTokenLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAtUtc: Date;
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Check whether the identity has remaining daily token budget.
 *
 * Fail-open: returns allowed=true when Redis is unavailable or on error.
 */
export async function checkDailyTokenLimit(
  identity: RequestIdentity,
  plan: string,
): Promise<DailyTokenLimitResult> {
  const resetAtUtc = getNextJstMidnightUtc();

  // Env-var bypass
  if (process.env.DISABLE_TOKEN_LIMIT === "true") {
    return { allowed: true, remaining: Infinity, resetAtUtc };
  }

  const id = identity.userId ?? identity.guestId;
  if (!id) {
    return { allowed: true, remaining: Infinity, resetAtUtc };
  }

  const redis = getRedis();
  if (!redis) {
    // Upstash not configured -- fail-open
    return { allowed: true, remaining: Infinity, resetAtUtc };
  }

  try {
    const key = buildDailyTokenKey(id);
    const current = ((await redis.get<number>(key)) ?? 0);
    const limit = DAILY_TOKEN_LIMITS[plan] ?? DAILY_TOKEN_LIMITS.free;

    if (current >= limit) {
      return { allowed: false, remaining: 0, resetAtUtc };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - current),
      resetAtUtc,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "daily_token_limit_check_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    // Fail-open
    return { allowed: true, remaining: Infinity, resetAtUtc };
  }
}

/**
 * Record token consumption after a successful LLM call.
 *
 * Fail-soft: errors are logged but never thrown.
 */
export async function incrementDailyTokenCount(
  identity: RequestIdentity,
  tokensUsed: number,
): Promise<void> {
  if (process.env.DISABLE_TOKEN_LIMIT === "true") return;
  if (tokensUsed <= 0) return;

  const id = identity.userId ?? identity.guestId;
  if (!id) return;

  const redis = getRedis();
  if (!redis) return;

  try {
    const key = buildDailyTokenKey(id);
    const newVal = await redis.incrby(key, tokensUsed);

    // If newVal equals tokensUsed, the key was just created -- set TTL
    if (newVal === tokensUsed) {
      await redis.expire(key, TTL_SECONDS);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "daily_token_increment_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/**
 * Sum all token fields from telemetry.
 *
 * Note: `cached_input_tokens_total` is a subset of `input_tokens_total` and
 * is intentionally not added to avoid double-counting.
 */
export function computeTotalTokens(telemetry: InternalCostTelemetry | null | undefined): number {
  if (!telemetry) return 0;
  return (
    (telemetry.input_tokens_total ?? 0) +
    (telemetry.output_tokens_total ?? 0) +
    (telemetry.reasoning_tokens_total ?? 0)
  );
}
