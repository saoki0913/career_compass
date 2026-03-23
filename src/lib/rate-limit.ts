/**
 * Distributed rate limiter with @upstash/ratelimit (Redis-backed)
 *
 * Production: Uses Upstash Redis for distributed rate limiting across
 * serverless function invocations (Vercel).
 *
 * Development: Falls back to in-memory token bucket when UPSTASH_REDIS_REST_URL
 * is not configured.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until next token available
}

// ---------------------------------------------------------------------------
// Pre-configured rate limits
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  review: { maxTokens: 10, refillRate: 0.1, windowMs: 60000 },
  conversation: { maxTokens: 20, refillRate: 0.3, windowMs: 60000 },
  fetchInfo: { maxTokens: 5, refillRate: 0.08, windowMs: 60000 },
  companySearch: { maxTokens: 6, refillRate: 0.067, windowMs: 60000 },
  companyCompliance: { maxTokens: 6, refillRate: 0.067, windowMs: 60000 },
  draft: { maxTokens: 2, refillRate: 0.0167, windowMs: 60000 },
  corporateMutate: { maxTokens: 2, refillRate: 0.0112, windowMs: 60000 },
  corporateDelete: { maxTokens: 4, refillRate: 0.1, windowMs: 60000 },
  statusPoll: { maxTokens: 15, refillRate: 0.333, windowMs: 60000 },
  guestAuth: { maxTokens: 5, refillRate: 0.08, windowMs: 60000 },
  contact: { maxTokens: 3, refillRate: 0.05, windowMs: 60000 },
} as const;

// ---------------------------------------------------------------------------
// Upstash Redis rate limiters (lazy-initialized, one per operation type)
// ---------------------------------------------------------------------------

const upstashLimiters = new Map<string, Ratelimit>();

function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getUpstashLimiter(operation: string, config: RateLimitConfig): Ratelimit {
  const existing = upstashLimiters.get(operation);
  if (existing) return existing;

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  // Match the in-memory semantics: refillRate is tokens per second.
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.tokenBucket(
      config.refillRate,
      "1000 ms",
      config.maxTokens     // maxTokens (burst)
    ),
    prefix: `rl:${operation}`,
    analytics: false,
  });

  upstashLimiters.set(operation, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// In-memory fallback (development only)
// ---------------------------------------------------------------------------

interface InMemoryState {
  tokens: number;
  lastRefill: number;
}

const memoryStore = new Map<string, InMemoryState>();

function checkRateLimitInMemory(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const state = memoryStore.get(key) || { tokens: config.maxTokens, lastRefill: now };

  const elapsed = (now - state.lastRefill) / 1000;
  const newTokens = Math.min(
    config.maxTokens,
    state.tokens + elapsed * config.refillRate
  );

  if (newTokens < 1) {
    const resetIn = Math.ceil((1 - newTokens) / config.refillRate);
    return { allowed: false, remaining: 0, resetIn };
  }

  memoryStore.set(key, { tokens: newTokens - 1, lastRefill: now });

  return {
    allowed: true,
    remaining: Math.floor(newTokens - 1),
    resetIn: 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check rate limit (async — uses Upstash Redis in production, in-memory in dev).
 * Fail-open: if Upstash errors, the request is allowed.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  operation?: string
): Promise<RateLimitResult> {
  // Fallback to in-memory when Upstash is not configured
  if (!isUpstashConfigured()) {
    return checkRateLimitInMemory(key, config);
  }

  // Determine operation name from key (format: "operation:identifier")
  const op = operation || key.split(":")[0];

  try {
    const limiter = getUpstashLimiter(op, config);
    const result = await limiter.limit(key);

    return {
      allowed: result.success,
      remaining: result.remaining,
      resetIn: result.success ? 0 : Math.ceil((result.reset - Date.now()) / 1000),
    };
  } catch (error) {
    // Fail-open: allow request on Redis errors
    console.error("[RateLimit] Upstash error, failing open:", error);
    return { allowed: true, remaining: config.maxTokens, resetIn: 0 };
  }
}

/**
 * Create rate limit key from operation type and user/guest ID
 */
export function createRateLimitKey(
  operation: string,
  userId: string | null,
  guestId: string | null
): string {
  const identifier = userId || guestId || "anonymous";
  return `${operation}:${identifier}`;
}
