import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setexMock = vi.fn();
const delMock = vi.fn();

vi.mock("./client", () => ({
  getRedis: vi.fn(),
}));

vi.mock("./keys", () => ({
  redisKey: vi.fn((domain: string, ...parts: Array<string | number>) =>
    ["cc", "local", domain, ...parts].join(":")
  ),
}));

import { getRedis } from "./client";

const mockRedis = {
  get: getMock,
  setex: setexMock,
  del: delMock,
};

describe("redis/cache", () => {
  beforeEach(() => {
    getMock.mockReset();
    setexMock.mockReset();
    delMock.mockReset();
  });

  describe("cacheGet", () => {
    it("returns cached value on hit", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      getMock.mockResolvedValue({ name: "cached" });
      const fetcher = vi.fn();

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 60 });

      expect(result).toEqual({ name: "cached" });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("calls fetcher on cache miss and stores result", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      getMock.mockResolvedValue(null);
      setexMock.mockResolvedValue("OK");
      const fetcher = vi.fn().mockResolvedValue({ name: "fresh" });

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 300 });

      expect(result).toEqual({ name: "fresh" });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(setexMock).toHaveBeenCalledWith("cc:local:cache:key", 300, { name: "fresh" });
    });

    it("does not cache null fetcher results", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      getMock.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue(null);

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 60 });

      expect(result).toBeNull();
      expect(setexMock).not.toHaveBeenCalled();
    });

    it("does not cache undefined fetcher results", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      getMock.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue(undefined);

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 60 });

      expect(result).toBeUndefined();
      expect(setexMock).not.toHaveBeenCalled();
    });

    it("falls through to fetcher on cache read error (fail-open)", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      getMock.mockRejectedValue(new Error("connection reset"));
      setexMock.mockResolvedValue("OK");
      const fetcher = vi.fn().mockResolvedValue("fallback");

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 60 });

      expect(result).toBe("fallback");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("returns value even on cache write error (fail-open)", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      getMock.mockResolvedValue(null);
      setexMock.mockRejectedValue(new Error("write failed"));
      const fetcher = vi.fn().mockResolvedValue("value");

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 60 });

      expect(result).toBe("value");
    });

    it("calls fetcher directly when Redis is not configured", async () => {
      vi.mocked(getRedis).mockReturnValue(null);
      const fetcher = vi.fn().mockResolvedValue("direct");

      const { cacheGet } = await import("./cache");
      const result = await cacheGet(["key"], fetcher, { ttlSeconds: 60 });

      expect(result).toBe("direct");
      expect(getMock).not.toHaveBeenCalled();
    });
  });

  describe("cacheInvalidate", () => {
    it("deletes the key from Redis", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      delMock.mockResolvedValue(1);

      const { cacheInvalidate } = await import("./cache");
      await cacheInvalidate(["key"]);

      expect(delMock).toHaveBeenCalledWith("cc:local:cache:key");
    });

    it("does nothing when Redis is not configured", async () => {
      vi.mocked(getRedis).mockReturnValue(null);

      const { cacheInvalidate } = await import("./cache");
      await cacheInvalidate(["key"]);

      expect(delMock).not.toHaveBeenCalled();
    });

    it("silently catches errors (fail-open)", async () => {
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);
      delMock.mockRejectedValue(new Error("del failed"));

      const { cacheInvalidate } = await import("./cache");
      await expect(cacheInvalidate(["key"])).resolves.toBeUndefined();
    });
  });
});
