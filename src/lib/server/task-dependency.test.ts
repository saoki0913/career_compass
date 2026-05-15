import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbTransactionMock,
  txSelectMock,
  txUpdateMock,
} = vi.hoisted(() => ({
  dbTransactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txUpdateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: dbTransactionMock,
    select: vi.fn(),
    update: vi.fn(),
  },
}));

function makeSelectWhereQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

function makeUpdateSetWhereQuery() {
  return {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

describe("task-dependency", () => {
  beforeEach(() => {
    dbTransactionMock.mockReset();
    txSelectMock.mockReset();
    txUpdateMock.mockReset();
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        select: txSelectMock,
        update: txUpdateMock,
      }),
    );
  });

  it("unblocks all immediate successors when a task is completed", async () => {
    txSelectMock.mockReturnValueOnce(
      makeSelectWhereQuery([
        { id: "task-2", isBlocked: true },
        { id: "task-3", isBlocked: true },
        { id: "task-4", isBlocked: false },
      ]),
    );
    txUpdateMock.mockReturnValue(makeUpdateSetWhereQuery());

    const { unblockSuccessor } = await import("./task-dependency");
    await unblockSuccessor("task-1");

    expect(txUpdateMock).toHaveBeenCalledTimes(2);
  });
});
