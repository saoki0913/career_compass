import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  getOwnedCompanyRecordMock,
  decryptMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  getOwnedCompanyRecordMock: vi.fn(),
  decryptMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/bff/identity/owner-access", () => ({
  getOwnedCompanyRecord: getOwnedCompanyRecordMock,
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: decryptMock,
}));

describe("api/companies/[id]/credentials", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    getOwnedCompanyRecordMock.mockReset();
    decryptMock.mockReset();
  });

  it("uses structured errors for unauthenticated requests", async () => {
    const { GET } = await import("@/app/api/companies/[id]/credentials/route");
    getRequestIdentityMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost:3000/api/companies/c1/credentials"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("COMPANY_CREDENTIALS_AUTH_REQUIRED");
    expect(data.requestId).toBeTruthy();
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("returns credentials only from the dedicated credentials endpoint", async () => {
    const { GET } = await import("@/app/api/companies/[id]/credentials/route");
    getRequestIdentityMock.mockResolvedValue({ userId: "user-1", guestId: null });
    getOwnedCompanyRecordMock.mockResolvedValue({
      id: "c1",
      userId: "user-1",
      guestId: null,
      mypageLoginId: "student@example.com",
      mypagePassword: "encrypted-password",
    });
    decryptMock.mockReturnValue("plain-password");

    const response = await GET(new NextRequest("http://localhost:3000/api/companies/c1/credentials"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getOwnedCompanyRecordMock).toHaveBeenCalledWith("c1", {
      userId: "user-1",
      guestId: null,
    });
    expect(data).toEqual({
      mypageLoginId: "student@example.com",
      mypagePassword: "plain-password",
    });
  });
});
