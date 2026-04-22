import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionMock, dbSelectMock, dbUpdateMock, dbInsertMock, csrfMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbInsertMock: vi.fn(),
  csrfMock: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: csrfMock,
}));

describe("api/auth/onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    csrfMock.mockReset();

    // Default: CSRF passes
    csrfMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "profile-1" }]),
        })),
      })),
    });
  });

  it("rejects empty onboarding payloads instead of marking completion", async () => {
    const { POST } = await import("@/app/api/auth/onboarding/route");
    const request = new NextRequest("http://localhost:3000/api/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("At least one onboarding field is required");
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("returns 403 when CSRF token is missing", async () => {
    csrfMock.mockReturnValue("missing");
    const { POST } = await import("@/app/api/auth/onboarding/route");
    const request = new NextRequest("http://localhost:3000/api/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({ university: "Test University" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("CSRF validation failed");
    // Must not reach session or DB
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("returns 403 when CSRF token is invalid", async () => {
    csrfMock.mockReturnValue("invalid");
    const { POST } = await import("@/app/api/auth/onboarding/route");
    const request = new NextRequest("http://localhost:3000/api/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({ university: "Test University" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});

describe("api/auth/onboarding CSRF real wiring", () => {
  // This test does NOT mock getCsrfFailureReason, verifying real CSRF logic
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "profile-1" }]),
        })),
      })),
    });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    });
  });

  it("passes CSRF check when cookie and header carry the same token", async () => {
    // Remove the CSRF mock so the real implementation runs
    vi.doUnmock("@/lib/csrf");
    const { POST } = await import("@/app/api/auth/onboarding/route");

    const token = "a]b]c]test-csrf-token-1234567890abcdef";
    const request = new NextRequest("http://localhost:3000/api/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({ university: "Test University" }),
      headers: {
        "content-type": "application/json",
        cookie: `csrf_token=${token}`,
        "x-csrf-token": token,
      },
    });

    const response = await POST(request);
    // Should NOT be 403 — CSRF passed, proceed to normal flow
    expect(response.status).not.toBe(403);
  });

  it("rejects when cookie and header tokens differ", async () => {
    vi.doUnmock("@/lib/csrf");
    const { POST } = await import("@/app/api/auth/onboarding/route");

    const request = new NextRequest("http://localhost:3000/api/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({ university: "Test University" }),
      headers: {
        "content-type": "application/json",
        cookie: "csrf_token=correct-token-aaaa",
        "x-csrf-token": "wrong-token-bbbb",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
