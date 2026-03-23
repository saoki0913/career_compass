import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  getCreditsInfoMock,
  getRemainingFreeFetchesMock,
  getGuestUserMock,
  getRemainingCompanyRagFreeUnitsSafeMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getCreditsInfoMock: vi.fn(),
  getRemainingFreeFetchesMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  getRemainingCompanyRagFreeUnitsSafeMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/credits", () => ({
  PLAN_CREDITS: {
    guest: 0,
    free: 30,
    standard: 100,
    pro: 300,
  },
  getCreditsInfo: getCreditsInfoMock,
  getRemainingFreeFetches: getRemainingFreeFetchesMock,
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: getGuestUserMock,
}));

vi.mock("@/lib/company-info/pricing", () => ({
  getMonthlyScheduleFetchFreeLimit: vi.fn((plan: string) => {
    const limits: Record<string, number> = { guest: 0, free: 5, standard: 50, pro: 150 };
    return limits[plan] ?? 0;
  }),
  getMonthlyRagFreeUnits: vi.fn((plan: string) => {
    const limits: Record<string, number> = { free: 10, standard: 100, pro: 300 };
    return limits[plan] ?? 0;
  }),
}));

vi.mock("@/lib/company-info/usage", () => ({
  getRemainingCompanyRagFreeUnitsSafe: getRemainingCompanyRagFreeUnitsSafeMock,
}));

function makeProfileQuery(plan: "free" | "standard" | "pro") {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ plan }]),
      })),
    })),
  };
}

describe("api/credits", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    getCreditsInfoMock.mockReset();
    getRemainingFreeFetchesMock.mockReset();
    getGuestUserMock.mockReset();
    getRemainingCompanyRagFreeUnitsSafeMock.mockReset();
  });

  it("returns user credits including safe monthly RAG units", async () => {
    const { GET } = await import("@/app/api/credits/route");
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue(makeProfileQuery("standard"));
    getCreditsInfoMock.mockResolvedValue({
      balance: 120,
      monthlyAllocation: 100,
      nextResetAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    getRemainingFreeFetchesMock.mockResolvedValue(18);
    getRemainingCompanyRagFreeUnitsSafeMock.mockResolvedValue(512);

    const response = await GET(new NextRequest("http://localhost:3000/api/credits"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("user");
    expect(data.plan).toBe("standard");
    expect(data.balance).toBe(120);
    expect(data.monthlyFree.selectionSchedule.remaining).toBe(18);
    expect(data.monthlyFree.selectionSchedule.limit).toBe(50);
    expect(data.monthlyFree.companyRagPages.remaining).toBe(512);
    expect(data.monthlyFree.companyRagPages.limit).toBe(100);
  });

  it("returns guest credits without monthly RAG allowance", async () => {
    const { GET } = await import("@/app/api/credits/route");
    getSessionMock.mockResolvedValue(null);
    getGuestUserMock.mockResolvedValue({ id: "guest-1" });
    getRemainingFreeFetchesMock.mockResolvedValue(0);

    const request = new NextRequest("http://localhost:3000/api/credits", {
      headers: { "x-device-token": "guest-token" },
    });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("guest");
    expect(data.balance).toBe(0);
    expect(data.monthlyAllocation).toBe(0);
    expect(data.monthlyFree.companyRagPages).toEqual({ remaining: 0, limit: 0 });
    expect(data.monthlyFree.selectionSchedule).toEqual({ remaining: 0, limit: 0 });
  });
});
