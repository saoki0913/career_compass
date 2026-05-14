import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  csrfMock,
  getSessionMock,
  createApiErrorResponseMock,
} = vi.hoisted(() => ({
  csrfMock: vi.fn(),
  getSessionMock: vi.fn(),
  createApiErrorResponseMock: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: csrfMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/app-url", () => ({
  getAppOrigin: vi.fn(() => "http://localhost:3000"),
}));

vi.mock("@/bff/api/error-response", () => ({
  createApiErrorResponse: createApiErrorResponseMock,
}));

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    headers,
  });
}

describe("requireUserMutationRequest", () => {
  beforeEach(() => {
    vi.resetModules();
    csrfMock.mockReset().mockReturnValue(null);
    getSessionMock.mockReset().mockResolvedValue({
      user: { id: "user-1", banned: false },
      session: { id: "session-1", impersonatedBy: null },
    });
    createApiErrorResponseMock.mockReset().mockImplementation((request: unknown, payload: { status: number }) =>
      NextResponse.json(payload, { status: payload.status }),
    );
  });

  it("rejects missing Origin before reading the session", async () => {
    const { requireUserMutationRequest } = await import("./mutation-guard");

    const result = await requireUserMutationRequest(makeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({ code: "ORIGIN_REQUIRED" });
    }
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("rejects untrusted Origin before reading the session", async () => {
    const { requireUserMutationRequest } = await import("./mutation-guard");

    const result = await requireUserMutationRequest(makeRequest({ Origin: "https://evil.example" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({ code: "ORIGIN_NOT_ALLOWED" });
    }
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("rejects impersonated sessions for high-risk mutations", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "target-user", banned: false },
      session: { id: "session-1", impersonatedBy: "admin-user" },
    });
    const { requireUserMutationRequest } = await import("./mutation-guard");

    const result = await requireUserMutationRequest(makeRequest({ Origin: "http://localhost:3000" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        code: "IMPERSONATION_MUTATION_FORBIDDEN",
      });
    }
  });

  it("returns the active session for a trusted non-impersonated request", async () => {
    const { requireUserMutationRequest } = await import("./mutation-guard");

    const result = await requireUserMutationRequest(makeRequest({ Origin: "http://localhost:3000" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.user.id).toBe("user-1");
    }
  });

  it("allows owner mutations without requiring an authenticated user session", async () => {
    const { requireOwnerMutationRequest } = await import("./mutation-guard");

    const result = requireOwnerMutationRequest(makeRequest({ Origin: "http://localhost:3000" }));

    expect(result.ok).toBe(true);
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
