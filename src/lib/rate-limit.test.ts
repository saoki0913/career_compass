import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limitMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static tokenBucket = vi.fn(() => "bucket");
    limit = limitMock;
    constructor(_config: unknown) {}
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    constructor(_config: unknown) {}
  },
}));

describe("rate-limit", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  });

  afterEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
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
});
