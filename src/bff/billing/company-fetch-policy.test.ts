import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  cancelReservation: vi.fn(),
  confirmReservation: vi.fn(),
  confirmReservationInTx: vi.fn(),
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

  it("confirms only paid credit reservations and requires a success reservation", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.confirmReservation).mockResolvedValue({ confirmed: true });
    const { companyFetchPolicy } = await import("./company-fetch-policy");
    const outcome = { kind: "billable_success" as const, creditsConsumed: 1, freeQuotaUsed: false };

    await companyFetchPolicy.confirm(ctx, outcome, "schedule-free-quota");
    await companyFetchPolicy.confirm(ctx, outcome, "reservation-1");

    expect(credits.confirmReservation).toHaveBeenCalledTimes(1);
    expect(credits.confirmReservation).toHaveBeenCalledWith("reservation-1");
    await expect(companyFetchPolicy.confirm(ctx, outcome, null)).rejects.toThrow("Missing company fetch billing reservation");
  });

  it("logs when paid credit reservation confirmation is not applied", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.confirmReservation).mockResolvedValue({ confirmed: false });
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await companyFetchPolicy.confirm(
      ctx,
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "reservation-1",
    );

    expect(logger.logError).toHaveBeenCalledWith(
      "company-fetch-reservation-confirm-after-success-failed",
      expect.any(Error),
      expect.objectContaining({ reservationId: "reservation-1", userId: "user-1" }),
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

  it("confirmInTx logs when paid credit reservation could not be claimed", async () => {
    const credits = await import("@/lib/credits");
    const logger = await import("@/lib/logger");
    vi.mocked(credits.confirmReservationInTx).mockResolvedValue({ confirmed: false, balanceAfter: null });
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await companyFetchPolicy.confirmInTx(
      fakeTx,
      ctx,
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "reservation-1",
    );

    expect(logger.logError).toHaveBeenCalledWith(
      "company-fetch-reservation-confirm-after-success-failed",
      expect.any(Error),
      expect.objectContaining({ reservationId: "reservation-1", userId: "user-1" }),
    );
  });

  it("cancels free quota and paid credit reservations through their matching stores", async () => {
    const usage = await import("@/lib/company-info/usage");
    const credits = await import("@/lib/credits");
    const { companyFetchPolicy } = await import("./company-fetch-policy");

    await companyFetchPolicy.cancel(ctx, "schedule-free-quota", "failure");
    await companyFetchPolicy.cancel(ctx, "reservation-1", "failure");

    expect(usage.cancelMonthlyScheduleFreeUse).toHaveBeenCalledWith("user-1");
    expect(credits.cancelReservation).toHaveBeenCalledWith("reservation-1");
  });
});
