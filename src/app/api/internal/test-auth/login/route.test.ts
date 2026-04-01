import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  isCiE2EAuthEnabledMock,
  getBetterAuthSessionCookieNameMock,
  getBetterAuthSessionCookieAttributesMock,
  serializeSignedCookieMock,
  transactionMock,
  txSelectMock,
  txInsertMock,
  txUpdateMock,
  txDeleteMock,
} = vi.hoisted(() => ({
  isCiE2EAuthEnabledMock: vi.fn(),
  getBetterAuthSessionCookieNameMock: vi.fn(),
  getBetterAuthSessionCookieAttributesMock: vi.fn(),
  serializeSignedCookieMock: vi.fn(),
  transactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txInsertMock: vi.fn(),
  txUpdateMock: vi.fn(),
  txDeleteMock: vi.fn(),
}));

vi.mock("@/lib/auth/ci-e2e", () => ({
  isCiE2EAuthEnabled: isCiE2EAuthEnabledMock,
  getBetterAuthSessionCookieName: getBetterAuthSessionCookieNameMock,
  getBetterAuthSessionCookieAttributes: getBetterAuthSessionCookieAttributesMock,
}));

vi.mock("better-call", () => ({
  serializeSignedCookie: serializeSignedCookieMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

function makeSelectResult(result: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("api/internal/test-auth/login", () => {
  beforeEach(() => {
    vi.resetModules();
    isCiE2EAuthEnabledMock.mockReset();
    getBetterAuthSessionCookieNameMock.mockReset();
    getBetterAuthSessionCookieAttributesMock.mockReset();
    serializeSignedCookieMock.mockReset();
    transactionMock.mockReset();
    txSelectMock.mockReset();
    txInsertMock.mockReset();
    txUpdateMock.mockReset();
    txDeleteMock.mockReset();

    process.env.CI_E2E_AUTH_SECRET = "top-secret";
    process.env.BETTER_AUTH_SECRET = "better-auth-secret";
    process.env.CI_E2E_TEST_EMAIL = "ci@example.com";
    process.env.CI_E2E_TEST_NAME = "CI";

    isCiE2EAuthEnabledMock.mockReturnValue(true);
    getBetterAuthSessionCookieNameMock.mockReturnValue("__Secure-better-auth.session_token");
    getBetterAuthSessionCookieAttributesMock.mockReturnValue({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    serializeSignedCookieMock.mockResolvedValue("__Secure-better-auth.session_token=signed");
  });

  it("returns 404 when the route is disabled", async () => {
    isCiE2EAuthEnabledMock.mockReturnValue(false);
    const { POST } = await import("@/app/api/internal/test-auth/login/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/login", {
        method: "POST",
      })
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the CI auth secret is missing", async () => {
    delete process.env.CI_E2E_AUTH_SECRET;
    const { POST } = await import("@/app/api/internal/test-auth/login/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/login", {
        method: "POST",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CI_TEST_AUTH_DISABLED" },
    });
  });

  it("returns 404 when the Better Auth secret is missing", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    const { POST } = await import("@/app/api/internal/test-auth/login/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/login", {
        method: "POST",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CI_TEST_AUTH_DISABLED" },
    });
  });

  it("returns 401 when the bearer secret is invalid", async () => {
    const { POST } = await import("@/app/api/internal/test-auth/login/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/login", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-secret",
        },
      })
    );

    expect(response.status).toBe(401);
  });

  it("creates a session cookie for the CI test user", async () => {
    txSelectMock
      .mockReturnValueOnce(makeSelectResult([]))
      .mockReturnValueOnce(makeSelectResult([]));
    txInsertMock.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    txUpdateMock.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) });
    txDeleteMock.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        select: txSelectMock,
        insert: txInsertMock,
        update: txUpdateMock,
        delete: txDeleteMock,
      })
    );

    const { POST } = await import("@/app/api/internal/test-auth/login/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/internal/test-auth/login", {
        method: "POST",
        headers: {
          Authorization: "Bearer top-secret",
        },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(serializeSignedCookieMock).toHaveBeenCalledWith(
      "__Secure-better-auth.session_token",
      expect.any(String),
      "better-auth-secret",
      expect.objectContaining({ secure: true })
    );
    expect(response.headers.get("set-cookie")).toContain("__Secure-better-auth.session_token=signed");
  });
});
