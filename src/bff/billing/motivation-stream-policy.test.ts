import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
  consumeCredits: vi.fn(),
  hasEnoughCredits: vi.fn(),
}));

describe("motivationStreamPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 402 response when credits are insufficient", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.hasEnoughCredits).mockResolvedValue(false);
    const { motivationStreamPolicy } = await import("./motivation-stream-policy");

    const result = await motivationStreamPolicy.precheck({
      userId: "user-1",
      companyId: "company-1",
      newQuestionCount: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.errorResponse?.status).toBe(402);
  });

  it("consumes credits only for billable success with positive usage", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.hasEnoughCredits).mockResolvedValue(true);
    vi.mocked(credits.consumeCredits).mockResolvedValue({ success: true, newBalance: 9 });
    const { motivationStreamPolicy } = await import("./motivation-stream-policy");
    const ctx = { userId: "user-1", companyId: "company-1", newQuestionCount: 1 };

    await motivationStreamPolicy.confirm(ctx, { kind: "failure", reason: "upstream" }, null);
    await motivationStreamPolicy.confirm(ctx, { kind: "billable_success", creditsConsumed: 0, freeQuotaUsed: false }, null);
    await motivationStreamPolicy.confirm(ctx, { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false }, null);

    expect(credits.consumeCredits).toHaveBeenCalledTimes(1);
    expect(credits.consumeCredits).toHaveBeenCalledWith("user-1", 1, "motivation", "company-1");
  });
});
