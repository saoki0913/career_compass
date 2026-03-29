import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/company-info/pricing", () => ({
  getMonthlyScheduleFetchFreeLimit: vi.fn(() => 3),
  getMonthlyRagFreeUnits: vi.fn(() => 12),
}));

vi.mock("@/lib/company-info/pdf-ingest-limits", () => ({
  getRagPdfIngestPolicySummaryJa: vi.fn(() => "summary"),
  getRagPdfMaxIngestPages: vi.fn(() => 100),
  getRagPdfMaxOcrPages: vi.fn(() => 20),
}));

vi.mock("@/lib/company-info/usage", () => ({
  getRemainingCompanyRagFreeUnitsSafe: vi.fn(async () => 7),
}));

vi.mock("@/lib/credits", () => ({
  getCreditsInfo: vi.fn(async () => ({
    balance: 84,
    monthlyAllocation: 120,
    nextResetAt: new Date("2026-04-30T15:00:00.000Z"),
  })),
  getRemainingFreeFetches: vi.fn(async () => 2),
}));

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
    from: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.from = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

describe("account-loaders", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it("returns creditsInitialData with the profile page payload", async () => {
    const { getProfilePageData } = await import("@/lib/server/account-loaders");

    const selectResults = [
      [{ id: "user-1", name: "Test User", email: "user@example.com", image: null, createdAt: new Date("2026-01-01T00:00:00.000Z") }],
      [{ userId: "user-1", plan: "standard", university: null, faculty: null, graduationYear: null, targetIndustries: null, targetJobTypes: null }],
      [{ balance: 84 }],
      [{ currentPeriodEnd: new Date("2026-04-30T15:00:00.000Z"), status: "active", stripePriceId: "price_std_year", cancelAtPeriodEnd: false }],
      [{ count: 6 }],
      [{ draftCount: 2, publishedCount: 3 }],
    ];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    const result = await getProfilePageData("user-1");

    expect(result.companyCount).toBe(6);
    expect(result.esStats).toEqual({
      draftCount: 2,
      publishedCount: 3,
      total: 5,
    });
    expect(result.creditsInitialData).toMatchObject({
      type: "user",
      plan: "standard",
      balance: 84,
      monthlyAllocation: 120,
    });
  });
});
