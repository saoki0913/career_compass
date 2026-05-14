import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { toNextJsHandlerMock } = vi.hoisted(() => ({
  toNextJsHandlerMock: vi.fn(),
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: toNextJsHandlerMock,
}));

describe("api/auth handler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    toNextJsHandlerMock.mockReset();
    vi.doUnmock("@/lib/auth");
  });

  it("returns structured 503 when auth capability env is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://www.shupass.jp/api/auth/sign-in/social", {
        headers: { "x-request-id": "req-auth-env" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBe("req-auth-env");
    expect(body.error.code).toBe("AUTH_CONFIGURATION_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("google-secret");
    expect(JSON.stringify(body)).not.toContain("postgresql://");
  });

  it("redirects OAuth callback auth errors to login restart without exposing state", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: {} }));
    toNextJsHandlerMock.mockReturnValue({
      GET: vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location: "/api/auth/error?error=please_restart_the_process&state=secret-state" },
      })),
      POST: vi.fn(),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://www.shupass.jp/api/auth/callback/google?state=secret-state"),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toBe("https://www.shupass.jp/login?error=auth_restart_required");
    expect(location).not.toContain("secret-state");
  });

  it("redirects thrown state mismatch errors to login restart", async () => {
    vi.doMock("@/lib/auth", () => ({ auth: {} }));
    toNextJsHandlerMock.mockReturnValue({
      GET: vi.fn(async () => {
        const error = new Error("State mismatch: verification not found");
        Object.assign(error, { code: "state_mismatch" });
        throw error;
      }),
      POST: vi.fn(),
    });

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("https://www.shupass.jp/api/auth/callback/google?state=secret-state"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.shupass.jp/login?error=auth_restart_required");
  });
});
