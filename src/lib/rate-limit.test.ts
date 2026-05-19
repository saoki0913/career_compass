import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Implementation migrated from process.env to serverEnv (T3 Env).
const { limitMock, ratelimitConfigs } = vi.hoisted(() => {
  const ratelimitConfigs: Array<Record<string, unknown>> = [];
  return {
    limitMock: vi.fn(),
    ratelimitConfigs,
  };
});

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static tokenBucket = vi.fn(() => "bucket");
    limit = limitMock;
    constructor(config: Record<string, unknown>) {
      ratelimitConfigs.push(config);
    }
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    constructor(_config: unknown) {}
  },
}));

vi.mock("@/lib/redis", async () => {
  const { Redis } = await import("@upstash/redis");
  return {
    isRedisConfigured: () =>
      !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    getRedis: () => {
      if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
      return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    },
    getRedisNamespace: () => process.env.UPSTASH_REDIS_NAMESPACE || "local",
    redisKey: (domain: string, ...parts: Array<string | number>) =>
      ["cc", process.env.UPSTASH_REDIS_NAMESPACE || "local", domain, ...parts].join(":"),
  };
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe("rate-limit", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalNamespace = process.env.UPSTASH_REDIS_NAMESPACE;

  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    ratelimitConfigs.length = 0;
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.UPSTASH_REDIS_NAMESPACE = "staging";
  });

  afterEach(() => {
    restoreEnv("UPSTASH_REDIS_REST_URL", originalUrl);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", originalToken);
    restoreEnv("UPSTASH_REDIS_NAMESPACE", originalNamespace);
  });

  it("scopes Upstash limiter prefixes by Redis namespace", async () => {
    limitMock.mockResolvedValue({
      success: true,
      remaining: 2,
      reset: Date.now() + 1000,
    });
    const { checkRateLimit } = await import("@/lib/rate-limit");

    await checkRateLimit(
      "conversation:user-1",
      { maxTokens: 3, refillRate: 0.01, windowMs: 60_000 },
      "conversation",
    );

    expect(ratelimitConfigs[0]?.prefix).toBe("cc:staging:rl:conversation");
  });

  it("falls back to in-memory limiting when Upstash errors", async () => {
    limitMock.mockRejectedValue(new Error("upstash unavailable"));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const config = { maxTokens: 1, refillRate: 0.01, windowMs: 60_000 };

    const first = await checkRateLimit("conversation:user-1", config, "conversation");
    const second = await checkRateLimit("conversation:user-1", config, "conversation");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });

  it("creates hashed anonymous IP keys from forwarding headers", async () => {
    const { createAnonymousRateLimitKey } = await import("@/lib/rate-limit");
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.9",
    });

    const key = createAnonymousRateLimitKey("companySuggestions", headers);

    expect(key).toMatch(/^companySuggestions:anonymous-ip:[a-f0-9]{32}$/);
    expect(key).not.toContain("203.0.113.10");
  });

  it("falls back to a shared anonymous key when no IP header exists", async () => {
    const { createAnonymousRateLimitKey } = await import("@/lib/rate-limit");

    expect(createAnonymousRateLimitKey("guestAuthAnonymous", new Headers())).toBe(
      "guestAuthAnonymous:anonymous"
    );
  });
});
