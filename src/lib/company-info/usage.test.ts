import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbSelectMock,
  dbUpdateSetMock,
  dbUpdateWhereMock,
  dbInsertValuesMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateSetMock: vi.fn(),
  dbUpdateWhereMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: vi.fn(() => ({
      set: dbUpdateSetMock,
    })),
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
  },
}));

describe("company-info usage schema fallback", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateSetMock.mockReset();
    dbUpdateWhereMock.mockReset();
    dbInsertValuesMock.mockReset();
    vi.restoreAllMocks();
  });

  it("returns full schedule free limit when schedule_fetch_free_uses column is missing", async () => {
    const { getRemainingMonthlyScheduleFreeFetchesSafe } = await import("@/lib/company-info/usage");

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockRejectedValue(
            new Error('column "schedule_fetch_free_uses" does not exist'),
          ),
        })),
      })),
    });

    await expect(
      getRemainingMonthlyScheduleFreeFetchesSafe("user-1", "free"),
    ).resolves.toBe(5);
  });

  it("returns full limit when Drizzle wraps Postgres missing-column in error.cause", async () => {
    const { getRemainingMonthlyScheduleFreeFetchesSafe } = await import("@/lib/company-info/usage");

    const cause = new Error('column "schedule_fetch_free_uses" does not exist');
    Object.assign(cause, { code: "42703" });
    const wrapped = new Error(
      'Failed query: select "schedule_fetch_free_uses" from "company_info_monthly_usage" where ...',
    );
    wrapped.cause = cause;

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockRejectedValue(wrapped),
        })),
      })),
    });

    await expect(
      getRemainingMonthlyScheduleFreeFetchesSafe("user-1", "free"),
    ).resolves.toBe(5);
  });

  it("treats missing schedule column as a no-op when incrementing free usage", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { incrementMonthlyScheduleFreeUse } = await import("@/lib/company-info/usage");

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockRejectedValue(
            new Error('column "schedule_fetch_free_uses" does not exist'),
          ),
        })),
      })),
    });

    await expect(incrementMonthlyScheduleFreeUse("user-1")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
