import { beforeEach, describe, expect, it, vi } from "vitest";

const { BillingGateUnavailableError } = vi.hoisted(() => ({
  BillingGateUnavailableError: class BillingGateUnavailableError extends Error {
    code = "BILLING_GATE_UNAVAILABLE";

    constructor(message = "Billing gate unavailable") {
      super(message);
      this.name = "BillingGateUnavailableError";
    }
  },
}));

vi.mock("@/lib/credits", () => ({
  reserveCredits: vi.fn(),
  confirmReservation: vi.fn(),
  confirmReservationInTx: vi.fn(),
  cancelReservation: vi.fn(),
  BillingGateUnavailableError,
  isBillingGateUnavailableError: (error: unknown) => error instanceof BillingGateUnavailableError,
}));

const fakeTx = {} as never;

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("esReviewStreamPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects guests before reserving credits", async () => {
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");

    const result = await esReviewStreamPolicy.precheck({
      userId: null,
      guestId: "guest-1",
      documentId: "doc-1",
      creditCost: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.errorResponse?.status).toBe(401);
  });

  it("reserves credits for logged-in users", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: true,
      reservationId: "reservation-1",
      newBalance: 8,
    });
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");

    const result = await esReviewStreamPolicy.reserve?.(
      { userId: "user-1", guestId: null, documentId: "doc-1", creditCost: 2 },
      2,
    );

    expect(result?.reservationId).toBe("reservation-1");
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      "user-1",
      2,
      "es_review",
      "doc-1",
      "ES添削: doc-1",
    );
  });

  it("returns 402 when credit reservation fails", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: false,
      reservationId: "",
      newBalance: 0,
    });
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");

    const result = await esReviewStreamPolicy.reserve?.(
      { userId: "user-1", guestId: null, documentId: "doc-1", creditCost: 2 },
      2,
    );

    expect(result?.reservationId).toBeNull();
    expect(result?.errorResponse?.status).toBe(402);
  });

  it("returns structured 503 when the billing gate schema is unavailable", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: false,
      reservationId: "",
      newBalance: 8,
      error: "subscriptions billing hold columns are missing",
      errorCode: "BILLING_GATE_UNAVAILABLE",
    });
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");

    const result = await esReviewStreamPolicy.reserve?.(
      {
        userId: "user-1",
        guestId: null,
        documentId: "doc-1",
        creditCost: 2,
        requestId: "req-1",
      },
      2,
    );

    expect(result?.reservationId).toBeNull();
    expect(result?.errorResponse?.status).toBe(503);
    expect(result?.errorResponse?.headers.get("X-Request-Id")).toBe("req-1");
    await expect(result?.errorResponse?.json()).resolves.toMatchObject({
      error: {
        code: "BILLING_GATE_UNAVAILABLE",
        retryable: true,
      },
      requestId: "req-1",
    });
  });

  it("confirmInTx claims the reservation on the passed tx only for billable success", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: true, balanceAfter: 6 });
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");
    const ctx = { userId: "user-1", guestId: null, documentId: "doc-1", creditCost: 2 };

    await esReviewStreamPolicy.confirmInTx(
      fakeTx,
      ctx,
      { kind: "non_billable_success", reason: "no_changes" },
      "reservation-1",
    );
    await esReviewStreamPolicy.confirmInTx(
      fakeTx,
      ctx,
      { kind: "billable_success", creditsConsumed: 2, freeQuotaUsed: false },
      "reservation-1",
    );

    expect(credits.confirmReservationInTx).toHaveBeenCalledTimes(1);
    expect(credits.confirmReservationInTx).toHaveBeenCalledWith(fakeTx, "reservation-1");
    expect(credits.confirmReservation).not.toHaveBeenCalled();
  });

  it("confirmInTx logs and throws when the reservation could not be claimed after billable success", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: false, balanceAfter: null });
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");

    await expect(
      esReviewStreamPolicy.confirmInTx(
        fakeTx,
        { userId: "user-1", guestId: null, documentId: "doc-1", creditCost: 2 },
        { kind: "billable_success", creditsConsumed: 2, freeQuotaUsed: false },
        "reservation-1",
      ),
    ).rejects.toThrow();

    expect(logger.logError).toHaveBeenCalledWith(
      "es-review-reservation-confirm-after-success-failed",
      expect.any(Error),
      expect.objectContaining({ reservationId: "reservation-1" }),
    );
  });

  it("cancels reservations on failure without throwing cancel errors", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.cancelReservation).mockRejectedValue(new Error("db unavailable"));
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");

    await expect(
      esReviewStreamPolicy.cancel(
        { userId: "user-1", guestId: null, documentId: "doc-1", creditCost: 2 },
        "reservation-1",
        "upstream_failure",
      ),
    ).resolves.toBeUndefined();

    expect(credits.cancelReservation).toHaveBeenCalledWith("reservation-1");
    expect(logger.logError).toHaveBeenCalledWith(
      "es-review-reservation-cancel",
      expect.any(Error),
      expect.objectContaining({
        reservationId: "reservation-1",
        documentId: "doc-1",
        userId: "user-1",
        reason: "upstream_failure",
      }),
    );
  });
});
