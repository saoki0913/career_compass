import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionMock, buildGoogleCalendarConsentUrlMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  buildGoogleCalendarConsentUrlMock: vi.fn(),
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

vi.mock("@/lib/calendar/oauth", () => ({
  buildGoogleCalendarConsentUrl: buildGoogleCalendarConsentUrlMock,
}));

describe("GET /api/calendar/connect", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getSessionMock.mockReset();
    buildGoogleCalendarConsentUrlMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    buildGoogleCalendarConsentUrlMock.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?state=test");
  });

  it("sets calendar_oauth_state as an HttpOnly SameSite=Lax root cookie", async () => {
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("http://localhost:3000/api/calendar/connect?returnTo=/calendar/settings"));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=test");
    expect(setCookie).toContain("calendar_oauth_state=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=Lax/iu);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=600");
  });

  it("adds Secure to calendar_oauth_state in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("http://localhost:3000/api/calendar/connect"));

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
});
