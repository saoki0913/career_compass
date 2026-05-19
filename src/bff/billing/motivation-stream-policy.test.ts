import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
  cancelReservation: vi.fn(),
  confirmReservation: vi.fn(),
  reserveCredits: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("motivationStreamPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 402 response when reservation fails", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: false,
      reservationId: "",
      newBalance: 0,
      errorCode: "INSUFFICIENT_CREDITS",
    });
    const { motivationStreamPolicy } = await import("./motivation-stream-policy");

    const result = await motivationStreamPolicy.reserve?.({
      userId: "user-1",
      companyId: "company-1",
      newQuestionCount: 1,
    }, 1);

    expect(result).toBeDefined();
    if (!result) throw new Error("reserve should be implemented");
    expect(result.reservationId).toBeNull();
    expect(result.errorResponse?.status).toBe(402);
  });

  it("confirms reserved credits only for billable success with positive usage", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.confirmReservation).mockResolvedValue({ confirmed: true });
    const { motivationStreamPolicy } = await import("./motivation-stream-policy");
    const ctx = { userId: "user-1", companyId: "company-1", newQuestionCount: 1 };

    await motivationStreamPolicy.confirm(ctx, { kind: "failure", reason: "upstream" }, "res-1");
    await motivationStreamPolicy.confirm(ctx, { kind: "billable_success", creditsConsumed: 0, freeQuotaUsed: false }, "res-1");
    await motivationStreamPolicy.confirm(ctx, { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false }, "res-1");

    expect(credits.confirmReservation).toHaveBeenCalledTimes(1);
    expect(credits.confirmReservation).toHaveBeenCalledWith("res-1");
  });

  it("logs when post-success reservation confirmation is not applied", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.confirmReservation).mockResolvedValue({ confirmed: false });
    const { motivationStreamPolicy } = await import("./motivation-stream-policy");

    await motivationStreamPolicy.confirm(
      { userId: "user-1", companyId: "company-1", newQuestionCount: 1 },
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "res-1",
    );

    expect(logger.logError).toHaveBeenCalledWith(
      "motivation-reservation-confirm-after-success-failed",
      expect.any(Error),
      expect.objectContaining({ userId: "user-1", companyId: "company-1", reservationId: "res-1" }),
    );
  });
});
