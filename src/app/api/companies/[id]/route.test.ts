import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getCompanyDetailPageDataMock,
  hasOwnedCompanyMock,
  dbSelectMock,
  dbUpdateMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getCompanyDetailPageDataMock: vi.fn(),
  hasOwnedCompanyMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/bff/identity/owner-access", () => ({
  buildOwnedRowCondition: vi.fn(() => ({ owner: "condition" })),
  hasOwnedCompany: hasOwnedCompanyMock,
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getCompanyDetailPageData: getCompanyDetailPageDataMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
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

function makeUpdateChain(result: unknown[] = [
  {
    id: "c1",
    userId: "user-1",
    guestId: null,
    name: "Acme",
    mypagePassword: null,
    mypageLoginId: null,
  },
]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeDeleteChain() {
  return {
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "c1" }]),
    }),
  };
}

describe("api/companies/[id]", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    getCompanyDetailPageDataMock.mockReset();
    hasOwnedCompanyMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbDeleteMock.mockReset();
  });

  it("returns 401 when the request has no valid identity", async () => {
    const { GET } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue(null);

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

  it("PUT returns 401 without identity", async () => {
    const { PUT } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/companies/c1", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "c1" }) });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("COMPANY_UPDATE_AUTH_REQUIRED");
  });

  it("PUT returns 404 when company not owned or missing", async () => {
    const { PUT } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    hasOwnedCompanyMock.mockResolvedValue(false);

    const req = new NextRequest("http://localhost:3000/api/companies/c1", {
      method: "PUT",
      body: JSON.stringify({ name: "Acme" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "c1" }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("COMPANY_UPDATE_NOT_FOUND");
  });

  it("PUT returns 200 and updated company when owned", async () => {
    const { PUT } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    hasOwnedCompanyMock.mockResolvedValue(true);
    dbUpdateMock.mockReturnValue(makeUpdateChain([
      {
        id: "c1",
        userId: "user-1",
        guestId: null,
        name: "Acme",
        mypagePassword: "encrypted",
        mypageLoginId: "student@example.com",
      },
    ]));

    const req = new NextRequest("http://localhost:3000/api/companies/c1", {
      method: "PUT",
      body: JSON.stringify({ name: "Acme" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "c1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.company?.name).toBe("Acme");
    expect(data.company?.hasCredentials).toBe(true);
    expect(data.company?.mypageLoginId).toBeUndefined();
    expect(data.company?.mypagePassword).toBeUndefined();
  });

  it("PUT rejects unsafe company URLs before update", async () => {
    const { PUT } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    hasOwnedCompanyMock.mockResolvedValue(true);

    const req = new NextRequest("http://localhost:3000/api/companies/c1", {
      method: "PUT",
      body: JSON.stringify({ mypageUrl: "https://user:pass@example.com/login" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "c1" }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("COMPANY_MYPAGE_URL_INVALID");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("DELETE returns 401 without identity", async () => {
    const { DELETE } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue(null);

    const res = await DELETE(new NextRequest("http://localhost:3000/api/companies/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.code).toBe("COMPANY_DELETE_AUTH_REQUIRED");
  });

  it("DELETE returns 404 when not owned", async () => {
    const { DELETE } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "u1", guestId: null });
    hasOwnedCompanyMock.mockResolvedValue(false);

    const res = await DELETE(new NextRequest("http://localhost:3000/api/companies/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("COMPANY_DELETE_NOT_FOUND");
  });

  it("DELETE returns 200 when owned", async () => {
    const { DELETE } = await import("@/app/api/companies/[id]/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "u1", guestId: null });
    hasOwnedCompanyMock.mockResolvedValue(true);
    dbDeleteMock.mockReturnValue(makeDeleteChain());

    const res = await DELETE(new NextRequest("http://localhost:3000/api/companies/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("Company deleted successfully");
  });
});
