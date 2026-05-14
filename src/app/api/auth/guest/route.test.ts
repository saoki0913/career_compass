import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  csrfMock,
  readGuestDeviceTokenMock,
  issueGuestDeviceTokenMock,
  setGuestDeviceTokenCookieMock,
  getOrCreateGuestUserMock,
  checkRateLimitMock,
  createRateLimitKeyMock,
  createAnonymousRateLimitKeyMock,
  createApiErrorResponseMock,
  logErrorMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  readGuestDeviceTokenMock: vi.fn(),
  issueGuestDeviceTokenMock: vi.fn(),
  setGuestDeviceTokenCookieMock: vi.fn(),
  getOrCreateGuestUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  createRateLimitKeyMock: vi.fn(),
  createAnonymousRateLimitKeyMock: vi.fn(),
  createApiErrorResponseMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: csrfMock,
}));

vi.mock("@/lib/auth/guest", () => ({
  getOrCreateGuestUser: getOrCreateGuestUserMock,
  getGuestUser: vi.fn(),
}));

vi.mock("@/lib/auth/guest-cookie", () => ({
  readGuestDeviceToken: readGuestDeviceTokenMock,
  issueGuestDeviceToken: issueGuestDeviceTokenMock,
  setGuestDeviceTokenCookie: setGuestDeviceTokenCookieMock,
  clearGuestDeviceTokenCookie: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  createAnonymousRateLimitKey: createAnonymousRateLimitKeyMock,
  createRateLimitKey: createRateLimitKeyMock,
  RATE_LIMITS: {
    guestAuth: { maxTokens: 5, refillRate: 0.08, windowMs: 60000 },
    guestAuthAnonymous: { maxTokens: 10, refillRate: 0.16, windowMs: 60000 },
  },
}));

vi.mock("@/bff/api/error-response", () => ({
  createApiErrorResponse: createApiErrorResponseMock,
}));

describe("api/auth/guest", () => {
  beforeEach(() => {
    vi.resetModules();
    csrfMock.mockReset();
    readGuestDeviceTokenMock.mockReset();
    issueGuestDeviceTokenMock.mockReset();
    setGuestDeviceTokenCookieMock.mockReset();
    getOrCreateGuestUserMock.mockReset();
    checkRateLimitMock.mockReset();
    createRateLimitKeyMock.mockReset();
    createAnonymousRateLimitKeyMock.mockReset();
    createApiErrorResponseMock.mockReset();

    // Defaults: CSRF passes, rate limit allows
    csrfMock.mockReturnValue(null);
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 4, resetIn: 0 });
    createAnonymousRateLimitKeyMock.mockReturnValue("guestAuthAnonymous:anonymous-ip:test");
    createRateLimitKeyMock.mockImplementation(
      (operation: string, userId: string | null, guestId: string | null) =>
        [operation, userId || guestId || "anonymous"].join(":")
    );
    createApiErrorResponseMock.mockImplementation(
      (
        _request: NextRequest,
        options: {
          status: number;
          code: string;
          userMessage: string;
          action?: string;
        }
      ) =>
        NextResponse.json(
          {
            error: {
              code: options.code,
              userMessage: options.userMessage,
              action: options.action,
            },
          },
          { status: options.status }
        )
    );
  });

  it("returns 403 when CSRF token is missing", async () => {
    csrfMock.mockReturnValue("missing");
    const { POST } = await import("@/app/api/auth/guest/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest", {
      method: "POST",
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("CSRF validation failed");
    // Must not proceed to guest creation
    expect(getOrCreateGuestUserMock).not.toHaveBeenCalled();
  });

  it("succeeds with valid CSRF token", async () => {
    csrfMock.mockReturnValue(null);
    readGuestDeviceTokenMock.mockReturnValue(null);
    issueGuestDeviceTokenMock.mockReturnValue("new-device-token");
    setGuestDeviceTokenCookieMock.mockImplementation(() => {});
    getOrCreateGuestUserMock.mockResolvedValue({
      id: "guest-1",
      expiresAt: new Date("2026-05-01T00:00:00Z"),
      migratedToUserId: null,
    });

    const { POST } = await import("@/app/api/auth/guest/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest", {
      method: "POST",
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.id).toBe("guest-1");
    expect(getOrCreateGuestUserMock).toHaveBeenCalledWith("new-device-token");
    expect(checkRateLimitMock).toHaveBeenNthCalledWith(
      1,
      "guestAuthAnonymous:anonymous-ip:test",
      expect.objectContaining({ maxTokens: 10 }),
      "guestAuthAnonymous"
    );
    expect(checkRateLimitMock).toHaveBeenNthCalledWith(
      2,
      "guestAuth:new-device-token",
      expect.objectContaining({ maxTokens: 5 }),
      "guestAuth"
    );
  });

  it("applies anonymous rate limiting before reading or issuing a device token", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetIn: 31,
    });

    const { POST } = await import("@/app/api/auth/guest/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("31");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(createAnonymousRateLimitKeyMock).toHaveBeenCalledWith(
      "guestAuthAnonymous",
      expect.any(Headers)
    );
    expect(readGuestDeviceTokenMock).not.toHaveBeenCalled();
    expect(issueGuestDeviceTokenMock).not.toHaveBeenCalled();
    expect(getOrCreateGuestUserMock).not.toHaveBeenCalled();
  });
});
