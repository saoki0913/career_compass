import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { roleOptionsResponseSchema } from "@/shared/contracts/interview/role-options";

const { getRequestIdentityMock, dbSelectMock } = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

/** company select chain: .from().where().limit() */
function makeLimitQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

/** application roles select chain: .from().where().orderBy() */
function makeOrderByQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("api/companies/[id]/es-role-options", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    dbSelectMock.mockReset();
  });

  it("returns 401 when the request has no valid identity", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/es-role-options"),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("returns 404 when the company is owned by another principal", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(
      makeLimitQuery([
        {
          id: "company-1",
          name: "Other Corp",
          industry: "銀行",
          userId: "user-2",
          guestId: null,
        },
      ]),
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/es-role-options"),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Company not found");
  });

  it("returns 404 when the company does not exist", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(makeLimitQuery([]));

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/missing/es-role-options"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Company not found");
  });

  it("returns industry-specific groups with isFallback=false when industry resolves", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(
      makeLimitQuery([
        {
          id: "company-1",
          name: "三菱UFJ銀行",
          industry: "銀行",
          userId: "user-1",
          guestId: null,
        },
      ]),
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/es-role-options"),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.industry).toBe("銀行");
    expect(data.isFallback).toBe(false);
    expect(data.fallbackReason).toBeNull();
    expect(data.roleGroups.length).toBeGreaterThan(0);
    expect(data.requiresIndustrySelection).toBe(false);
  });

  it("returns a non-empty generic fallback set with isFallback=true when industry is unset", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(
      makeLimitQuery([
        {
          id: "company-1",
          name: "未知の企業",
          industry: null,
          userId: "user-1",
          guestId: null,
        },
      ]),
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/es-role-options"),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.industry).toBeNull();
    expect(data.isFallback).toBe(true);
    expect(data.fallbackReason).toBe("industry_unresolved");
    expect(data.roleGroups.length).toBeGreaterThan(0);
    expect(data.requiresIndustrySelection).toBe(true);

    const candidates = data.roleGroups.flatMap(
      (group: { options: { value: string }[] }) => group.options.map((option) => option.value),
    );
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("merges document and application roles when documentId is provided", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock
      .mockReturnValueOnce(
        makeLimitQuery([
          {
            id: "company-1",
            name: "三菱UFJ銀行",
            industry: "銀行",
            userId: "user-1",
            guestId: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        makeLimitQuery([
          {
            id: "doc-1",
            companyId: "company-1",
            jobTypeId: "jt-1",
            applicationId: "app-1",
          },
        ]),
      )
      .mockReturnValueOnce(makeLimitQuery([{ name: "ESに紐づく職種" }]))
      .mockReturnValueOnce(makeOrderByQuery([{ name: "応募職種A" }, { name: "応募職種B" }]));

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/companies/company-1/es-role-options?documentId=doc-1",
      ),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const documentGroup = data.roleGroups.find(
      (group: { id: string }) => group.id === "document",
    );
    const applicationGroup = data.roleGroups.find(
      (group: { id: string }) => group.id === "application",
    );
    expect(documentGroup?.options.map((option: { value: string }) => option.value)).toContain(
      "ESに紐づく職種",
    );
    expect(
      applicationGroup?.options.map((option: { value: string }) => option.value),
    ).toEqual(["応募職種A", "応募職種B"]);
  });

  it("returns a payload that conforms to roleOptionsResponseSchema", async () => {
    const { GET } = await import("@/app/api/companies/[id]/es-role-options/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    dbSelectMock.mockReturnValueOnce(
      makeLimitQuery([
        {
          id: "company-1",
          name: "未知の企業",
          industry: null,
          userId: "user-1",
          guestId: null,
        },
      ]),
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/companies/company-1/es-role-options"),
      { params: Promise.resolve({ id: "company-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(roleOptionsResponseSchema.safeParse(data).success).toBe(true);
  });
});
