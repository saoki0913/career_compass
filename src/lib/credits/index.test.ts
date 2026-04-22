import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("credits month reset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants credits when JST month has rolled over even if 1 month has not elapsed", async () => {
    vi.setSystemTime(new Date("2026-03-01T00:30:00+09:00"));
    const { shouldGrantMonthlyCredits } = await import("@/lib/credits");

    expect(
      shouldGrantMonthlyCredits(new Date("2026-02-28T23:50:00+09:00"))
    ).toBe(true);
  });

  it("does not grant credits inside the same JST month", async () => {
    vi.setSystemTime(new Date("2026-03-31T23:00:00+09:00"));
    const { shouldGrantMonthlyCredits } = await import("@/lib/credits");

    expect(
      shouldGrantMonthlyCredits(new Date("2026-03-01T00:00:00+09:00"))
    ).toBe(false);
  });

  it("exposes interview transaction type and default session cost", async () => {
    const { DEFAULT_INTERVIEW_SESSION_CREDIT_COST } = await import("@/lib/credits");

    expect(DEFAULT_INTERVIEW_SESSION_CREDIT_COST).toBe(6);
  });

  it("exposes conversation credits per turn", async () => {
    const { CONVERSATION_CREDITS_PER_TURN } = await import("@/lib/credits");

    expect(CONVERSATION_CREDITS_PER_TURN).toBe(1);
  });
});
