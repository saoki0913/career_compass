import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Implementation migrated from process.env to serverEnv (T3 Env).
// ---------------------------------------------------------------------------
// Mock @upstash/redis before any imports
// ---------------------------------------------------------------------------

const getMock = vi.fn();
const incrbyMock = vi.fn();
const expireMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    get = getMock;
    incrby = incrbyMock;
    expire = expireMock;
    constructor(_config: unknown) {}
  },
}));

vi.mock("@/lib/redis", async () => {
  const { Redis } = await import("@upstash/redis");
  let _redis: InstanceType<typeof Redis> | null = null;
  return {
    isRedisConfigured: () =>
      !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    getRedis: () => {
      if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
      if (!_redis) {
        _redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
      }
      return _redis;
    },
    getRedisNamespace: () => process.env.UPSTASH_REDIS_NAMESPACE || "local",
  };
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe("llm-cost-limit", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const origNamespace = process.env.UPSTASH_REDIS_NAMESPACE;
  const origDisable = process.env.DISABLE_TOKEN_LIMIT;
  const origVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    incrbyMock.mockReset();
    expireMock.mockReset();
    // Default: Upstash configured
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.UPSTASH_REDIS_NAMESPACE = "unit";
    delete process.env.DISABLE_TOKEN_LIMIT;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    restoreEnv("UPSTASH_REDIS_REST_URL", origUrl);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", origToken);
    restoreEnv("UPSTASH_REDIS_NAMESPACE", origNamespace);
    restoreEnv("DISABLE_TOKEN_LIMIT", origDisable);
    restoreEnv("VERCEL_ENV", origVercelEnv);
  });

  // -----------------------------------------------------------------------
  // getRetryAfterSeconds
  // -----------------------------------------------------------------------

  it("getRetryAfterSeconds returns a value in [0, 86400]", async () => {
    const { getRetryAfterSeconds } = await import("@/lib/llm-cost-limit");
    const seconds = getRetryAfterSeconds();
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThanOrEqual(86400);
  });

  // -----------------------------------------------------------------------
  // computeTotalTokens
  // -----------------------------------------------------------------------

  it("computeTotalTokens returns 0 for null", async () => {
    const { computeTotalTokens } = await import("@/lib/llm-cost-limit");
    expect(computeTotalTokens(null)).toBe(0);
  });

  it("computeTotalTokens returns 0 for undefined", async () => {
    const { computeTotalTokens } = await import("@/lib/llm-cost-limit");
    expect(computeTotalTokens(undefined)).toBe(0);
  });

  it("computeTotalTokens sums input + output + reasoning tokens", async () => {
    const { computeTotalTokens } = await import("@/lib/llm-cost-limit");
    const result = computeTotalTokens({
      input_tokens_total: 100,
      output_tokens_total: 50,
      reasoning_tokens_total: 30,
    });
    expect(result).toBe(180);
  });

  it("computeTotalTokens does NOT add cached_input_tokens_total", async () => {
    const { computeTotalTokens } = await import("@/lib/llm-cost-limit");
    const result = computeTotalTokens({
      input_tokens_total: 200,
      output_tokens_total: 0,
      reasoning_tokens_total: 0,
      cached_input_tokens_total: 150,
    });
    // cached is a subset of input -- must not double-count
    expect(result).toBe(200);
  });

  // -----------------------------------------------------------------------
  // checkDailyTokenLimit
  // -----------------------------------------------------------------------

  it("returns bypassed when DISABLE_TOKEN_LIMIT=true", async () => {
    process.env.DISABLE_TOKEN_LIMIT = "true";
    const { checkDailyTokenLimit, isTokenLimitOk } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.status).toBe("bypassed");
    expect(isTokenLimitOk(result)).toBe(true);
  });

  it("uses in-memory token limiting when Upstash is not configured outside deployed environments", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { checkDailyTokenLimit, incrementDailyTokenCount, isTokenLimitOk } = await import("@/lib/llm-cost-limit");

    await incrementDailyTokenCount({ userId: "u1", guestId: null }, 100_000);
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "guest");

    expect(result.status).toBe("limit_exceeded");
    expect(isTokenLimitOk(result)).toBe(false);
  });

  it("returns service_unavailable when Upstash is not configured in deployed environments", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.VERCEL_ENV = "production";
    const { checkDailyTokenLimit, isTokenLimitOk } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.status).toBe("service_unavailable");
    expect(isTokenLimitOk(result)).toBe(false);
  });

  it("returns bypassed when identity has no userId or guestId", async () => {
    const { checkDailyTokenLimit, isTokenLimitOk } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: null, guestId: null }, "free");
    expect(result.status).toBe("bypassed");
    expect(isTokenLimitOk(result)).toBe(true);
  });

  it("returns limit_exceeded when current usage exceeds limit", async () => {
    getMock.mockResolvedValue(600_000); // exceeds free plan 500k
    const { checkDailyTokenLimit, isTokenLimitOk } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.status).toBe("limit_exceeded");
    expect(isTokenLimitOk(result)).toBe(false);
    if (result.status === "limit_exceeded") {
      expect(result.remaining).toBe(0);
    }
  });

  it("returns remaining tokens correctly", async () => {
    getMock.mockResolvedValue(100_000);
    const { checkDailyTokenLimit, isTokenLimitOk } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.status).toBe("allowed");
    expect(isTokenLimitOk(result)).toBe(true);
    if (result.status === "allowed") {
      expect(result.remaining).toBe(400_000); // 500k - 100k
    }
  });

  it("falls back to free plan limit for unknown plan", async () => {
    getMock.mockResolvedValue(0);
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "enterprise");
    expect(result.status).toBe("allowed");
    if (result.status === "allowed") {
      expect(result.remaining).toBe(500_000); // falls back to free limit
    }
  });

  it("returns service_unavailable on Redis error (fail-closed)", async () => {
    process.env.VERCEL_ENV = "production";
    getMock.mockRejectedValue(new Error("connection refused"));
    const { checkDailyTokenLimit, isTokenLimitOk } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.status).toBe("service_unavailable");
    expect(isTokenLimitOk(result)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // incrementDailyTokenCount
  // -----------------------------------------------------------------------

  it("does nothing when DISABLE_TOKEN_LIMIT=true", async () => {
    process.env.DISABLE_TOKEN_LIMIT = "true";
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    await incrementDailyTokenCount({ userId: "u1", guestId: null }, 100);
    expect(incrbyMock).not.toHaveBeenCalled();
  });

  it("does nothing when tokensUsed <= 0", async () => {
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    await incrementDailyTokenCount({ userId: "u1", guestId: null }, 0);
    expect(incrbyMock).not.toHaveBeenCalled();
  });

  it("does nothing when identity has no userId or guestId", async () => {
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    await incrementDailyTokenCount({ userId: null, guestId: null }, 100);
    expect(incrbyMock).not.toHaveBeenCalled();
  });

  it("increments and sets TTL when key is new", async () => {
    incrbyMock.mockResolvedValue(500); // newVal === tokensUsed → key is new
    expireMock.mockResolvedValue(true);
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    await incrementDailyTokenCount({ userId: "u1", guestId: null }, 500);
    expect(incrbyMock).toHaveBeenCalledWith(expect.stringContaining("daily_llm_tokens:unit:u1:"), 500);
    expect(expireMock).toHaveBeenCalledWith(expect.stringContaining("daily_llm_tokens:unit:u1:"), 90_000);
  });

  it("increments without setting TTL when key already exists", async () => {
    incrbyMock.mockResolvedValue(1500); // newVal !== tokensUsed → key existed
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    await incrementDailyTokenCount({ userId: "u1", guestId: null }, 500);
    expect(incrbyMock).toHaveBeenCalled();
    expect(expireMock).not.toHaveBeenCalled();
  });

  it("uses guestId when userId is null", async () => {
    incrbyMock.mockResolvedValue(200);
    expireMock.mockResolvedValue(true);
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    await incrementDailyTokenCount({ userId: null, guestId: "g1" }, 200);
    expect(incrbyMock).toHaveBeenCalledWith(expect.stringContaining("daily_llm_tokens:unit:g1:"), 200);
  });

  it("does not throw on Redis error (fail-soft)", async () => {
    incrbyMock.mockRejectedValue(new Error("timeout"));
    const { incrementDailyTokenCount } = await import("@/lib/llm-cost-limit");
    // Should not throw
    await expect(
      incrementDailyTokenCount({ userId: "u1", guestId: null }, 100),
    ).resolves.toBeUndefined();
  });
});
