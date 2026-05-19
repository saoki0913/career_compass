import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbMock,
  getRequestIdentityMock,
  enforceRateLimitLayersMock,
  fetchFastApiWithPrincipalMock,
  getViewerPlanMock,
} = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
  },
  getRequestIdentityMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  fetchFastApiWithPrincipalMock: vi.fn(),
  getViewerPlanMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));
vi.mock("@/lib/rate-limit-spike", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit-spike")>(
    "@/lib/rate-limit-spike"
  );
  return {
    ...actual,
    enforceRateLimitLayers: enforceRateLimitLayersMock,
  };
});
vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiWithPrincipal: fetchFastApiWithPrincipalMock,
}));
vi.mock("@/lib/server/loader-helpers", () => ({
  getViewerPlan: getViewerPlanMock,
}));

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn((_keyParts: Array<string | number>, fetcher: () => Promise<unknown>) => fetcher()),
}));

type CompanyRow = {
  id: string;
  userId: string | null;
  guestId: string | null;
  infoFetchedAt: Date | null;
  corporateInfoFetchedAt: Date | null;
};

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/companies/company-1/es-review-status", {
    headers: { "x-request-id": "req-status-test" },
  });
}

function mockCompany(company: CompanyRow | null) {
  const builder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(company ? [company] : []),
  };
  dbMock.select.mockReturnValue(builder);
  return builder;
}

async function callRoute() {
  const { GET } = await import("./route");
  return GET(makeRequest(), { params: Promise.resolve({ id: "company-1" }) });
}

describe("api/companies/[id]/es-review-status", () => {
  const fetchedAt = new Date("2026-05-10T00:00:00.000Z");

  beforeEach(() => {
    dbMock.select.mockReset();
    getRequestIdentityMock.mockReset().mockResolvedValue({ userId: "user-1", guestId: null });
    enforceRateLimitLayersMock.mockReset().mockResolvedValue(null);
    fetchFastApiWithPrincipalMock.mockReset().mockResolvedValue(Response.json({
      status: "ready",
      ready_for_es_review: true,
    }));
    getViewerPlanMock.mockReset().mockResolvedValue("free");
    mockCompany({
      id: "company-1",
      userId: "user-1",
      guestId: null,
      infoFetchedAt: fetchedAt,
      corporateInfoFetchedAt: null,
    });
  });

  it("returns structured auth error without identity", async () => {
    getRequestIdentityMock.mockResolvedValueOnce(null);

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Request-Id")).toBe("req-status-test");
    expect(body.error.code).toBe("ES_REVIEW_STATUS_AUTH_REQUIRED");
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("returns rate limit response before loading the company", async () => {
    enforceRateLimitLayersMock.mockResolvedValueOnce(new Response("limited", { status: 429 }));

    const response = await callRoute();

    expect(response.status).toBe(429);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("returns structured not found and forbidden errors", async () => {
    mockCompany(null);
    const notFound = await callRoute();
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error.code).toBe("ES_REVIEW_STATUS_COMPANY_NOT_FOUND");

    mockCompany({
      id: "company-1",
      userId: "other-user",
      guestId: null,
      infoFetchedAt: fetchedAt,
      corporateInfoFetchedAt: null,
    });
    const forbidden = await callRoute();
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe("ES_REVIEW_STATUS_FORBIDDEN");
  });

  it("returns not-fetched status without calling FastAPI", async () => {
    mockCompany({
      id: "company-1",
      userId: "user-1",
      guestId: null,
      infoFetchedAt: null,
      corporateInfoFetchedAt: null,
    });

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "company_selected_not_fetched",
      ready_for_es_review: false,
      reason: "not_fetched",
    });
    expect(fetchFastApiWithPrincipalMock).not.toHaveBeenCalled();
  });

  it("passes through a ready backend response with a user principal", async () => {
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ready",
      ready_for_es_review: true,
    });
    expect(fetchFastApiWithPrincipalMock).toHaveBeenCalledWith(
      "/api/es/company-status/company-1",
      expect.objectContaining({
        principal: {
          scope: "company",
          actor: { kind: "user", id: "user-1" },
          companyId: "company-1",
          plan: "free",
        },
      })
    );
  });

  it("uses a guest principal for guest-owned companies", async () => {
    getRequestIdentityMock.mockResolvedValueOnce({ userId: null, guestId: "guest-1" });
    getViewerPlanMock.mockResolvedValueOnce("guest");
    mockCompany({
      id: "company-1",
      userId: null,
      guestId: "guest-1",
      infoFetchedAt: fetchedAt,
      corporateInfoFetchedAt: null,
    });

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(fetchFastApiWithPrincipalMock).toHaveBeenCalledWith(
      "/api/es/company-status/company-1",
      expect.objectContaining({
        principal: expect.objectContaining({
          actor: { kind: "guest", id: "guest-1" },
          plan: "guest",
        }),
      })
    );
  });

  it("returns the existing degraded status when FastAPI responds non-OK", async () => {
    fetchFastApiWithPrincipalMock.mockResolvedValueOnce(Response.json(
      { detail: { error_type: "tenant_key_not_configured" } },
      { status: 503 }
    ));

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "company_fetched_but_not_ready",
      ready_for_es_review: false,
      reason: "backend_unavailable",
      last_updated: fetchedAt.toISOString(),
    });
  });

  it("returns structured 503 when FastAPI principal configuration is missing", async () => {
    fetchFastApiWithPrincipalMock.mockRejectedValueOnce(
      new Error("CAREER_PRINCIPAL_HMAC_SECRET is not configured")
    );

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBe("req-status-test");
    expect(body.error.code).toBe("ES_REVIEW_STATUS_AI_AUTH_NOT_CONFIGURED");
    expect(body.requestId).toBe("req-status-test");
  });

  it("returns structured 503 when FastAPI fetch fails before a response exists", async () => {
    fetchFastApiWithPrincipalMock.mockRejectedValueOnce(new Error("fetch failed"));

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBe("req-status-test");
    expect(body.error.code).toBe("ES_REVIEW_STATUS_BACKEND_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
  });
});
