import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  migrateGuestToUserMock,
  checkRateLimitMock,
  createRateLimitKeyMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  migrateGuestToUserMock: vi.fn(),
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
    checkRateLimitMock.mockReset();
    createRateLimitKeyMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    migrateGuestToUserMock.mockResolvedValue({
      guestId: "guest-1",
      userId: "user-1",
    });
    createRateLimitKeyMock.mockReturnValue("guestMigrate:user-1");
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 2, resetIn: 0 });
  });

  it("uses the guest migration limiter key", async () => {
    const { POST } = await import("@/app/api/guest/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/guest/migrate", {
      method: "POST",
      body: JSON.stringify({ deviceToken: "550e8400-e29b-41d4-a716-446655440000" }),
      headers: { "content-type": "application/json" },
    });

    await POST(request);

    expect(createRateLimitKeyMock).toHaveBeenCalledWith("guestMigrate", "user-1", null);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "guestMigrate:user-1",
      expect.objectContaining({ maxTokens: 3 }),
    );
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
});
