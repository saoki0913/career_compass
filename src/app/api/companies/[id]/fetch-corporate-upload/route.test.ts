import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  dbUpdateMock,
  enforceRateLimitLayersMock,
  fetchFastApiInternalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
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
  inferTrustedForEsReview: vi.fn(() => true),
  parseCorporateInfoSources: vi.fn(() => []),
  serializeCorporateInfoSources: vi.fn(() => "[]"),
  upsertCorporateInfoSource: vi.fn((sources: unknown[]) => sources),
}));

vi.mock("@/lib/company-info/usage", () => ({
  applyCompanyRagUsage: vi.fn(),
  getRemainingCompanyRagPdfFreeUnits: vi.fn(async () => 40),
}));

vi.mock("@/lib/company-info/pricing", () => ({
  getCompanyRagSourceLimit: vi.fn(() => 5),
  normalizePdfPageCount: vi.fn(() => 1),
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

function makeProfileQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ plan: "free" }]),
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

function makeUpdateQuery() {
  return {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

describe("api/companies/[id]/fetch-corporate-upload", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    fetchFastApiInternalMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery())
      .mockReturnValueOnce(makeCompanyQuery());
    dbUpdateMock.mockReturnValue(makeUpdateQuery());
    enforceRateLimitLayersMock.mockResolvedValue(null);
    fetchFastApiInternalMock.mockImplementation((path: string, init?: RequestInit) =>
      fetch(`https://fastapi.test${path}`, init)
    );
  });

  it("returns 429 without uploading files when rate limited", async () => {
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

    const formData = new FormData();
    formData.append("file", new File(["pdf"], "company.pdf", { type: "application/pdf" }));

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate-upload/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards contentType to the backend upload request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          company_id: "company-1",
          source_url: "upload://corporate-pdf/company-1/test",
          chunks_stored: 3,
          extracted_chars: 1200,
          page_count: 4,
          content_type: "ir_materials",
          secondary_content_types: [],
          extraction_method: "ocr",
          errors: [],
          source_total_pages: 4,
          ingest_truncated: false,
          ocr_truncated: false,
          processing_notice_ja: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const applyCompanyRagUsage = await import("@/lib/company-info/usage");
    vi.mocked(applyCompanyRagUsage.applyCompanyRagUsage).mockResolvedValue({
      freeUnitsApplied: 4,
      overflowUnits: 0,
      creditsDisplayed: 1,
      creditsActuallyDeducted: 1,
      remainingFreeUnits: 6,
    });
    vi.mocked(applyCompanyRagUsage.getRemainingCompanyRagPdfFreeUnits).mockResolvedValue(6);

    const companyInfoSources = await import("@/lib/company-info/sources");
    vi.mocked(companyInfoSources.upsertCorporateInfoSource).mockImplementation((sources) => sources);

    const formData = new FormData();
    formData.append("file", new File(["pdf"], "company.pdf", { type: "application/pdf" }));
    formData.append("contentType", "ir_materials");

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate-upload/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, fetchInit] = fetchSpy.mock.calls[0];
    const backendForm = fetchInit?.body as FormData;
    expect(backendForm.get("content_type")).toBe("ir_materials");
    expect(backendForm.get("billing_plan")).toBe("free");
  });

  it("estimates via the dedicated pdf endpoint and forwards billing_plan", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          company_id: "company-1",
          source_url: "upload://corporate-pdf/company-1/test",
          page_count: 4,
          source_total_pages: 4,
          estimated_free_pdf_pages: 4,
          estimated_credits: 0,
          estimated_google_ocr_pages: 0,
          estimated_mistral_ocr_pages: 0,
          will_truncate: false,
          requires_confirmation: false,
          processing_notice_ja: "summary",
          page_routing_summary: {
            total_pages: 4,
            ingest_pages: 4,
            local_pages: 4,
            google_ocr_pages: 0,
            mistral_ocr_pages: 0,
            truncated_pages: 0,
            planned_route: ["local"],
            actual_route: ["local"],
          },
          errors: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const formData = new FormData();
    formData.append("file", new File(["pdf"], "company.pdf", { type: "application/pdf" }));
    formData.append("contentType", "ir_materials");

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate-upload/estimate/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-corporate-upload/estimate", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, backendInit] = fetchSpy.mock.calls[0];
    const backendForm = backendInit?.body as FormData;
    expect(backendForm.get("billing_plan")).toBe("free");
    expect(backendForm.get("remaining_free_pdf_pages")).toBe("6");
    expect(backendForm.get("source_url")).toContain("upload://corporate-pdf/company-1/");
  });

  it("rejects multipart bodies whose aggregate Content-Length exceeds the cap with 413 (D-2 象限②)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const formData = new FormData();
    formData.append("file", new File(["pdf"], "company.pdf", { type: "application/pdf" }));

    const { POST } = await import("@/app/api/companies/[id]/fetch-corporate-upload/route");
    const request = new NextRequest(
      "http://localhost:3000/api/companies/company-1/fetch-corporate-upload",
      {
        method: "POST",
        body: formData,
        headers: {
          // Claim 60 MiB — above the 50 MiB aggregate cap.
          "content-length": String(60 * 1024 * 1024),
        },
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
