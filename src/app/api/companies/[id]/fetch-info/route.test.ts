import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  enforceRateLimitLayersMock,
  getRemainingFreeFetchesMock,
  validatePublicUrlMock,
  checkPublicSourceComplianceMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getRemainingFreeFetchesMock: vi.fn(),
  validatePublicUrlMock: vi.fn(),
  checkPublicSourceComplianceMock: vi.fn(),
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
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  getRemainingFreeFetches: getRemainingFreeFetchesMock,
  hasEnoughCredits: vi.fn(),
  consumeCredits: vi.fn(),
}));

vi.mock("@/lib/company-info/usage", () => ({
  incrementMonthlyScheduleFreeUse: vi.fn(),
}));

vi.mock("@/lib/company-info/pricing", () => ({
  getMonthlyScheduleFetchFreeLimit: vi.fn(() => 5),
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  FETCH_INFO_RATE_LAYERS: [],
}));

vi.mock("@/lib/security/public-url", () => ({
  validatePublicUrl: validatePublicUrlMock,
}));

vi.mock("@/lib/company-info/source-compliance", () => ({
  checkPublicSourceCompliance: checkPublicSourceComplianceMock,
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

function makeCompanyQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: "company-1",
            userId: "user-1",
            name: "テスト株式会社",
            recruitmentUrl: "https://example.com/recruit",
          },
        ]),
      })),
    })),
  };
}

describe("api/companies/[id]/fetch-info", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    getRemainingFreeFetchesMock.mockReset();
    validatePublicUrlMock.mockReset();
    checkPublicSourceComplianceMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce(makeCompanyQuery());
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getRemainingFreeFetchesMock.mockResolvedValue(1);
    validatePublicUrlMock.mockResolvedValue({
      allowed: true,
      resolvedIps: ["93.184.216.34"],
      url: new URL("https://example.com/recruit"),
    });
    checkPublicSourceComplianceMock.mockResolvedValue({
      url: "https://example.com/recruit",
      status: "allowed",
      reasons: [],
      robotsStatus: "allowed",
      termsStatus: "allowed",
      checkedAt: "2026-03-22T00:00:00.000Z",
      policyVersion: "test",
    });
  });

  it("returns 400 without calling backend when compliance check blocks the url", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    checkPublicSourceComplianceMock.mockResolvedValueOnce({
      url: "https://example.com/mypage/login",
      status: "blocked",
      reasons: ["ログインが必要なURLは保存できません。"],
      robotsStatus: "allowed",
      termsStatus: "allowed",
      checkedAt: "2026-03-22T00:00:00.000Z",
      policyVersion: "test",
    });

    const { POST } = await import("@/app/api/companies/[id]/fetch-info/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-info", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/mypage/login",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe("PUBLIC_SOURCE_BLOCKED");
    expect(data.error.userMessage).toContain("ログインが必要なURL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 without calling backend when the url resolves to a private address", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    validatePublicUrlMock.mockResolvedValueOnce({
      allowed: false,
      code: "LOCAL_ADDRESS",
      userMessage: "内部アドレスにはアクセスできません。",
      resolvedIps: ["10.0.0.8"],
    });

    const { POST } = await import("@/app/api/companies/[id]/fetch-info/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-info", {
      method: "POST",
      body: JSON.stringify({
        url: "https://10.0.0.8/recruit",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe("INVALID_RECRUITMENT_URL");
    expect(data.error.userMessage).toBe("内部アドレスにはアクセスできません。");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not block when terms are unknown and falls through to fetch handling", async () => {
    checkPublicSourceComplianceMock.mockResolvedValueOnce({
      url: "https://example.com/recruit",
      status: "warning",
      reasons: ["robots.txt を確認できないため取得できません"],
      robotsStatus: "error",
      termsStatus: "unknown",
      checkedAt: "2026-03-22T00:00:00.000Z",
      policyVersion: "test",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("User-agent: *\nAllow: /\n", { status: 200 }))
        .mockResolvedValueOnce(new Response("<html><body>No terms link</body></html>", { status: 200 }))
        .mockResolvedValueOnce(new Response("not found", { status: 404 }))
        .mockResolvedValueOnce(new Response("not found", { status: 404 }))
        .mockResolvedValueOnce(new Response("not found", { status: 404 }))
        .mockResolvedValueOnce(new Response("not found", { status: 404 }))
        .mockResolvedValueOnce(new Response("backend unavailable", { status: 503 })),
    );

    const { POST } = await import("@/app/api/companies/[id]/fetch-info/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-info", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/recruit",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).not.toBe(400);
    expect(data.error?.code).not.toBe("PUBLIC_SOURCE_BLOCKED");
  });
});
