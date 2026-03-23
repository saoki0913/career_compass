import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getDocumentDetailPageDataMock,
  authGetSessionMock,
  dbSelectMock,
  getGuestUserMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getDocumentDetailPageDataMock: vi.fn(),
  authGetSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getGuestUserMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/server/app-loaders", () => ({
  getDocumentDetailPageData: getDocumentDetailPageDataMock,
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

function makeDocumentQuery(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("api/documents/[id]", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    getDocumentDetailPageDataMock.mockReset();
    authGetSessionMock.mockReset();
    dbSelectMock.mockReset();
    getGuestUserMock.mockReset();
  });

  it("returns 401 when the request has no valid identity", async () => {
    const { GET } = await import("@/app/api/documents/[id]/route");
    getRequestIdentityMock.mockResolvedValue(null);
    authGetSessionMock.mockResolvedValue(null);
    getGuestUserMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost:3000/api/documents/doc-1"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("DOCUMENT_DETAIL_AUTH_REQUIRED");
  });

  it("includes server timing headers on successful detail fetches", async () => {
    const { GET } = await import("@/app/api/documents/[id]/route");
    const document = {
      id: "doc-1",
      userId: "user-1",
      guestId: null,
      companyId: null,
      applicationId: null,
      title: "Alpha ES",
      content: [],
      status: "draft",
    };

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    getDocumentDetailPageDataMock.mockResolvedValue({
      document,
    });
    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValueOnce(makeDocumentQuery([document]));

    const response = await GET(new NextRequest("http://localhost:3000/api/documents/doc-1"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.document.id).toBe("doc-1");
    expect(response.headers.get("server-timing")).toContain("identity;");
    expect(response.headers.get("server-timing")).toContain("db;");
  });
});
