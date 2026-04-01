import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectFromMock,
  dbLimitMocks,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectFromMock: vi.fn(),
  dbLimitMocks: [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()],
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

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: dbSelectFromMock,
    })),
  },
}));

describe("api/settings/profile GET", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    getSessionMock.mockReset();
    dbSelectFromMock.mockClear();
    dbLimitMocks.splice(0, dbLimitMocks.length, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    dbSelectFromMock.mockImplementation(() => ({
      where: vi.fn(() => ({
        limit: dbLimitMocks.shift(),
      })),
    }));

    const [userLimitMock, profileLimitMock, creditsLimitMock, subscriptionLimitMock, settingsLimitMock] =
      dbLimitMocks;

    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    userLimitMock.mockResolvedValue([
      {
        id: "user-1",
        name: "Test User",
        email: "user@example.com",
        image: null,
      },
    ]);
    profileLimitMock.mockResolvedValue([
      {
        userId: "user-1",
        plan: "standard",
        university: null,
        faculty: null,
        graduationYear: null,
        targetIndustries: null,
        targetJobTypes: null,
      },
    ]);
    creditsLimitMock.mockResolvedValue([
      {
        userId: "user-1",
        balance: 84,
      },
    ]);
    subscriptionLimitMock.mockResolvedValue([
      {
        userId: "user-1",
        stripePriceId: "price_std_year",
        status: "active",
        currentPeriodEnd: new Date("2026-04-30T15:00:00.000Z"),
        cancelAtPeriodEnd: true,
      },
    ]);
    settingsLimitMock.mockResolvedValue([]);
  });

  it("returns billing summary fields used by settings", async () => {
    const { GET } = await import("@/app/api/settings/profile/route");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/settings/profile")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile.creditsBalance).toBe(84);
    expect(data.profile.subscriptionStatus).toBe("active");
    expect(data.profile.billingPeriod).toBe("annual");
    expect(data.profile.cancelAtPeriodEnd).toBe(true);
    expect(data.profile.currentPeriodEnd).toBe("2026-04-30T15:00:00.000Z");
  });
});
