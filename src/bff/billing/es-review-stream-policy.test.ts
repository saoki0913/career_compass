import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  reserveCredits: vi.fn(),
  confirmReservation: vi.fn(),
  cancelReservation: vi.fn(),
}));

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

  it("confirms reservations only for billable success", async () => {
    const credits = await import("@/lib/credits");
    const { esReviewStreamPolicy } = await import("./es-review-stream-policy");
    const ctx = { userId: "user-1", guestId: null, documentId: "doc-1", creditCost: 2 };

    await esReviewStreamPolicy.confirm(
      ctx,
      { kind: "non_billable_success", reason: "no_changes" },
      "reservation-1",
    );
    await esReviewStreamPolicy.confirm(
      ctx,
      { kind: "billable_success", creditsConsumed: 2, freeQuotaUsed: false },
      "reservation-1",
    );

    expect(credits.confirmReservation).toHaveBeenCalledTimes(1);
    expect(credits.confirmReservation).toHaveBeenCalledWith("reservation-1");
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
