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
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  txSelectLimitMock: vi.fn(),
  txUpdateWhereMock: vi.fn(),
  dbSelectFromMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  dbUpdateReturningMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: dbSelectFromMock,
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
