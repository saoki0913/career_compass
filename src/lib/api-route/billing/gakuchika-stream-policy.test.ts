import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
  consumeCredits: vi.fn(),
  hasEnoughCredits: vi.fn(),
}));

describe("gakuchikaStreamPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 402 response when credits are insufficient", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.hasEnoughCredits).mockResolvedValue(false);
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    const result = await gakuchikaStreamPolicy.precheck({
      userId: "user-1",
      gakuchikaId: "g-1",
      newQuestionCount: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.errorResponse?.status).toBe(402);
  });

  it("consumes credits only for billable success", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.hasEnoughCredits).mockResolvedValue(true);
    vi.mocked(credits.consumeCredits).mockResolvedValue({ success: true, newBalance: 9 });
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    await gakuchikaStreamPolicy.confirm(
      { userId: "user-1", gakuchikaId: "g-1", newQuestionCount: 3 },
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      null,
    );

    expect(credits.consumeCredits).toHaveBeenCalledWith("user-1", 1, "gakuchika", "g-1");
  });
});
