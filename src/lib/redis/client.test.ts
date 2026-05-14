import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    constructor(public config: { url: string; token: string }) {}
  },
}));

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe("redis/client", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const origNamespace = process.env.UPSTASH_REDIS_NAMESPACE;
  const origVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    delete process.env.UPSTASH_REDIS_NAMESPACE;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    restoreEnv("UPSTASH_REDIS_REST_URL", origUrl);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", origToken);
    restoreEnv("UPSTASH_REDIS_NAMESPACE", origNamespace);
    restoreEnv("VERCEL_ENV", origVercelEnv);
  });

  describe("isRedisConfigured", () => {
    it("returns true when both URL and token are set", async () => {
      const { isRedisConfigured } = await import("./client");
      expect(isRedisConfigured()).toBe(true);
    });

    it("returns false when URL is missing", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { isRedisConfigured } = await import("./client");
      expect(isRedisConfigured()).toBe(false);
    });

    it("returns false when token is missing", async () => {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const { isRedisConfigured } = await import("./client");
      expect(isRedisConfigured()).toBe(false);
    });
  });

  describe("getRedisNamespace", () => {
    it("uses configured namespace when present", async () => {
      process.env.UPSTASH_REDIS_NAMESPACE = "stg";
      const { getRedisNamespace } = await import("./client");
      expect(getRedisNamespace()).toBe("stg");
    });

    it("defaults Vercel production to prod", async () => {
      process.env.VERCEL_ENV = "production";
      const { getRedisNamespace } = await import("./client");
      expect(getRedisNamespace()).toBe("prod");
    });

    it("defaults local and test environments to local", async () => {
      const { getRedisNamespace } = await import("./client");
      expect(getRedisNamespace()).toBe("local");
    });
  });

  describe("getRedis", () => {
    it("returns a Redis instance when configured", async () => {
      const { getRedis } = await import("./client");
      const redis = getRedis();
      expect(redis).not.toBeNull();
    });

    it("returns the same instance on subsequent calls (singleton)", async () => {
      const { getRedis } = await import("./client");
      const first = getRedis();
      const second = getRedis();
      expect(first).toBe(second);
    });

    it("returns null when not configured", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { getRedis } = await import("./client");
      expect(getRedis()).toBeNull();
    });

    it("caches null result and does not retry", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { getRedis } = await import("./client");
      expect(getRedis()).toBeNull();
      // Even if env changes afterward, cached result is returned
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      expect(getRedis()).toBeNull();
    });
  });

  describe("_resetForTests", () => {
    it("clears the singleton so getRedis re-evaluates", async () => {
      const { getRedis, _resetForTests } = await import("./client");
      const first = getRedis();
      expect(first).not.toBeNull();
      _resetForTests();
      const second = getRedis();
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
    });
  });
});
