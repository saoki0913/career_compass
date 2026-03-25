import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  enforceRateLimitLayersMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
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

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/company-info/source-compliance", () => ({
  filterAllowedPublicSourceUrls: vi.fn(async (urls: string[]) => ({
    allowedUrls: urls,
    blockedResults: [],
    warningResults: [],
    results: urls.map((url) => ({
      url,
      status: "allowed",
      reasons: [],
    })),
  })),
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  COMPANY_SEARCH_RATE_LAYERS: [],
}));

function makeCompanyQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: "company-1",
            userId: "user-1",
            name: "テスト株式会社",
            industry: "IT",
          },
        ]),
      })),
    })),
  };
}

describe("api/companies/[id]/search-pages", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue(makeCompanyQuery());
    enforceRateLimitLayersMock.mockResolvedValue(null);
  });

  it("returns 429 without calling backend when rate limited", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    enforceRateLimitLayersMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            userMessage: "リクエストが多すぎます。",
            action: "42秒待ってから再試行してください。",
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "42" } },
      ),
    );

    const { POST } = await import("@/app/api/companies/[id]/search-pages/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/search-pages", {
      method: "POST",
      body: JSON.stringify({ customQuery: "採用情報" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
