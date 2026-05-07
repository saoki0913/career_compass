import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbSelectMock,
  dbTransactionMock,
  txSelectMock,
  txInsertMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txInsertMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    transaction: dbTransactionMock,
  },
}));

function makeTemplateQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeExistingTasksQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

function makeInsertQuery() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

const baseParams = {
  deadlineId: "deadline-1",
  deadlineType: "es_submission",
  deadlineDueDate: new Date("2026-06-30T00:00:00.000Z"),
  companyId: "company-1",
  applicationId: "application-1",
  userId: "user-1",
  guestId: null,
};

const templates = [
  {
    title: "ESを書く",
    taskType: "es",
    sortOrder: 10,
    daysBeforeDeadline: 7,
    dependsOnSortOrder: null,
  },
  {
    title: "提出する",
    taskType: "other",
    sortOrder: 20,
    daysBeforeDeadline: 0,
    dependsOnSortOrder: 10,
  },
];

describe("generateTasksForDeadline", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbTransactionMock.mockReset();
    txSelectMock.mockReset();
    txInsertMock.mockReset();

    dbSelectMock.mockReturnValue(makeTemplateQuery(templates));
    txInsertMock.mockReturnValue(makeInsertQuery());
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        select: txSelectMock,
        insert: txInsertMock,
      }),
    );

    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
  });

  it("generates tasks on the first call when no existing auto-generated tasks are present", async () => {
    txSelectMock.mockReturnValue(makeExistingTasksQuery([]));

    const { generateTasksForDeadline } = await import("./task-generation");
    const result = await generateTasksForDeadline(baseParams);

    expect(result).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(txInsertMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when auto-generated tasks already exist for the deadline", async () => {
    txSelectMock.mockReturnValue(makeExistingTasksQuery([{ id: "existing-task" }]));

    const { generateTasksForDeadline } = await import("./task-generation");
    const result = await generateTasksForDeadline(baseParams);

    expect(result).toEqual([]);
    expect(txInsertMock).not.toHaveBeenCalled();
  });

  it("still generates tasks for a different deadlineId", async () => {
    txSelectMock.mockReturnValue(makeExistingTasksQuery([]));

    const { generateTasksForDeadline } = await import("./task-generation");
    const result = await generateTasksForDeadline({
      ...baseParams,
      deadlineId: "deadline-2",
    });

    expect(result).toHaveLength(2);
    expect(txInsertMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list for deadline types with no template category", async () => {
    const { generateTasksForDeadline } = await import("./task-generation");
    const result = await generateTasksForDeadline({
      ...baseParams,
      deadlineType: "other",
    });

    expect(result).toEqual([]);
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});
