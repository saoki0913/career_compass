import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  csrfMock,
  readGuestDeviceTokenMock,
  issueGuestDeviceTokenMock,
  setGuestDeviceTokenCookieMock,
  getOrCreateGuestUserMock,
  checkRateLimitMock,
  logErrorMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  readGuestDeviceTokenMock: vi.fn(),
  issueGuestDeviceTokenMock: vi.fn(),
  setGuestDeviceTokenCookieMock: vi.fn(),
  getOrCreateGuestUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
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
  createRateLimitKey: vi.fn((...args: string[]) => args.join(":")),
  RATE_LIMITS: { guestAuth: { windowMs: 60000, max: 10 } },
}));

vi.mock("@/app/api/_shared/error-response", () => ({
  createApiErrorResponse: vi.fn(),
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

    // Defaults: CSRF passes, rate limit allows
    csrfMock.mockReturnValue(null);
    checkRateLimitMock.mockResolvedValue({ allowed: true });
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
  });
});
