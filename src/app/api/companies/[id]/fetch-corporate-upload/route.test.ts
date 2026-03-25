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

vi.mock("@/lib/company-info/sources", () => ({
  inferTrustedForEsReview: vi.fn(() => true),
  parseCorporateInfoSources: vi.fn(() => []),
  serializeCorporateInfoSources: vi.fn(() => "[]"),
  upsertCorporateInfoSource: vi.fn((sources: unknown[]) => sources),
}));

vi.mock("@/lib/company-info/usage", () => ({
  applyCompanyRagUsage: vi.fn(),
  getRemainingCompanyRagFreeUnits: vi.fn(),
}));

vi.mock("@/lib/company-info/pricing", () => ({
  getCompanyRagSourceLimit: vi.fn(() => 5),
  normalizePdfPageCount: vi.fn(() => 1),
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  CORPORATE_MUTATE_RATE_LAYERS: [],
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

describe("api/companies/[id]/fetch-corporate-upload", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    enforceRateLimitLayersMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery())
      .mockReturnValueOnce(makeCompanyQuery());
    enforceRateLimitLayersMock.mockResolvedValue(null);
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
});
