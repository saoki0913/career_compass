import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  cancelReservation: vi.fn(),
  confirmReservation: vi.fn(),
  confirmReservationInTx: vi.fn(),
  getReservationStatusInTx: vi.fn(),
  consumeCredits: vi.fn(),
  getRemainingFreeFetches: vi.fn(),
  hasEnoughCredits: vi.fn(),
  reserveCredits: vi.fn(),
}));

const fakeTx = {} as never;

vi.mock("@/lib/company-info/usage", () => ({
  cancelMonthlyScheduleFreeUse: vi.fn(),
  reserveMonthlyScheduleFreeUse: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("companyFetchPolicy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const ctx = {
    userId: "user-1",
    guestId: null,
    companyId: "company-1",
    companyName: "テスト株式会社",
    plan: "free" as const,
  };

  it("uses monthly free quota before checking credits", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.getRemainingFreeFetches).mockResolvedValue(1);
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    const result = await companyFetchPolicy.precheck(ctx);

    expect(result).toEqual({ ok: true, freeQuotaAvailable: true });
    expect(credits.hasEnoughCredits).not.toHaveBeenCalled();
  });

  it("returns structured failure signal without route error body when paid credits are insufficient", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.getRemainingFreeFetches).mockResolvedValue(0);
    vi.mocked(credits.hasEnoughCredits).mockResolvedValue(false);
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    const result = await companyFetchPolicy.precheck(ctx);

    expect(result.ok).toBe(false);
    expect(result.freeQuotaAvailable).toBe(false);
    expect(result.errorResponse).toBeUndefined();
  });

  it("reserves free monthly quota before paid credits", async () => {
    const usage = await import("@/lib/company-info/usage");
    const credits = await import("@/lib/credits");
    vi.mocked(usage.reserveMonthlyScheduleFreeUse).mockResolvedValue(true);
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    const result = await companyFetchPolicy.reserve?.(ctx, 1);

    expect(result?.reservationId).toBe("schedule-free-quota");
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it("reserves paid credits when free quota reservation is unavailable", async () => {
    const usage = await import("@/lib/company-info/usage");
    const credits = await import("@/lib/credits");
    vi.mocked(usage.reserveMonthlyScheduleFreeUse).mockResolvedValue(false);
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: true,
      reservationId: "reservation-1",
      newBalance: 9,
    });
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    const result = await companyFetchPolicy.reserve?.(ctx, 1);

    expect(result?.reservationId).toBe("reservation-1");
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      "user-1",
      1,
      "company_fetch",
      "company-1",
      "選考スケジュール取得: テスト株式会社",
    );
  });

  it("confirmInTx claims paid credits on the passed tx, skips free quota, and requires a reservation", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: true, balanceAfter: 9 });
    const { companyFetchPolicy } = await import("./company-fetch-policy");
    const outcome = { kind: "billable_success" as const, creditsConsumed: 1, freeQuotaUsed: false };

    await companyFetchPolicy.confirmInTx(fakeTx, ctx, outcome, "schedule-free-quota");
    await companyFetchPolicy.confirmInTx(fakeTx, ctx, outcome, "reservation-1");

    expect(credits.confirmReservationInTx).toHaveBeenCalledTimes(1);
    expect(credits.confirmReservationInTx).toHaveBeenCalledWith(fakeTx, "reservation-1");
    expect(credits.confirmReservation).not.toHaveBeenCalled();
    await expect(companyFetchPolicy.confirmInTx(fakeTx, ctx, outcome, null)).rejects.toThrow(
      "Missing company fetch billing reservation",
    );
  });

  it("confirmInTx treats an already-confirmed reservation as an idempotent re-run without logging or recharging", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    // claim returns false because the row already left `reserved`; the status
    // lookup proves it was confirmed by a prior run, so this is benign.
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: false, balanceAfter: null });
    vi.mocked(credits.getReservationStatusInTx).mockResolvedValue("confirmed");
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await companyFetchPolicy.confirmInTx(
      fakeTx,
      ctx,
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "reservation-1",
    );

    expect(credits.getReservationStatusInTx).toHaveBeenCalledWith(fakeTx, "reservation-1");
    // Idempotent re-run: no error surfaced, and never re-charge via consumeCredits.
    expect(logger.logError).not.toHaveBeenCalled();
    expect(credits.consumeCredits).not.toHaveBeenCalled();
  });

  it("confirmInTx logs (without recharging or throwing) when a reserved claim is genuinely lost", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    // claim returns false and the row is no longer reserved nor confirmed
    // (e.g. swept to `canceled`). Near-impossible for company-fetch, but we
    // surface it for ops visibility and never auto-compensate (double-charge
    // footgun) nor throw (deadlines are already persisted and unrecoverable).
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: false, balanceAfter: null });
    vi.mocked(credits.getReservationStatusInTx).mockResolvedValue("canceled");
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await expect(
      companyFetchPolicy.confirmInTx(
        fakeTx,
        ctx,
        { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
        "reservation-1",
      ),
    ).resolves.toBeUndefined();

    expect(logger.logError).toHaveBeenCalledWith(
      "company-fetch:confirm-could-not-claim-reserved",
      expect.any(Error),
      expect.objectContaining({
        reservationId: "reservation-1",
        userId: "user-1",
        companyId: "company-1",
        currentStatus: "canceled",
        severity: "high",
      }),
    );
    expect(credits.consumeCredits).not.toHaveBeenCalled();
  });

  it("cancels free quota and paid credit reservations through their matching stores", async () => {
    const usage = await import("@/lib/company-info/usage");
    const credits = await import("@/lib/credits");
    vi.mocked(credits.cancelReservation).mockResolvedValue({ canceled: true, refundedAmount: 1 });
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await companyFetchPolicy.cancel(ctx, "schedule-free-quota", "failure");
    await companyFetchPolicy.cancel(ctx, "reservation-1", "failure");

    expect(usage.cancelMonthlyScheduleFreeUse).toHaveBeenCalledWith("user-1");
    expect(credits.cancelReservation).toHaveBeenCalledWith("reservation-1");
  });

  it("surfaces a paid reservation cancel that could not claim the row (no refund applied)", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.cancelReservation).mockResolvedValue({ canceled: false, refundedAmount: 0 });
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await companyFetchPolicy.cancel(ctx, "reservation-1", "duplicates_only");

    expect(logger.logError).toHaveBeenCalledWith(
      "company-fetch-reservation-cancel-not-applied",
      expect.any(Error),
      expect.objectContaining({ reservationId: "reservation-1", userId: "user-1", reason: "duplicates_only" }),
    );
  });

  it("logs a paid reservation cancel exception without rethrowing", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.cancelReservation).mockRejectedValue(new Error("db unavailable"));
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await expect(companyFetchPolicy.cancel(ctx, "reservation-1", "unhandled_exception")).resolves.toBeUndefined();

    expect(logger.logError).toHaveBeenCalledWith(
      "company-fetch-reservation-cancel",
      expect.any(Error),
      expect.objectContaining({ reservationId: "reservation-1", userId: "user-1", reason: "unhandled_exception" }),
    );
  });
});
