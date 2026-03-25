import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getCompanyDetailPageDataMock,
  authGetSessionMock,
  dbSelectMock,
  getGuestUserMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getCompanyDetailPageDataMock: vi.fn(),
  authGetSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getGuestUserMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getCompanyDetailPageData: getCompanyDetailPageDataMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: authGetSessionMock,
    },
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: getGuestUserMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

function makeCompanyQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function makeDeadlinesQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

describe("api/companies/[id]", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    getCompanyDetailPageDataMock.mockReset();
    authGetSessionMock.mockReset();
    dbSelectMock.mockReset();
    getGuestUserMock.mockReset();
  });

  it("returns 401 when the request has no valid identity", async () => {
    const { GET } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue(null);
    authGetSessionMock.mockResolvedValue(null);
    getGuestUserMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost:3000/api/companies/company-1"), {
      params: Promise.resolve({ id: "company-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("COMPANY_DETAIL_AUTH_REQUIRED");
  });

  it("includes server timing headers on successful detail fetches", async () => {
    const { GET } = await import("@/app/api/companies/[id]/route");
    const company = {
      id: "company-1",
      userId: "user-1",
      guestId: null,
      name: "Alpha",
      status: "inbox",
    };

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    getCompanyDetailPageDataMock.mockResolvedValue({
      company,
      deadlines: [],
    });
    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock
      .mockReturnValueOnce(makeCompanyQuery([company]))
      .mockReturnValueOnce(makeDeadlinesQuery([]));

    const response = await GET(new NextRequest("http://localhost:3000/api/companies/company-1"), {
      params: Promise.resolve({ id: "company-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.company.id).toBe("company-1");
    expect(response.headers.get("server-timing")).toContain("identity;");
    expect(response.headers.get("server-timing")).toContain("db;");
  });
});
