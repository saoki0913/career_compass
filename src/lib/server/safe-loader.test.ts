import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("safeLoad", () => {
  it("returns data on success", async () => {
    const { safeLoad } = await import("./safe-loader");
    const result = await safeLoad("test", () => Promise.resolve(42));
    expect(result).toEqual({ data: 42, error: null });
  });

  it("returns error on failure and logs", async () => {
    const { logError } = await import("@/lib/logger");
    const { safeLoad } = await import("./safe-loader");
    const result = await safeLoad("failing", () => Promise.reject(new Error("boom")));
    expect(result).toEqual({ data: null, error: "failing" });
    expect(logError).toHaveBeenCalledWith("safeLoad:failing", expect.any(Error));
  });

  it("handles sync throw in loader function", async () => {
    const { safeLoad } = await import("./safe-loader");
    const result = await safeLoad("sync-throw", () => {
      throw new Error("sync");
    });
    expect(result).toEqual({ data: null, error: "sync-throw" });
  });
});
