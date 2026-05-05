import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const csrfHeaders = {
  cookie: "csrf_token=test-csrf-token",
  "x-csrf-token": "test-csrf-token",
};

const {
  getSessionMock,
  migrateGuestToUserMock,
  readGuestDeviceTokenMock,
  clearGuestDeviceTokenCookieMock,
  checkRateLimitMock,
  createRateLimitKeyMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  migrateGuestToUserMock: vi.fn(),
  readGuestDeviceTokenMock: vi.fn(),
  clearGuestDeviceTokenCookieMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  createRateLimitKeyMock: vi.fn(),
}));

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

vi.mock("@/lib/auth/guest", () => ({
  migrateGuestToUser: migrateGuestToUserMock,
}));

vi.mock("@/lib/auth/guest-cookie", () => ({
  clearGuestDeviceTokenCookie: clearGuestDeviceTokenCookieMock,
  readGuestDeviceToken: readGuestDeviceTokenMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: {
    guestMigrate: { maxTokens: 3, refillRate: 0.033, windowMs: 60_000 },
  },
  checkRateLimit: checkRateLimitMock,
  createRateLimitKey: createRateLimitKeyMock,
}));

describe("api/guest/migrate", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    migrateGuestToUserMock.mockReset();
    readGuestDeviceTokenMock.mockReset();
    clearGuestDeviceTokenCookieMock.mockReset();
    checkRateLimitMock.mockReset();
    createRateLimitKeyMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    migrateGuestToUserMock.mockResolvedValue({
      guestId: "guest-1",
      userId: "user-1",
    });
    readGuestDeviceTokenMock.mockReturnValue("550e8400-e29b-41d4-a716-446655440000");
    createRateLimitKeyMock.mockReturnValue("guestMigrate:user-1");
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 2, resetIn: 0 });
  });

  it("uses the guest migration limiter key", async () => {
    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      body: JSON.stringify({ deviceToken: "550e8400-e29b-41d4-a716-446655440000" }),
      headers: { "content-type": "application/json", ...csrfHeaders },
    });

    await POST(request);

    expect(createRateLimitKeyMock).toHaveBeenCalledWith("guestMigrate", "user-1", null);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "guestMigrate:user-1",
      expect.objectContaining({ maxTokens: 3 }),
    );
  });

  it("does not expose owner identifiers after a successful migration", async () => {
    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      headers: { "content-type": "application/json", ...csrfHeaders },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      migrated: true,
      message: "Guest data migrated successfully",
    });
    expect(payload.guestId).toBeUndefined();
    expect(payload.userId).toBeUndefined();
  });

  it("returns a structured 429 response when rate limited", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetIn: 42 });

    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      body: JSON.stringify({ deviceToken: "550e8400-e29b-41d4-a716-446655440000" }),
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-guest-migrate",
        ...csrfHeaders,
      },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("X-Request-Id")).toBe("req-guest-migrate");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(payload.error.userMessage).toBe("しばらく待ってから再試行してください。");
    expect(payload.error.action).toContain("42");
  });

  it("returns no-op success without rate limiting when there is no guest cookie", async () => {
    readGuestDeviceTokenMock.mockReturnValueOnce(null);

    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      headers: { "content-type": "application/json", ...csrfHeaders },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      migrated: false,
      reason: "guest_session_not_found",
    });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(migrateGuestToUserMock).not.toHaveBeenCalled();
  });

  it("returns no-op success and clears the guest cookie when migration is already done", async () => {
    migrateGuestToUserMock.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      headers: { "content-type": "application/json", ...csrfHeaders },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      migrated: false,
      reason: "guest_session_not_found_or_already_migrated",
    });
    expect(clearGuestDeviceTokenCookieMock).toHaveBeenCalledWith(response);
  });

  it("rejects missing CSRF before migrating guest data", async () => {
    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("CSRF_TOKEN_MISSING");
    expect(migrateGuestToUserMock).not.toHaveBeenCalled();
  });
});
