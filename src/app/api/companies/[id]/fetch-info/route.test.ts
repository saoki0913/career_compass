import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  enforceRateLimitLayersMock,
  getRemainingFreeFetchesMock,
  validatePublicUrlMock,
  checkPublicSourceComplianceMock,
  fetchFastApiInternalMock,
  companyFetchPrecheckMock,
  companyFetchReserveMock,
  companyFetchConfirmInTxMock,
  companyFetchCancelMock,
  saveExtractedDeadlinesMock,
  dbUpdateMock,
  dbTransactionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  enforceRateLimitLayersMock: vi.fn(),
  getRemainingFreeFetchesMock: vi.fn(),
  validatePublicUrlMock: vi.fn(),
  checkPublicSourceComplianceMock: vi.fn(),
  fetchFastApiInternalMock: vi.fn(),
  companyFetchPrecheckMock: vi.fn(),
  companyFetchReserveMock: vi.fn(),
  companyFetchConfirmInTxMock: vi.fn(),
  companyFetchCancelMock: vi.fn(),
  saveExtractedDeadlinesMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbTransactionMock: vi.fn(),
}));

const fakeTx = { __tx: "fetch-info" } as never;

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
    insert: vi.fn(),
    transaction: dbTransactionMock,
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

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
  fetchFastApiWithPrincipal: (path: string, init?: RequestInit & { principal?: unknown }) => {
    const { principal: _principal, ...rest } = (init || {}) as RequestInit & { principal?: unknown };
    void _principal;
    return fetchFastApiInternalMock(path, rest);
  },
}));

vi.mock("@/bff/billing/company-fetch-policy", () => ({
  companyFetchPolicy: {
    precheck: companyFetchPrecheckMock,
    reserve: companyFetchReserveMock,
    confirmInTx: companyFetchConfirmInTxMock,
    cancel: companyFetchCancelMock,
  },
}));

vi.mock("@/lib/company-info/deadline-persistence", () => ({
  saveExtractedDeadlines: saveExtractedDeadlinesMock,
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
    fetchFastApiInternalMock.mockReset();
    companyFetchPrecheckMock.mockReset();
    companyFetchReserveMock.mockReset();
    companyFetchConfirmInTxMock.mockReset();
    companyFetchCancelMock.mockReset();
    saveExtractedDeadlinesMock.mockReset();
    dbUpdateMock.mockReset();
    dbTransactionMock.mockReset();
    vi.restoreAllMocks();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock
      .mockReturnValueOnce(makeProfileQuery("free"))
      .mockReturnValueOnce(makeCompanyQuery())
      .mockImplementation(() => makeCompanyQuery());
    enforceRateLimitLayersMock.mockResolvedValue(null);
    getRemainingFreeFetchesMock.mockResolvedValue(1);
    companyFetchPrecheckMock.mockResolvedValue({
      ok: true,
      freeQuotaAvailable: false,
    });
    companyFetchReserveMock.mockResolvedValue({ reservationId: "reservation-1" });
    companyFetchConfirmInTxMock.mockResolvedValue(undefined);
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx));
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
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
      reasons: [
        "取得前にページ内容の確認が必要です。ページを開いて、公開情報として利用できることを確認してください。",
      ],
      robotsStatus: "error",
      termsStatus: "unknown",
      checkedAt: "2026-03-22T00:00:00.000Z",
      policyVersion: "test",
    });
    fetchFastApiInternalMock.mockResolvedValueOnce(new Response("backend unavailable", { status: 503 }));

    const { POST } = await import("@/app/api/companies/[id]/fetch-info/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-info", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/recruit",
        confirmedWarningUrls: ["https://example.com/recruit"],
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

  it("does not consume credits or free quota when all extracted deadlines are duplicates", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      source_url: "https://example.com/recruit",
      extracted_at: "2026-05-04T00:00:00.000Z",
      data: {
        deadlines: [
          {
            title: "ES提出",
            dueDate: "2026-06-01",
            type: "es_submission",
            sourceUrl: "https://example.com/recruit",
            confidence: "high",
          },
        ],
        required_documents: [],
        application_method: null,
        selection_process: null,
      },
    }), { status: 200 }));
    saveExtractedDeadlinesMock.mockResolvedValueOnce({
      savedDeadlines: [],
      skippedDuplicates: ["deadline-1"],
      savedDeadlineSummaries: [],
    });

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

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.resultStatus).toBe("duplicates_only");
    expect(data.creditsConsumed).toBe(0);
    expect(data.actualCreditsDeducted).toBe(0);
    expect(data.freeUsed).toBe(false);
    expect(companyFetchConfirmInTxMock).not.toHaveBeenCalled();
    expect(companyFetchCancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      "reservation-1",
      "duplicates_only",
    );
  });

  it("confirms the paid reservation via confirmInTx inside a db.transaction on success", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      source_url: "https://example.com/recruit",
      extracted_at: "2026-05-04T00:00:00.000Z",
      data: {
        deadlines: [
          {
            title: "ES提出",
            dueDate: "2026-06-01",
            type: "es_submission",
            sourceUrl: "https://example.com/recruit",
            confidence: "high",
          },
        ],
        required_documents: [],
        application_method: null,
        selection_process: null,
      },
    }), { status: 200 }));
    saveExtractedDeadlinesMock.mockResolvedValueOnce({
      savedDeadlines: ["deadline-1"],
      skippedDuplicates: [],
      savedDeadlineSummaries: [{ id: "deadline-1", title: "ES提出" }],
    });

    const { POST } = await import("@/app/api/companies/[id]/fetch-info/route");
    const request = new NextRequest("http://localhost:3000/api/companies/company-1/fetch-info", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/recruit" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: Promise.resolve({ id: "company-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.creditsConsumed).toBe(1);
    // confirm runs inside the route's own db.transaction (standalone confirm retired).
    expect(dbTransactionMock).toHaveBeenCalled();
    expect(companyFetchConfirmInTxMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ userId: "user-1" }),
      expect.objectContaining({ kind: "billable_success", creditsConsumed: 1, freeQuotaUsed: false }),
      "reservation-1",
    );
    expect(companyFetchCancelMock).not.toHaveBeenCalled();
  });

  it("does not expose FastAPI raw error text in browser-facing responses", async () => {
    fetchFastApiInternalMock.mockResolvedValueOnce(new Response(JSON.stringify({
      detail: {
        error_type: "provider_error",
        error: "upstream secret stack trace with token=abc123",
      },
    }), { status: 503 }));

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

    expect(response.status).toBe(503);
    expect(data.error.userMessage).toBe("情報の取得に失敗しました。");
    expect(JSON.stringify(data)).not.toContain("upstream secret stack trace");
    expect(JSON.stringify(data)).not.toContain("abc123");
  });
});
