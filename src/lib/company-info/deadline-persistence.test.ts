import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

function makeSelectFromWhereQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

type ExistingDeadline = {
  id: string;
  companyId: string;
  type: string;
  title: string;
  dueDate: Date | null;
};

describe("findPotentialDuplicatesBatch", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it("returns an empty map when candidates list is empty", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");
    const result = await findPotentialDuplicatesBatch([]);
    expect(result.size).toBe(0);
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns a match when same companyId, type, dueDate within 1 day, and normalized title matches", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    const existingDeadline: ExistingDeadline = {
      id: "existing-1",
      companyId: "company-1",
      type: "es_submission",
      title: "ES提出",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
    };
    dbSelectMock.mockReturnValueOnce(makeSelectFromWhereQuery([existingDeadline]));

    const result = await findPotentialDuplicatesBatch([
      {
        companyId: "company-1",
        type: "es_submission",
        dueDate: new Date("2026-04-10T06:00:00.000Z"),
        title: "ES提出",
      },
    ]);

    expect(result.size).toBe(1);
    expect(result.get(0)).toEqual([
      {
        id: "existing-1",
        title: "ES提出",
        type: "es_submission",
        dueDate: existingDeadline.dueDate!.toISOString(),
      },
    ]);
  });

  it("ignores records of a different type even when title and dueDate match", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    const existingDeadline: ExistingDeadline = {
      id: "existing-2",
      companyId: "company-1",
      type: "web_test",
      title: "ES提出",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
    };
    dbSelectMock.mockReturnValueOnce(makeSelectFromWhereQuery([existingDeadline]));

    const result = await findPotentialDuplicatesBatch([
      {
        companyId: "company-1",
        type: "es_submission",
        dueDate: new Date("2026-04-10T00:00:00.000Z"),
        title: "ES提出",
      },
    ]);

    expect(result.size).toBe(0);
  });

  it("ignores records where dueDate differs by more than 1 day", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    const existingDeadline: ExistingDeadline = {
      id: "existing-3",
      companyId: "company-1",
      type: "es_submission",
      title: "ES提出",
      dueDate: new Date("2026-04-08T00:00:00.000Z"),
    };
    dbSelectMock.mockReturnValueOnce(makeSelectFromWhereQuery([existingDeadline]));

    const result = await findPotentialDuplicatesBatch([
      {
        companyId: "company-1",
        type: "es_submission",
        dueDate: new Date("2026-04-10T00:00:00.000Z"),
        title: "ES提出",
      },
    ]);

    expect(result.size).toBe(0);
  });

  it("ignores records whose normalized title does not match", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    const existingDeadline: ExistingDeadline = {
      id: "existing-4",
      companyId: "company-1",
      type: "es_submission",
      title: "書類選考",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
    };
    dbSelectMock.mockReturnValueOnce(makeSelectFromWhereQuery([existingDeadline]));

    const result = await findPotentialDuplicatesBatch([
      {
        companyId: "company-1",
        type: "es_submission",
        dueDate: new Date("2026-04-10T00:00:00.000Z"),
        title: "ES提出",
      },
    ]);

    expect(result.size).toBe(0);
  });

  it("skips the record identified by excludeId even when all other criteria match", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    const existingDeadline: ExistingDeadline = {
      id: "existing-5",
      companyId: "company-1",
      type: "es_submission",
      title: "ES提出",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
    };
    dbSelectMock.mockReturnValueOnce(makeSelectFromWhereQuery([existingDeadline]));

    const result = await findPotentialDuplicatesBatch([
      {
        companyId: "company-1",
        type: "es_submission",
        dueDate: new Date("2026-04-10T00:00:00.000Z"),
        title: "ES提出",
        excludeId: "existing-5",
      },
    ]);

    expect(result.size).toBe(0);
  });

  it("normalizes titles before comparison (parentheses and ordinal numbers stripped)", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    const existingDeadline: ExistingDeadline = {
      id: "existing-6",
      companyId: "company-1",
      type: "interview_1",
      title: "面接（第一次）",
      dueDate: new Date("2026-04-10T00:00:00.000Z"),
    };
    dbSelectMock.mockReturnValueOnce(makeSelectFromWhereQuery([existingDeadline]));

    const result = await findPotentialDuplicatesBatch([
      {
        companyId: "company-1",
        type: "interview_1",
        dueDate: new Date("2026-04-10T00:00:00.000Z"),
        title: "面接",
      },
    ]);

    expect(result.size).toBe(1);
  });

  it("performs one DB query per unique companyId when multiple candidates share a company", async () => {
    const { findPotentialDuplicatesBatch } = await import("./deadline-persistence");

    dbSelectMock.mockReturnValue(makeSelectFromWhereQuery([]));

    await findPotentialDuplicatesBatch([
      { companyId: "company-1", type: "es_submission", dueDate: new Date("2026-04-10T00:00:00.000Z"), title: "ES提出" },
      { companyId: "company-1", type: "web_test", dueDate: new Date("2026-04-15T00:00:00.000Z"), title: "Webテスト" },
    ]);

    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });
});
