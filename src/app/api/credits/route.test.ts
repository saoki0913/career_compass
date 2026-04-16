import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  getCreditsInfoMock,
  getRemainingFreeFetchesMock,
  getGuestUserMock,
  getRemainingCompanyRagHtmlFreeUnitsSafeMock,
  getRemainingCompanyRagPdfFreeUnitsSafeMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getCreditsInfoMock: vi.fn(),
  getRemainingFreeFetchesMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  getRemainingCompanyRagHtmlFreeUnitsSafeMock: vi.fn(),
  getRemainingCompanyRagPdfFreeUnitsSafeMock: vi.fn(),
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
    free: 50,
    standard: 350,
    pro: 750,
  },
  getCreditsInfo: getCreditsInfoMock,
  getRemainingFreeFetches: getRemainingFreeFetchesMock,
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: getGuestUserMock,
}));

vi.mock("@/lib/company-info/pricing", () => ({
  getMonthlyScheduleFetchFreeLimit: vi.fn((plan: string) => {
    const limits: Record<string, number> = { guest: 0, free: 10, standard: 100, pro: 200 };
    return limits[plan] ?? 0;
  }),
  getMonthlyRagHtmlFreeUnits: vi.fn((plan: string) => {
    const limits: Record<string, number> = { free: 20, standard: 200, pro: 500 };
    return limits[plan] ?? 0;
  }),
  getMonthlyRagPdfFreeUnits: vi.fn((plan: string) => {
    const limits: Record<string, number> = { free: 60, standard: 250, pro: 600 };
    return limits[plan] ?? 0;
  }),
}));

vi.mock("@/lib/company-info/usage", () => ({
  getRemainingCompanyRagHtmlFreeUnitsSafe: getRemainingCompanyRagHtmlFreeUnitsSafeMock,
  getRemainingCompanyRagPdfFreeUnitsSafe: getRemainingCompanyRagPdfFreeUnitsSafeMock,
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
    getRemainingCompanyRagHtmlFreeUnitsSafeMock.mockReset();
    getRemainingCompanyRagPdfFreeUnitsSafeMock.mockReset();
  });

  it("returns user credits including safe monthly RAG units", async () => {
    const { GET } = await import("@/app/api/credits/route");
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue(makeProfileQuery("standard"));
    getCreditsInfoMock.mockResolvedValue({
      balance: 400,
      monthlyAllocation: 350,
      nextResetAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    getRemainingFreeFetchesMock.mockResolvedValue(72);
    getRemainingCompanyRagHtmlFreeUnitsSafeMock.mockResolvedValue(168);
    getRemainingCompanyRagPdfFreeUnitsSafeMock.mockResolvedValue(220);

    const response = await GET(new NextRequest("http://localhost:3000/api/credits"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("user");
    expect(data.plan).toBe("standard");
    expect(data.balance).toBe(400);
    expect(data.monthlyFree.selectionSchedule.remaining).toBe(72);
    expect(data.monthlyFree.selectionSchedule.limit).toBe(100);
    expect(data.monthlyFree.companyRagHtmlPages.remaining).toBe(168);
    expect(data.monthlyFree.companyRagHtmlPages.limit).toBe(200);
    expect(data.monthlyFree.companyRagPdfPages.remaining).toBe(220);
    expect(data.monthlyFree.companyRagPdfPages.limit).toBe(250);
  });

  it("returns guest credits without monthly RAG allowance", async () => {
    const { GET } = await import("@/app/api/credits/route");
    getSessionMock.mockResolvedValue(null);
    getGuestUserMock.mockResolvedValue({ id: "guest-1" });
    getRemainingFreeFetchesMock.mockResolvedValue(0);

    const request = new NextRequest("http://localhost:3000/api/credits", {
      headers: { cookie: "guest_device_token=11111111-1111-4111-8111-111111111111" },
    });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe("guest");
    expect(data.balance).toBe(0);
    expect(data.monthlyAllocation).toBe(0);
    expect(data.monthlyFree.companyRagHtmlPages).toEqual({ remaining: 0, limit: 0 });
    expect(data.monthlyFree.companyRagPdfPages).toEqual({ remaining: 0, limit: 0 });
    expect(data.monthlyFree.selectionSchedule).toEqual({ remaining: 0, limit: 0 });
  });
});
