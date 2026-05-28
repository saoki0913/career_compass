import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  CONVERSATION_CREDITS_PER_TURN: 1,
  cancelReservation: vi.fn(),
  confirmReservation: vi.fn(),
  confirmReservationInTx: vi.fn(),
  reserveCredits: vi.fn(),
}));

const fakeTx = {} as never;

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("gakuchikaStreamPolicy", () => {
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

  it("confirmInTx claims the reservation on the passed tx for billable success", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: true, balanceAfter: 7 });
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    await gakuchikaStreamPolicy.confirmInTx(
      fakeTx,
      { userId: "user-1", gakuchikaId: "g-1", newQuestionCount: 3 },
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "res-1",
    );

    expect(credits.confirmReservationInTx).toHaveBeenCalledWith(fakeTx, "res-1");
    expect(credits.confirmReservation).not.toHaveBeenCalled();
  });

  it("confirmInTx logs and throws when the reservation could not be claimed after billable success", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: false, balanceAfter: null });
    const { gakuchikaStreamPolicy } = await import("./gakuchika-stream-policy");

    await expect(
      gakuchikaStreamPolicy.confirmInTx(
        fakeTx,
        { userId: "user-1", gakuchikaId: "g-1", newQuestionCount: 3 },
        { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
        "res-1",
      ),
    ).rejects.toThrow();

    expect(logger.logError).toHaveBeenCalledWith(
      "gakuchika-reservation-confirm-after-success-failed",
      expect.any(Error),
      expect.objectContaining({ userId: "user-1", gakuchikaId: "g-1", reservationId: "res-1" }),
    );
  });
});
