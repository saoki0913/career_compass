import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbTransactionMock,
  txSelectLimitMock,
  txExecuteMock,
  txInsertValuesMock,
  txCreditInsertReturningMock,
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  txSelectLimitMock: vi.fn(),
  txExecuteMock: vi.fn(),
  txInsertValuesMock: vi.fn(),
  txCreditInsertReturningMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: dbTransactionMock,
  },
}));

function createCreditTx() {
  return {
    execute: txExecuteMock,
    insert: vi.fn(() => ({
      values: txInsertValuesMock,
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: txSelectLimitMock,
        })),
      })),
    })),
  };
}

describe("updatePlanAllocation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = createCreditTx();
      return fn(tx);
    });
    txCreditInsertReturningMock.mockResolvedValue([{ balance: 50 }]);
    txInsertValuesMock.mockReturnValue({
      onConflictDoNothing: vi.fn(() => ({
        returning: txCreditInsertReturningMock,
      })),
    });
  });

  it("records the actual balance delta after a plan upgrade", async () => {
    txSelectLimitMock.mockResolvedValueOnce([
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
    expect(txCreditInsertReturningMock).not.toHaveBeenCalled();
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 400,
      type: "plan_change",
      balanceAfter: 694,
    }));
  });

  it("skips allocation updates when the current monthly allocation already matches the plan", async () => {
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 750,
        monthlyAllocation: 750,
      },
    ]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "pro");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteMock).not.toHaveBeenCalled();
    expect(txInsertValuesMock).not.toHaveBeenCalled();
  });

  it("clamps downgrade deltas at zero and records the actual delta", async () => {
    txSelectLimitMock.mockResolvedValueOnce([
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
    txSelectLimitMock.mockResolvedValueOnce([]);
    txCreditInsertReturningMock.mockResolvedValueOnce([]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 50, balance: 350 }]);

    const { updatePlanAllocation } = await import("@/lib/credits/monthly-reset");
    await updatePlanAllocation("user-1", "standard");

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCreditInsertReturningMock).toHaveBeenCalledTimes(1);
    expect(txExecuteMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 300,
      type: "plan_change",
      balanceAfter: 350,
    }));
  });

  it("lets webhook handlers run allocation updates inside their existing transaction", async () => {
    const tx = createCreditTx();
    txSelectLimitMock.mockResolvedValueOnce([
      {
        userId: "user-1",
        balance: 294,
        monthlyAllocation: 350,
      },
    ]);
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 294, balance: 694 }]);

    const { updatePlanAllocationCoreTx } = await import("@/lib/credits/monthly-reset");
    await Reflect.apply(updatePlanAllocationCoreTx, null, [tx, "user-1", "pro"]);

    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 400,
      type: "plan_change",
      balanceAfter: 694,
    }));
  });
});

describe("grantMonthlyCredits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = createCreditTx();
      return fn(tx);
    });
    txInsertValuesMock.mockReturnValue(undefined);
  });

  it("records exactly one monthly grant when the locked row is updated", async () => {
    txExecuteMock.mockResolvedValueOnce([{ previous_balance: 12, balance: 350 }]);

    const { grantMonthlyCredits } = await import("@/lib/credits/monthly-reset");
    await grantMonthlyCredits("user-1");

    expect(txInsertValuesMock).toHaveBeenCalledTimes(1);
    expect(txInsertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      amount: 338,
      type: "monthly_grant",
      status: "applied",
      balanceAfter: 350,
    }));
  });

  it("does not insert a duplicate ledger row when the user was already reset this month", async () => {
    txExecuteMock.mockResolvedValueOnce([]);

    const { grantMonthlyCredits } = await import("@/lib/credits/monthly-reset");
    await grantMonthlyCredits("user-1");

    expect(txInsertValuesMock).not.toHaveBeenCalled();
  });
});
