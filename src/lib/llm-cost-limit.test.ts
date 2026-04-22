import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @upstash/redis before any imports
// ---------------------------------------------------------------------------

const getMock = vi.fn();
const incrbyMock = vi.fn();
const expireMock = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    get = getMock;
    incrby = incrbyMock;
    expire = expireMock;
    constructor(_config: unknown) {}
  },
}));

describe("llm-cost-limit", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const origDisable = process.env.DISABLE_TOKEN_LIMIT;

  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
    incrbyMock.mockReset();
    expireMock.mockReset();
    // Default: Upstash configured
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    delete process.env.DISABLE_TOKEN_LIMIT;
  });

  afterEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = origUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
    if (origDisable !== undefined) {
      process.env.DISABLE_TOKEN_LIMIT = origDisable;
    } else {
      delete process.env.DISABLE_TOKEN_LIMIT;
    }
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

  it("returns allowed=true when DISABLE_TOKEN_LIMIT=true", async () => {
    process.env.DISABLE_TOKEN_LIMIT = "true";
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });

  it("returns allowed=true when Upstash is not configured (fail-open)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });

  it("returns allowed=true when identity has no userId or guestId", async () => {
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: null, guestId: null }, "free");
    expect(result.allowed).toBe(true);
  });

  it("returns allowed=false when current usage exceeds limit", async () => {
    getMock.mockResolvedValue(600_000); // exceeds free plan 500k
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns remaining tokens correctly", async () => {
    getMock.mockResolvedValue(100_000);
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(400_000); // 500k - 100k
  });

  it("falls back to free plan limit for unknown plan", async () => {
    getMock.mockResolvedValue(0);
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "enterprise");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(500_000); // falls back to free limit
  });

  it("returns allowed=true on Redis error (fail-open)", async () => {
    getMock.mockRejectedValue(new Error("connection refused"));
    const { checkDailyTokenLimit } = await import("@/lib/llm-cost-limit");
    const result = await checkDailyTokenLimit({ userId: "u1", guestId: null }, "free");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
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
    expect(incrbyMock).toHaveBeenCalledWith(expect.stringContaining("daily_llm_tokens:u1:"), 500);
    expect(expireMock).toHaveBeenCalledWith(expect.stringContaining("daily_llm_tokens:u1:"), 90_000);
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
    expect(incrbyMock).toHaveBeenCalledWith(expect.stringContaining("daily_llm_tokens:g1:"), 200);
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
