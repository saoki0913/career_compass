import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm-cost-limit", () => ({
  checkDailyTokenLimit: vi.fn(),
  getRetryAfterSeconds: vi.fn(),
  isTokenLimitOk: vi.fn((r: { status: string }) => r.status === "allowed" || r.status === "bypassed"),
}));

vi.mock("@/lib/credits/shared", () => ({
  getUserPlan: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
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
      status: "allowed",
      remaining: 900,
      resetAtUtc: new Date("2026-05-05T15:00:00.000Z"),
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const identity = { userId: "user-1", guestId: null };

    const result = await guardDailyTokenLimit(identity);

    expect(result).toBeNull();
    expect(credits.getUserPlan).toHaveBeenCalledWith("user-1");
    expect(limits.checkDailyTokenLimit).toHaveBeenCalledWith(
      identity,
      "standard",
      expect.objectContaining({
        identityKind: "user",
        plan: "standard",
      }),
    );
  });

  it("uses guest plan without looking up user plan", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      status: "allowed",
      remaining: 90,
      resetAtUtc: new Date("2026-05-05T15:00:00.000Z"),
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const identity = { userId: null, guestId: "guest-1" };

    const result = await guardDailyTokenLimit(identity);

    expect(result).toBeNull();
    expect(credits.getUserPlan).not.toHaveBeenCalled();
    expect(limits.checkDailyTokenLimit).toHaveBeenCalledWith(
      identity,
      "guest",
      expect.objectContaining({
        identityKind: "guest",
        plan: "guest",
      }),
    );
  });

  it("passes through bypassed results", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    vi.mocked(credits.getUserPlan).mockResolvedValue("free");
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      status: "bypassed",
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");

    const result = await guardDailyTokenLimit({ userId: "user-1", guestId: null });

    expect(result).toBeNull();
  });

  it("returns 429 with reset time and retry-after when the daily limit is exceeded", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    const { NextRequest } = await import("next/server");
    const resetAtUtc = new Date("2026-05-05T15:00:00.000Z");
    vi.mocked(credits.getUserPlan).mockResolvedValue("free");
    vi.mocked(limits.getRetryAfterSeconds).mockReturnValue(120);
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      status: "limit_exceeded",
      remaining: 0,
      resetAtUtc,
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const request = new NextRequest("https://example.com/api/test", {
      headers: { "x-request-id": "req-limit" },
    });

    const result = await guardDailyTokenLimit({ userId: "user-1", guestId: null }, request);
    const body = await result?.json();

    expect(result?.status).toBe(429);
    expect(result?.headers.get("Retry-After")).toBe("120");
    expect(result?.headers.get("X-Request-Id")).toBe("req-limit");
    expect(body).toEqual({
      error: {
        code: "DAILY_TOKEN_LIMIT_EXCEEDED",
        userMessage: "本日のAI利用量の上限に達しました。",
        action: "日本時間の翌日0時以降にもう一度お試しください。クレジットは消費されていません。",
        retryable: true,
        extra: { resetAtUtc: resetAtUtc.toISOString() },
      },
      requestId: "req-limit",
    });
  });

  it("returns 503 when token limit service is unavailable", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    const { NextRequest } = await import("next/server");
    vi.mocked(credits.getUserPlan).mockResolvedValue("free");
    vi.mocked(limits.checkDailyTokenLimit).mockResolvedValue({
      status: "service_unavailable",
      resetAtUtc: new Date("2026-05-05T15:00:00.000Z"),
    });
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const request = new NextRequest("https://example.com/api/test", {
      headers: { "x-request-id": "req-unavailable" },
    });

    const result = await guardDailyTokenLimit({ userId: "user-1", guestId: null }, request);
    const body = await result?.json();

    expect(result?.status).toBe(503);
    expect(result?.headers.get("X-Request-Id")).toBe("req-unavailable");
    expect(body).toEqual({
      error: {
        code: "TOKEN_LIMIT_SERVICE_UNAVAILABLE",
        userMessage: "現在、AI機能を一時的に利用できません。",
        action: "数分後にもう一度お試しください。クレジットは消費されていません。",
        retryable: true,
      },
      requestId: "req-unavailable",
    });
    expect(body.code).toBeUndefined();
    expect(body.userMessage).toBeUndefined();
  });

  it("returns 503 before checking Redis when plan lookup fails", async () => {
    const limits = await import("@/lib/llm-cost-limit");
    const credits = await import("@/lib/credits/shared");
    const logger = await import("@/lib/logger");
    const { NextRequest } = await import("next/server");
    vi.mocked(credits.getUserPlan).mockRejectedValue(new Error("plan db unavailable"));
    const { guardDailyTokenLimit } = await import("./llm-cost-guard");
    const request = new NextRequest("https://example.com/api/test", {
      headers: { "x-request-id": "req-plan-fail" },
    });

    const result = await guardDailyTokenLimit(
      { userId: "user-1", guestId: null },
      request,
      { feature: "interview_start" },
    );
    const body = await result?.json();

    expect(result?.status).toBe(503);
    expect(body.error.code).toBe("TOKEN_LIMIT_SERVICE_UNAVAILABLE");
    expect(limits.checkDailyTokenLimit).not.toHaveBeenCalled();
    expect(logger.logError).toHaveBeenCalledWith(
      "daily_token_limit_plan_lookup_error",
      expect.any(Error),
      expect.objectContaining({
        requestId: "req-plan-fail",
        feature: "interview_start",
        identityKind: "user",
        decision: "blocked",
      }),
    );
  });
});
