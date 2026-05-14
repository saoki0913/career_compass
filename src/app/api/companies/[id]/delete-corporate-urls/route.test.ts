import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  dbUpdateMock,
  updateSetMock,
  updateWhereMock,
  parseCorporateInfoSourcesMock,
  serializeCorporateInfoSourcesMock,
  enforceRateLimitLayersMock,
  fetchFastApiWithPrincipalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  parseCorporateInfoSourcesMock: vi.fn(),
  serializeCorporateInfoSourcesMock: vi.fn((value: unknown) => JSON.stringify(value)),
  enforceRateLimitLayersMock: vi.fn(),
  fetchFastApiWithPrincipalMock: vi.fn(),
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
  parseCorporateInfoSources: parseCorporateInfoSourcesMock,
  serializeCorporateInfoSources: serializeCorporateInfoSourcesMock,
}));

vi.mock("@/lib/rate-limit-spike", () => ({
  enforceRateLimitLayers: enforceRateLimitLayersMock,
  CORPORATE_DELETE_RATE_LAYERS: [],
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiWithPrincipal: fetchFastApiWithPrincipalMock,
}));

vi.mock("@/lib/fastapi/secret-guard", () => ({
  isSecretMissingError: vi.fn(() => false),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
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
            corporateInfoUrls: JSON.stringify([
              { url: "https://example.com/a", kind: "url", status: "completed" },
              { url: "upload://company-1/manual.pdf", kind: "upload_pdf", status: "completed" },
            ]),
          },
        ]),
      })),
    })),
  };
}

function makeDeleteRequest(urls: string[]) {
  return new NextRequest("http://localhost:3000/api/companies/company-1/delete-corporate-urls", {
    method: "POST",
    body: JSON.stringify({ urls }),
    headers: { "content-type": "application/json" },
  });
}

describe("api/companies/[id]/delete-corporate-urls", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    parseCorporateInfoSourcesMock.mockReset();
    serializeCorporateInfoSourcesMock.mockClear();
    enforceRateLimitLayersMock.mockReset();
    fetchFastApiWithPrincipalMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce(makeCompanyQuery());
    dbUpdateMock.mockReturnValue({
      set: updateSetMock.mockReturnValue({
        where: updateWhereMock.mockResolvedValue(undefined),
      }),
    });
    parseCorporateInfoSourcesMock.mockReturnValue([
      { url: "https://example.com/a", kind: "url", status: "completed" },
      { url: "upload://company-1/manual.pdf", kind: "upload_pdf", status: "completed" },
    ]);
    enforceRateLimitLayersMock.mockResolvedValue(null);
    fetchFastApiWithPrincipalMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          company_id: "company-1",
          urls_deleted: ["upload://company-1/manual.pdf"],
          chunks_deleted: 3,
          errors: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });

  it("deletes RAG data through FastAPI and updates corporateInfoUrls without Storage cleanup", async () => {
    const { POST } = await import("@/app/api/companies/[id]/delete-corporate-urls/route");
    const response = await POST(makeDeleteRequest(["upload://company-1/manual.pdf"]), {
      params: Promise.resolve({ id: "company-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(fetchFastApiWithPrincipalMock).toHaveBeenCalledWith(
      "/company-info/rag/company-1/delete-by-urls",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ urls: ["upload://company-1/manual.pdf"] }),
        principal: expect.objectContaining({
          scope: "company",
          actor: { kind: "user", id: "user-1" },
          companyId: "company-1",
          plan: "free",
        }),
      }),
    );
    expect(serializeCorporateInfoSourcesMock).toHaveBeenCalledWith([
      { url: "https://example.com/a", kind: "url", status: "completed" },
    ]);
    expect(updateSetMock).toHaveBeenCalledWith({
      corporateInfoUrls: JSON.stringify([{ url: "https://example.com/a", kind: "url", status: "completed" }]),
      updatedAt: expect.any(Date),
    });
    expect(data.updatedUrls).toEqual([
      { url: "https://example.com/a", kind: "url", status: "completed" },
    ]);
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });

  it("returns 503 and does not update the company when backend deletion fails", async () => {
    fetchFastApiWithPrincipalMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "backend failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const { POST } = await import("@/app/api/companies/[id]/delete-corporate-urls/route");
    const response = await POST(makeDeleteRequest(["https://example.com/a"]), {
      params: Promise.resolve({ id: "company-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("RAGデータの削除に失敗しました。しばらく後にお試しください。");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});
