/**
 * Simple in-memory rate limiter with token bucket algorithm
 *
 * WARNING: This in-memory implementation does NOT work in serverless environments
 * (Vercel, AWS Lambda) where each invocation gets a fresh container.
 * For production, migrate to @upstash/ratelimit with Redis.
 *
 * TODO: Replace with @upstash/ratelimit for distributed rate limiting
 * - Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
 * - Use sliding window algorithm
 * - Fail-open on Redis connection errors
 */

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitState>();

export interface RateLimitConfig {
  maxTokens: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per second
  windowMs: number; // Window for cleanup (not used in token bucket, but for future LRU)
}

/**
 * Pre-configured rate limits for different operations
 */
export const RATE_LIMITS = {
  // High-cost LLM operations
  review: { maxTokens: 10, refillRate: 0.1, windowMs: 60000 }, // 10 per minute, ~6/min sustained
  conversation: { maxTokens: 20, refillRate: 0.3, windowMs: 60000 }, // 20 burst, ~18/min sustained

  // External fetch operations
  fetchInfo: { maxTokens: 5, refillRate: 0.08, windowMs: 60000 }, // 5 burst, ~5/min sustained

  // Search operations
  search: { maxTokens: 30, refillRate: 0.5, windowMs: 60000 }, // 30 burst, ~30/min sustained
} as const;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until next token available
}

/**
 * Check rate limit using token bucket algorithm
 *
 * @param key Unique identifier for rate limiting (e.g., "review:userId")
 * @param config Rate limit configuration
 * @returns Rate limit result with allowed status and remaining tokens
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const state = store.get(key) || { tokens: config.maxTokens, lastRefill: now };

  // Calculate tokens to add based on elapsed time
  const elapsed = (now - state.lastRefill) / 1000;
  const newTokens = Math.min(
    config.maxTokens,
    state.tokens + elapsed * config.refillRate
  );

  // Check if we have at least 1 token
  if (newTokens < 1) {
    const resetIn = Math.ceil((1 - newTokens) / config.refillRate);
    return { allowed: false, remaining: 0, resetIn };
  }

  // Consume one token
  store.set(key, { tokens: newTokens - 1, lastRefill: now });

  return {
    allowed: true,
    remaining: Math.floor(newTokens - 1),
    resetIn: 0,
  };
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

/**
 * Cleanup old entries from store (call periodically if needed)
 * For now, the store is self-limiting due to natural usage patterns
 */
export function cleanupStore(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [key, state] of store.entries()) {
    if (now - state.lastRefill > maxAgeMs) {
      store.delete(key);
    }
  }
}
