import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm-cost-limit", () => ({
  checkDailyTokenLimit: vi.fn(),
  getRetryAfterSeconds: vi.fn(),
}));

vi.mock("@/lib/credits/shared", () => ({
  getUserPlan: vi.fn(),
}));

describe("guardDailyTokenLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("passes through allowed logged-in users with their plan", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    vi.mocked(credits.getUserPlan).mockResolvedValue("standard");
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      allowed: true,
      remaining: 900,
      resetAtUtc: new Date("2026-05-05T15:00:00.000Z"),
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const identity = { userId: "user-1", guestId: null };

    const result = await guardDailyTokenLimit(identity);

    expect(result).toBeNull();
    expect(credits.getUserPlan).toHaveBeenCalledWith("user-1");
    expect(limits.checkDailyTokenLimit).toHaveBeenCalledWith(identity, "standard");
  });

  it("uses guest plan without looking up user plan", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      allowed: true,
      remaining: 90,
      resetAtUtc: new Date("2026-05-05T15:00:00.000Z"),
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const identity = { userId: null, guestId: "guest-1" };

    const result = await guardDailyTokenLimit(identity);

    expect(result).toBeNull();
    expect(credits.getUserPlan).not.toHaveBeenCalled();
    expect(limits.checkDailyTokenLimit).toHaveBeenCalledWith(identity, "guest");
  });

  it("returns 429 with reset time and retry-after when the daily limit is exceeded", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    const resetAtUtc = new Date("2026-05-05T15:00:00.000Z");
    vi.mocked(credits.getUserPlan).mockResolvedValue("free");
    vi.mocked(limits.getRetryAfterSeconds).mockReturnValue(120);
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAtUtc,
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");

    const result = await guardDailyTokenLimit({ userId: "user-1", guestId: null });
    const body = await result?.json();

    expect(result?.status).toBe(429);
    expect(result?.headers.get("Retry-After")).toBe("120");
    expect(body).toEqual({
      error: "daily_token_limit_exceeded",
      resetAtUtc: resetAtUtc.toISOString(),
    });
  });
});
