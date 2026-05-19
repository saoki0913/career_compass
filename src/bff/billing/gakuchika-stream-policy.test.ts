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

describe("gakuchikaStreamPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 402 response when reservation fails", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: false,
      reservationId: "",
      newBalance: 0,
      errorCode: "INSUFFICIENT_CREDITS",
    });
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    const result = await gakuchikaStreamPolicy.reserve?.({
      userId: "user-1",
      gakuchikaId: "g-1",
      newQuestionCount: 3,
    }, 1);

    expect(result).toBeDefined();
    if (!result) throw new Error("reserve should be implemented");
    expect(result.reservationId).toBeNull();
    expect(result.errorResponse?.status).toBe(402);
  });

  it("confirms reserved credits only for billable success", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.confirmReservation).mockResolvedValue({ confirmed: true });
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    await gakuchikaStreamPolicy.confirm(
      { userId: "user-1", gakuchikaId: "g-1", newQuestionCount: 3 },
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "res-1",
    );

    expect(credits.confirmReservation).toHaveBeenCalledWith("res-1");
  });

  it("logs when post-success reservation confirmation is not applied", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.confirmReservation).mockResolvedValue({ confirmed: false });
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    await gakuchikaStreamPolicy.confirm(
      { userId: "user-1", gakuchikaId: "g-1", newQuestionCount: 3 },
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "res-1",
    );

    expect(logger.logError).toHaveBeenCalledWith(
      "gakuchika-reservation-confirm-after-success-failed",
      expect.any(Error),
      expect.objectContaining({ userId: "user-1", gakuchikaId: "g-1", reservationId: "res-1" }),
    );
  });
});
