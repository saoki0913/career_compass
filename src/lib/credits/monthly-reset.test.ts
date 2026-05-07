import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbTransactionMock,
  dbSelectLimitMock,
  txExecuteMock,
  txInsertValuesMock,
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
  txExecuteMock: vi.fn(),
  txInsertValuesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbSelectLimitMock,
        })),
      })),
    })),
    transaction: dbTransactionMock,
  },
}));

describe("updatePlanAllocation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: txExecuteMock,
        insert: vi.fn(() => ({ values: txInsertValuesMock })),
      };
      return fn(tx);
    });
    txInsertValuesMock.mockResolvedValue(undefined);
  });

  it("records the actual balance delta after a plan upgrade", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 294,
        monthlyAllocation: 350,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 294, balance: 694 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "pro");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 400,
      type: "plan_change",
      balanceAfter: 694,
    }));
  });

  it("clamps downgrade deltas at zero and records the actual delta", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 6,
        monthlyAllocation: 750,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 6, balance: 0 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "free");

    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: -6,
      type: "plan_change",
      balanceAfter: 0,
    }));
  });

  it("continues with a locked allocation update when concurrent initialization wins", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([]);

    const txCreditInsertReturningMock = vi.fn(async () => []);
    dbTransactionMock
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              onConflictDoNothing: vi.fn(() => ({
                returning: txCreditInsertReturningMock,
              })),
            })),
          })),
        };
        return fn(tx);
      })
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: txExecuteMock,
          insert: vi.fn(() => ({ values: txInsertValuesMock })),
        };
        return fn(tx);
      });
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 50, balance: 350 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "standard");

    expect(dbTransactionMock).toHaveBeenCalledTimes(2);
    expect(txCreditInsertReturningMock).toHaveBeenCalledTimes(1);
    expect(txExecuteMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 300,
      type: "plan_change",
      balanceAfter: 350,
    }));
  });
});
