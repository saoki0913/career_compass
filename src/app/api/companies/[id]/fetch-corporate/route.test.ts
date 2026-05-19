import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type CorporateInfoSourceMock = {
  url: string;
  kind: string;
  status: string;
  contentType: string;
};

function jsonMutationHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    origin: "http://localhost:3000",
    cookie: "csrf_token=test-csrf-token",
    "x-csrf-token": "test-csrf-token",
  };
}

const {
  getSessionMock,
  dbSelectMock,
  dbUpdateMock,
  reserveCompanyRagUsageMock,
  confirmCompanyRagUsageMock,
  cancelCompanyRagUsageMock,
  parseCorporateInfoSourcesMock,
  checkPublicSourceComplianceMock,
  enforceRateLimitLayersMock,
  fetchFastApiInternalMock,
  claimCompanyRagIngestQuoteMock,
  completeCompanyRagIngestQuoteMock,
  hashCompanyRagQuoteInputMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  reserveCompanyRagUsageMock: vi.fn(),
  confirmCompanyRagUsageMock: vi.fn(),
  cancelCompanyRagUsageMock: vi.fn(),
  parseCorporateInfoSourcesMock: vi.fn((): CorporateInfoSourceMock[] => []),
  checkPublicSourceComplianceMock: vi.fn(async (url: string) => ({
    url,
    status: "allowed",
    reasons: [],
    checkedAt: "2026-03-22T00:00:00.000Z",
    policyVersion: "test",
  })),
  enforceRateLimitLayersMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  claimCompanyRagIngestQuoteMock: vi.fn(),
  completeCompanyRagIngestQuoteMock: vi.fn(),
  hashCompanyRagQuoteInputMock: vi.fn(),
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
  reserveCompanyRagUsage: reserveCompanyRagUsageMock,
  confirmCompanyRagUsage: confirmCompanyRagUsageMock,
  cancelCompanyRagUsage: cancelCompanyRagUsageMock,
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
      results: [],
      allowedUrls: urls.filter((url) => !url.includes("/mypage")),
      warningResults: [],
      blockedResults,
    };
  }),
}));

vi.mock("@/lib/company-info/rag-quotes", () => ({
  claimCompanyRagIngestQuote: claimCompanyRagIngestQuoteMock,
  completeCompanyRagIngestQuote: completeCompanyRagIngestQuoteMock,
  hashCompanyRagQuoteInput: hashCompanyRagQuoteInputMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  CORPORATE_MUTATE_RATE_LAYERS: [],
  STATUS_POLL_RATE_LAYERS: [],
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
    reserveCompanyRagUsageMock.mockReset();
    confirmCompanyRagUsageMock.mockReset();
    cancelCompanyRagUsageMock.mockReset();
    parseCorporateInfoSourcesMock.mockReset();
    checkPublicSourceComplianceMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    claimCompanyRagIngestQuoteMock.mockReset();
    completeCompanyRagIngestQuoteMock.mockReset();
    hashCompanyRagQuoteInputMock.mockReset();
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
    hashCompanyRagQuoteInputMock.mockReturnValue("quote-input-hash");
    claimCompanyRagIngestQuoteMock.mockResolvedValue({
      id: "quote-1",
      sourceResults: [
        {
          url: "https://example.com/company",
          success: true,
          kind: "url",
          billable_units: 1,
        },
      ],
    });
    completeCompanyRagIngestQuoteMock.mockResolvedValue(undefined);
    fetchFastApiInternalMock.mockImplementation((path: string, init?: RequestInit) =>
      fetch(`https://fastapi.test${path}`, init)
    );
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce(makeCompanyQuery());
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "company-1" }]),
        })),
      })),
    });
    reserveCompanyRagUsageMock.mockResolvedValue({
      usageId: "usage-1",
      reservationId: null,
      kind: "url",
      freeUnitsApplied: 0,
      overflowUnits: 0,
      creditsDisplayed: 0,
      creditsActuallyDeducted: 0,
      remainingFreeUnits: 30,
    });
  });

  it("returns sanitized 503 without saving or charging when backend reports crawl failure", async () => {
    const rawUpstreamError = "SQL failed at /internal/company-info with secret-token";
    const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: false,
          company_id: "company-1",
          pages_crawled: 0,
          chunks_stored: 0,
          errors: [rawUpstreamError],
          url_content_types: {},
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate", {
      method: "POST",
      body: JSON.stringify({
        urls: ["https://example.com/company"],
        quoteId: "quote-1",
      }),
      headers: jsonMutationHeaders(),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error.code).toBe("CORPORATE_FETCH_FAILED");
    expect(data.error.userMessage).toBe("企業情報の取得に失敗しました。");
    expect(data.error.action).toBe("時間を置いて、もう一度お試しください。");
    expect(JSON.stringify(data)).not.toContain(rawUpstreamError);
    expect(JSON.stringify(data)).not.toContain("backendErrors");
    expect(JSON.stringify(data)).not.toContain("secret-token");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, fetchInit] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(fetchInit?.body ?? "{}"));
    expect(body.billing_plan).toBe("free");
    expect(reserveCompanyRagUsageMock).toHaveBeenCalledTimes(1);
    expect(cancelCompanyRagUsageMock).toHaveBeenCalledTimes(1);
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
          source_results: [
            {
              url: "https://example.com/company",
              success: true,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    reserveCompanyRagUsageMock.mockResolvedValue({
      usageId: "usage-1",
      reservationId: null,
      kind: "url",
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
        quoteId: "quote-1",
      }),
      headers: jsonMutationHeaders(),
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
      headers: jsonMutationHeaders(),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe("PUBLIC_SOURCE_BLOCKED");
    expect(data.error.userMessage).toContain("ログインが必要なURL");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reserveCompanyRagUsageMock).not.toHaveBeenCalled();
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
                  {
                    url: "upload://company-1/manual.pdf",
                    kind: "upload_pdf",
                    status: "completed",
                    contentType: "ir_materials",
                  },
                ]),
                corporateInfoFetchedAt: null,
              },
            ]),
          })),
        })),
      });
    parseCorporateInfoSourcesMock.mockReturnValue([
      {
        url: "https://example.com/company",
        kind: "url",
        status: "completed",
        contentType: "corporate_site",
      },
      {
        url: "upload://company-1/manual.pdf",
        kind: "upload_pdf",
        status: "completed",
        contentType: "ir_materials",
      },
    ]);
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
    expect(data.corporateInfoUrls).toHaveLength(2);
    expect(data.corporateInfoUrls[1]).toMatchObject({
      url: "upload://company-1/manual.pdf",
      kind: "upload_pdf",
      status: "completed",
      contentType: "ir_materials",
    });
    expect(data.ragStatus.totalChunks).toBe(12);
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });
});
