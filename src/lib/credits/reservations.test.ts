/**
 * Tests for credit reservations.
 *
 * Focus: `confirmReservation` must read the current credits balance and
 * update `balanceAfter` inside a single transaction scope so the recorded
 * balance is internally consistent even if the `credits.balance` row is
 * mutated by a concurrent request between the read and the update.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbTransactionMock,
  txSelectLimitMock,
  txUpdateWhereMock,
  dbSelectFromMock,
  dbInsertValuesMock,
  dbUpdateReturningMock,
  dbSubscriptionsSelectLimitMock,
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  txSelectLimitMock: vi.fn(),
  txUpdateWhereMock: vi.fn(),
  dbSelectFromMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  dbUpdateReturningMock: vi.fn(),
  dbSubscriptionsSelectLimitMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn((selection?: Record<string, unknown>) => ({
      from: vi.fn(() => {
        if (selection && "billingHoldStatus" in selection) {
          return {
            where: vi.fn(() => ({
              limit: dbSubscriptionsSelectLimitMock,
            })),
          };
        }
        return dbSelectFromMock();
      }),
    })),
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: dbUpdateReturningMock,
        })),
      })),
    })),
    transaction: dbTransactionMock,
  },
}));

describe("confirmReservation", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    dbTransactionMock.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: txSelectLimitMock,
              })),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: txUpdateWhereMock,
            })),
          })),
        };
        await fn(tx);
      }
    );

    txUpdateWhereMock.mockResolvedValue(undefined);
  });

  it("runs select+update atomically within db.transaction", async () => {
    txSelectLimitMock
      .mockResolvedValueOnce([
        {
          id: "res-1",
          userId: "user-1",
          amount: -30,
          description: "[Reserved] ES review",
          balanceAfter: 70,
        },
      ])
      .mockResolvedValueOnce([{ userId: "user-1", balance: 70 }]);

    const { confirmReservation } = await import("@/lib/credits/reservations");
    await confirmReservation("res-1");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txSelectLimitMock).toHaveBeenCalledTimes(2);
    expect(txUpdateWhereMock).toHaveBeenCalledTimes(1);
  });

  it("records balanceAfter from the credits snapshot read within the same transaction", async () => {
    txSelectLimitMock
      .mockResolvedValueOnce([
        {
          id: "res-1",
          userId: "user-1",
          amount: -30,
          description: "[Reserved] ES review",
          balanceAfter: 70,
        },
      ])
      .mockResolvedValueOnce([{ userId: "user-1", balance: 70 }]);

    let capturedSet: Record<string, unknown> | null = null;
    dbTransactionMock.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: txSelectLimitMock,
              })),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn((values: Record<string, unknown>) => {
              capturedSet = values;
              return {
                where: txUpdateWhereMock,
              };
            }),
          })),
        };
        await fn(tx);
      }
    );

    const { confirmReservation } = await import("@/lib/credits/reservations");
    await confirmReservation("res-1");

    expect(capturedSet).not.toBeNull();
    expect(capturedSet).toMatchObject({
      description: "[Confirmed] ES review",
      balanceAfter: 70,
    });
  });

  it("falls back to the reservation snapshot balanceAfter when credits row is missing", async () => {
    txSelectLimitMock
      .mockResolvedValueOnce([
        {
          id: "res-1",
          userId: "user-1",
          amount: -30,
          description: "[Reserved]",
          balanceAfter: 42,
        },
      ])
      .mockResolvedValueOnce([]);

    let capturedSet: Record<string, unknown> | null = null;
    dbTransactionMock.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: txSelectLimitMock,
              })),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn((values: Record<string, unknown>) => {
              capturedSet = values;
              return { where: txUpdateWhereMock };
            }),
          })),
        };
        await fn(tx);
      }
    );

    const { confirmReservation } = await import("@/lib/credits/reservations");
    await confirmReservation("res-1");

    expect(capturedSet).toMatchObject({
      description: "[Confirmed]",
      balanceAfter: 42,
    });
  });

  it("skips update when reservation row is not found", async () => {
    txSelectLimitMock.mockResolvedValueOnce([]);

    const { confirmReservation } = await import("@/lib/credits/reservations");
    await confirmReservation("missing");

    expect(txUpdateWhereMock).not.toHaveBeenCalled();
  });
});

describe("consumeCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbSubscriptionsSelectLimitMock.mockResolvedValue([]);
  });

  it("runs balance update and audit insert atomically within db.transaction", async () => {
    const txInsertValuesMock = vi.fn(async () => undefined);
    const txUpdateReturningMock = vi.fn(async () => [{ newBalance: 44 }]);
    dbTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: txUpdateReturningMock,
            })),
          })),
        })),
        insert: vi.fn(() => ({ values: txInsertValuesMock })),
        select: vi.fn(),
      };
      return fn(tx);
    });

    const { consumeCredits } = await import("@/lib/credits/reservations");
    const result = await consumeCredits("user-1", 6, "es_review", "doc-1", "ES review");

    expect(result).toEqual({ success: true, newBalance: 44 });
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txUpdateReturningMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledTimes(1);
  });

  it("blocks consumption before balance mutation when billing is on hold", async () => {
    dbSubscriptionsSelectLimitMock.mockResolvedValueOnce([
      {
        status: "active",
        billingHoldStatus: "dispute",
        billingHoldReason: "Dispute under review",
      },
    ]);
    dbSelectFromMock.mockReturnValue({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ balance: 12 }]),
      })),
    });

    const { consumeCredits } = await import("@/lib/credits/reservations");
    const result = await consumeCredits("user-1", 1, "motivation");

    expect(result).toMatchObject({
      success: false,
      newBalance: 12,
      error: "Dispute under review",
      errorCode: "BILLING_HOLD",
    });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

describe("reserveCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fails closed before balance mutation when billing gate columns are missing", async () => {
    const schemaError = Object.assign(
      new Error('column "subscriptions.billing_hold_status" does not exist'),
      { code: "42703" },
    );
    dbSubscriptionsSelectLimitMock.mockRejectedValueOnce(schemaError);
    dbSelectFromMock.mockReturnValue({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ balance: 12 }]),
      })),
    });
    dbSelectFromMock.mockReturnValue({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ balance: 12 }]),
      })),
    });

    const { reserveCredits } = await import("@/lib/credits");

    const result = await reserveCredits("user-1", 1, "motivation");

    expect(result).toMatchObject({
      success: false,
      reservationId: "",
      errorCode: "BILLING_GATE_UNAVAILABLE",
    });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("blocks reservation before balance mutation when subscription is past_due", async () => {
    dbSubscriptionsSelectLimitMock.mockResolvedValueOnce([
      {
        status: "past_due",
        billingHoldStatus: "none",
        billingHoldReason: null,
      },
    ]);
    dbSelectFromMock.mockReturnValue({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ balance: 12 }]),
      })),
    });

    const { reserveCredits } = await import("@/lib/credits/reservations");
    const result = await reserveCredits("user-1", 1, "motivation");

    expect(result.success).toBe(false);
    expect(result.reservationId).toBe("");
    expect(result.newBalance).toBe(12);
    expect(result.error).toContain("past_due");
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("classifies a transaction-time billing block separately from insufficient credits", async () => {
    const txUpdateReturningMock = vi.fn(async () => []);
    const txSelectLimitMock = vi.fn(async () => [{ balance: 12 }]);
    dbSubscriptionsSelectLimitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          status: "past_due",
          billingHoldStatus: "none",
          billingHoldReason: null,
        },
      ]);
    dbSelectFromMock.mockReturnValue({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ balance: 12 }]),
      })),
    });
    dbSelectFromMock.mockReturnValue({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ balance: 12 }]),
      })),
    });
    dbTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: txUpdateReturningMock,
            })),
          })),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: txSelectLimitMock,
            })),
          })),
        })),
        insert: vi.fn(),
      };
      return fn(tx);
    });

    const { reserveCredits } = await import("@/lib/credits/reservations");
    const result = await reserveCredits("user-1", 1, "motivation");

    expect(result).toMatchObject({
      success: false,
      reservationId: "",
      newBalance: 12,
      errorCode: "SUBSCRIPTION_BLOCKED",
    });
    expect(result.error).toContain("past_due");
    expect(txUpdateReturningMock).toHaveBeenCalledOnce();
  });
});

describe("cancelReservation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("claims the reserved transaction before refunding credits", async () => {
    const returningMocks = [
      vi.fn(async () => [
        {
          userId: "user-1",
          amount: -30,
          description: "[Cancelling] ES review",
          balanceAfter: 70,
        },
      ]),
      vi.fn(async () => [{ balance: 100 }]),
      vi.fn(async () => []),
    ];
    const updateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: returningMocks.shift(),
        })),
      })),
    }));

    dbTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ update: updateMock });
    });

    const { cancelReservation } = await import("@/lib/credits/reservations");
    await cancelReservation("res-1");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(3);
  });

  it("does not refund credits when the reservation cannot be claimed", async () => {
    const returningMock = vi.fn(async () => []);
    const updateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: returningMock,
        })),
      })),
    }));

    dbTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ update: updateMock });
    });

    const { cancelReservation } = await import("@/lib/credits/reservations");
    await cancelReservation("res-1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(returningMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the credits row cannot be updated", async () => {
    const returningMocks = [
      vi.fn(async () => [
        {
          userId: "user-1",
          amount: -30,
          description: "[Cancelling] ES review",
          balanceAfter: 70,
        },
      ]),
      vi.fn(async () => []),
      vi.fn(async () => []),
    ];
    const updateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: returningMocks.shift(),
        })),
      })),
    }));

    dbTransactionMock.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ update: updateMock });
    });

    const { cancelReservation } = await import("@/lib/credits/reservations");
    await expect(cancelReservation("res-1")).rejects.toThrow("Cannot cancel credit reservation");

    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});
