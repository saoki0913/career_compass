import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  exchangeCalendarCodeMock,
  fetchGoogleUserEmailMock,
  storeGoogleCalendarTokensMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  exchangeCalendarCodeMock: vi.fn(),
  fetchGoogleUserEmailMock: vi.fn(),
  storeGoogleCalendarTokensMock: vi.fn(),
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

vi.mock("@/lib/calendar/connection", () => ({
  GOOGLE_CALENDAR_SCOPES: ["https://www.googleapis.com/auth/calendar.events"],
  storeGoogleCalendarTokens: storeGoogleCalendarTokensMock,
}));

vi.mock("@/lib/calendar/oauth", () => ({
  exchangeCalendarCode: exchangeCalendarCodeMock,
  fetchGoogleUserEmail: fetchGoogleUserEmailMock,
}));

function oauthStateCookie(value: { state: string; returnTo: string }) {
  return `calendar_oauth_state=${encodeURIComponent(JSON.stringify(value))}`;
}

describe("GET /api/calendar/connect/callback", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getSessionMock.mockReset();
    exchangeCalendarCodeMock.mockReset();
    fetchGoogleUserEmailMock.mockReset();
    storeGoogleCalendarTokensMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    exchangeCalendarCodeMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2026-05-18T00:00:00.000Z"),
      grantedScopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    fetchGoogleUserEmailMock.mockResolvedValue("student@example.com");
    storeGoogleCalendarTokensMock.mockResolvedValue(undefined);
  });

  it("clears calendar_oauth_state with the original security flags after a valid callback", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/calendar/connect/callback?code=code-1&state=state-1", {
        headers: {
          cookie: oauthStateCookie({ state: "state-1", returnTo: "/calendar/settings" }),
        },
      }),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/calendar/settings?connected=1");
    expect(setCookie).toContain("calendar_oauth_state=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=Lax/iu);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("adds Secure when clearing calendar_oauth_state in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/calendar/connect/callback?code=code-1&state=state-1", {
        headers: {
          cookie: oauthStateCookie({ state: "state-1", returnTo: "/calendar/settings" }),
        },
      }),
    );

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
});
