import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  dbUpdateMock,
  applyCompanyRagUsageMock,
  parseCorporateInfoSourcesMock,
  checkPublicSourceComplianceMock,
  enforceRateLimitLayersMock,
  fetchFastApiInternalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  applyCompanyRagUsageMock: vi.fn(),
  parseCorporateInfoSourcesMock: vi.fn(() => []),
  checkPublicSourceComplianceMock: vi.fn(async (url: string) => ({
    url,
    status: "allowed",
    reasons: [],
    checkedAt: "2026-03-22T00:00:00.000Z",
    policyVersion: "test",
  })),
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
    update: dbUpdateMock,
  },
}));

vi.mock("@/lib/company-info/sources", () => ({
  detectContentTypeFromUrl: vi.fn(() => "corporate_site"),
  inferTrustedForEsReview: vi.fn(() => true),
  isUploadSource: vi.fn(() => false),
  parseCorporateInfoSources: parseCorporateInfoSourcesMock,
  serializeCorporateInfoSources: vi.fn((value: unknown) => JSON.stringify(value)),
}));

vi.mock("@/lib/company-info/usage", () => ({
  applyCompanyRagUsage: applyCompanyRagUsageMock,
  getRemainingCompanyRagHtmlFreeUnits: vi.fn(async () => 30),
  getRemainingCompanyRagPdfFreeUnits: vi.fn(async () => 12),
}));

vi.mock("@/lib/company-info/pricing", () => ({
  calculateCorporateCrawlUnits: vi.fn(() => 0),
  getCompanyRagSourceLimit: vi.fn(() => 5),
}));

vi.mock("@/lib/company-info/source-compliance", () => ({
  checkPublicSourceCompliance: checkPublicSourceComplianceMock,
  filterAllowedPublicSourceUrls: vi.fn(async (urls: string[]) => {
    const blockedResults = urls
      .filter((url) => url.includes("/mypage"))
      .map((url) => ({
        url,
        reasons: ["ログインが必要なURLは保存できません。"],
      }));

    return {
      allowedUrls: urls.filter((url) => !url.includes("/mypage")),
      blockedResults,
    };
  }),
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  CORPORATE_MUTATE_RATE_LAYERS: [],
  STATUS_POLL_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
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
            corporateInfoUrls: null,
          },
        ]),
      })),
    })),
  };
}

describe("api/companies/[id]/fetch-corporate", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    applyCompanyRagUsageMock.mockReset();
    parseCorporateInfoSourcesMock.mockReset();
    checkPublicSourceComplianceMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    parseCorporateInfoSourcesMock.mockReturnValue([]);
    checkPublicSourceComplianceMock.mockImplementation(async (url: string) => ({
      url,
      status: "allowed",
      reasons: [],
      checkedAt: "2026-03-22T00:00:00.000Z",
      policyVersion: "test",
    }));
    enforceRateLimitLayersMock.mockResolvedValue(null);
    fetchFastApiInternalMock.mockImplementation((path: string, init?: RequestInit) =>
      fetch(`https://fastapi.test${path}`, init)
    );
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce(makeCompanyQuery());
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    });
    applyCompanyRagUsageMock.mockResolvedValue({
      freeUnitsApplied: 0,
      overflowUnits: 0,
      creditsDisplayed: 0,
      creditsActuallyDeducted: 0,
      remainingFreeUnits: 30,
    });
  });

  it("returns 503 without saving or charging when backend reports crawl failure", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: false,
          company_id: "company-1",
          pages_crawled: 0,
          chunks_stored: 0,
          errors: ["埋め込み基盤が利用できません。"],
          url_content_types: {},
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate", {
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

    expect(response.status).toBe(503);
    expect(data.error.code).toBe("CORPORATE_FETCH_FAILED");
    expect(data.error.userMessage).toBe("企業情報の取得に失敗しました。");
    expect(data.error.action).toBe("時間を置いて、もう一度お試しください。");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, fetchInit] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(fetchInit?.body ?? "{}"));
    expect(body.billing_plan).toBe("free");
    expect(applyCompanyRagUsageMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("sends billing_plan to the backend crawl request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          company_id: "company-1",
          pages_crawled: 1,
          chunks_stored: 1,
          errors: [],
          url_content_types: {
            "https://example.com/company": "corporate_site",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    applyCompanyRagUsageMock.mockResolvedValue({
      freeUnitsApplied: 1,
      overflowUnits: 0,
      creditsDisplayed: 0,
      creditsActuallyDeducted: 0,
      remainingFreeUnits: 29,
    });

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate", {
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
    expect(data.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, backendInit] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(backendInit?.body ?? "{}"));
    expect(body.billing_plan).toBe("free");
    expect(body.urls).toEqual(["https://example.com/company"]);
  });

  it("returns 400 without calling backend when compliance check blocks the url", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate", {
      method: "POST",
      body: JSON.stringify({
        urls: ["https://example.com/mypage"],
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
    expect(applyCompanyRagUsageMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("returns status for saved corporate urls without throwing", async () => {
    dbSelectMock.mockReset();
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "company-1",
                userId: "user-1",
                name: "テスト株式会社",
                corporateInfoUrls: JSON.stringify([
                  {
                    url: "https://example.com/company",
                    kind: "url",
                    status: "completed",
                    contentType: "corporate_site",
                  },
                ]),
                corporateInfoFetchedAt: null,
              },
            ]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      });
    parseCorporateInfoSourcesMock.mockReturnValue([
      {
        url: "https://example.com/company",
        kind: "url",
        status: "completed",
        contentType: "corporate_site",
      },
    ] as any);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            has_rag: true,
            total_chunks: 12,
            corporate_site_chunks: 12,
            last_updated: "2026-03-22T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    const { GET } = await import("@/app/api/companies/[id]/fetch-corporate/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate"),
      { params: Promise.resolve({ id: "company-1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.corporateInfoUrls).toHaveLength(1);
    expect(data.ragStatus.totalChunks).toBe(12);
  });
});
