import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getCompaniesPageDataMock,
  dbSelectMock,
  dbInsertMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getCompaniesPageDataMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getCompaniesPageData: getCompaniesPageDataMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
  },
}));

function makeSelectLimitResult(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

function makeSelectWhereResult(result: unknown) {
  return {
    from: vi.fn(() => makeThenableQuery(result)),
  };
}

describe("api/companies", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestIdentityMock.mockReset();
    getCompaniesPageDataMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
  });

  it("returns 401 when no request identity is available", async () => {
    const { GET } = await import("@/app/api/companies/route");
    const request = new NextRequest("http://localhost:3000/api/companies");
    getRequestIdentityMock.mockResolvedValue(null);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(getRequestIdentityMock).toHaveBeenCalledWith(request);
    expect(data.error.code).toBe("COMPANIES_AUTH_REQUIRED");
  });

  it("creates a company for an authenticated user resolved via shared request identity", async () => {
    const { POST } = await import("@/app/api/companies/route");
    const request = new NextRequest("http://localhost:3000/api/companies", {
      method: "POST",
      body: JSON.stringify({
        name: "テスト会社",
        industry: "IT・通信",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock
      .mockReturnValueOnce(makeSelectLimitResult([{ userId: "user-1", plan: "free" }]))
      .mockReturnValueOnce(makeSelectWhereResult([]));
    dbInsertMock.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getRequestIdentityMock).toHaveBeenCalledWith(request);
    expect(data.company.name).toBe("テスト会社");
    expect(data.company.userId).toBe("user-1");
  });
});
