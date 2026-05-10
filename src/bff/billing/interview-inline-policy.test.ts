import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits", () => ({
  reserveCredits: vi.fn(),
  confirmReservation: vi.fn(),
  cancelReservation: vi.fn(),
}));

describe("interviewInlinePolicy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reserves interview credits with the route-provided transaction metadata", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: true,
      reservationId: "reservation-1",
      newBalance: 8,
    });
    const { interviewInlinePolicy } = await import("./interview-inline-policy");

    const result = await interviewInlinePolicy.reserve?.(
      {
        userId: "user-1",
        companyId: "company-1",
        companyName: "テスト株式会社",
        transactionType: "interview",
        descriptionPrefix: "面接対策開始",
      },
      2,
    );

    expect(result?.reservationId).toBe("reservation-1");
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      "user-1",
      2,
      "interview",
      "company-1",
      "面接対策開始: テスト株式会社",
    );
  });

  it("returns an empty reservation result when credit reservation fails", async () => {
    const credits = await import("@/lib/credits");
    vi.mocked(credits.reserveCredits).mockResolvedValue({
      success: false,
      reservationId: "",
      newBalance: 0,
      error: "Insufficient credits",
      errorCode: "INSUFFICIENT_CREDITS",
    });
    const { interviewInlinePolicy } = await import("./interview-inline-policy");

    const result = await interviewInlinePolicy.reserve?.(
      {
        userId: "user-1",
        companyId: "company-1",
        companyName: "テスト株式会社",
        transactionType: "interview_feedback",
        descriptionPrefix: "面接対策講評",
      },
      6,
    );

    expect(result).toEqual({ reservationId: null });
    expect(credits.confirmReservation).not.toHaveBeenCalled();
    expect(credits.cancelReservation).not.toHaveBeenCalled();
  });

  it("confirms reservations only for billable success", async () => {
    const credits = await import("@/lib/credits");
    const { interviewInlinePolicy } = await import("./interview-inline-policy");
    const ctx = {
      userId: "user-1",
      companyId: "company-1",
      companyName: "テスト株式会社",
      transactionType: "interview" as const,
      descriptionPrefix: "面接対策回答",
    };

    await interviewInlinePolicy.confirm(
      ctx,
      { kind: "failure", reason: "upstream_error" },
      "reservation-1",
    );
    await interviewInlinePolicy.confirm(
      ctx,
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      null,
    );
    await interviewInlinePolicy.confirm(
      ctx,
      { kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false },
      "reservation-1",
    );

    expect(credits.confirmReservation).toHaveBeenCalledTimes(1);
    expect(credits.confirmReservation).toHaveBeenCalledWith("reservation-1");
  });

  it("cancels existing reservations and ignores missing reservations", async () => {
    const credits = await import("@/lib/credits");
    const { interviewInlinePolicy } = await import("./interview-inline-policy");
    const ctx = {
      userId: "user-1",
      companyId: "company-1",
      companyName: "テスト株式会社",
      transactionType: "interview" as const,
      descriptionPrefix: "面接対策回答",
    };

    await interviewInlinePolicy.cancel(ctx, null, "upstream_abort");
    await interviewInlinePolicy.cancel(ctx, "reservation-1", "upstream_abort");

    expect(credits.cancelReservation).toHaveBeenCalledTimes(1);
    expect(credits.cancelReservation).toHaveBeenCalledWith("reservation-1");
  });
});
