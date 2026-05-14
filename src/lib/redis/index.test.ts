import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    constructor(_: unknown) { void _; }
  },
}));

describe("redis/index barrel exports", () => {
  it("re-exports getRedis, getRedisNamespace, isRedisConfigured, _resetForTests from client", async () => {
    const mod = await import("./index");
    expect(typeof mod.getRedis).toBe("function");
    expect(typeof mod.getRedisNamespace).toBe("function");
    expect(typeof mod.isRedisConfigured).toBe("function");
    expect(typeof mod._resetForTests).toBe("function");
  });

  it("re-exports cacheGet, cacheInvalidate from cache", async () => {
    const mod = await import("./index");
    expect(typeof mod.cacheGet).toBe("function");
    expect(typeof mod.cacheInvalidate).toBe("function");
  });
});
