import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  enforceRateLimitLayersMock,
  fetchFastApiInternalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
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

vi.mock("@/lib/company-info/sources", () => ({
  detectContentTypeFromUrl: vi.fn(() => "corporate_site"),
}));

vi.mock("@/lib/company-info/usage", () => ({
  getRemainingCompanyRagHtmlFreeUnits: vi.fn(async () => 8),
  getRemainingCompanyRagPdfFreeUnits: vi.fn(async () => 12),
}));

vi.mock("@/lib/company-info/pricing", () => ({
  calculatePdfIngestCredits: vi.fn((pages: number) => (pages > 0 ? 2 : 0)),
}));

vi.mock("@/lib/company-info/source-compliance", () => ({
  filterAllowedPublicSourceUrls: vi.fn(async (urls: string[]) => ({
    allowedUrls: urls,
    blockedResults: [],
  })),
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  CORPORATE_MUTATE_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
  // V-1 principal wiring: the route now uses fetchFastApiWithPrincipal for
  // company-info RAG. Tests treat both entry points identically.
  fetchFastApiWithPrincipal: (path: string, init?: RequestInit & { principal?: unknown }) => {
    const { principal: _principal, ...rest } = (init || {}) as RequestInit & {
      principal?: unknown;
    };
    void _principal;
    return fetchFastApiInternalMock(path, rest);
  },
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
          },
        ]),
      })),
    })),
  };
}

describe("api/companies/[id]/fetch-corporate/estimate", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    enforceRateLimitLayersMock.mockResolvedValue(null);
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce(makeCompanyQuery());
    fetchFastApiInternalMock.mockImplementation((path: string, init?: RequestInit) =>
      fetch(`https://fastapi.test${path}`, init)
    );
  });

  it("forwards billing_plan to the backend estimate request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          company_id: "company-1",
          estimated_pages_crawled: 3,
          estimated_html_pages: 1,
          estimated_pdf_pages: 2,
          estimated_google_ocr_pages: 1,
          estimated_mistral_ocr_pages: 0,
          will_truncate: false,
          requires_confirmation: false,
          errors: [],
          page_routing_summaries: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/estimate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate/estimate", {
      method: "POST",
      body: JSON.stringify({
        urls: ["https://example.com/company"],
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requiresConfirmation).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, backendInit] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(backendInit?.body ?? "{}"));
    expect(body.billing_plan).toBe("free");
    expect(body.urls).toEqual(["https://example.com/company"]);
  });

  it("returns error and errors fields on 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    dbSelectMock.mockReset();

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/estimate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate/estimate", {
      method: "POST",
      body: JSON.stringify({ urls: ["https://example.com/"] }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("この機能を利用するにはログインが必要です");
    expect(data.errors).toEqual([data.error]);
  });

  it("returns error and errors fields on 400 when urls are missing", async () => {
    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/estimate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate/estimate", {
      method: "POST",
      body: JSON.stringify({ urls: [] }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("URLを指定してください。");
    expect(data.errors).toEqual([data.error]);
  });

  it("returns error and errors when compliance blocks all urls", async () => {
    const { filterAllowedPublicSourceUrls } = await import("@/lib/company-info/source-compliance");
    const blockedResult = {
      url: "https://private.example/",
      status: "blocked" as const,
      reasons: ["社内URLは取得できません"],
      robotsStatus: "allowed" as const,
      termsStatus: "unknown" as const,
      checkedAt: "2026-04-26T00:00:00.000Z",
      policyVersion: "test",
    };
    vi.mocked(filterAllowedPublicSourceUrls).mockResolvedValueOnce({
      allowedUrls: [],
      results: [blockedResult],
      warningResults: [],
      blockedResults: [blockedResult],
    });

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/estimate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate/estimate", {
      method: "POST",
      body: JSON.stringify({ urls: ["https://private.example/"] }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("社内URLは取得できません");
    expect(data.errors).toEqual([data.error]);
  });
});
