import { beforeEach, describe, expect, it, vi } from "vitest";

function makeApiResponse(input: {
  ok?: boolean;
  status?: number;
  body?: string;
  headersArray?: Array<{ name: string; value: string }>;
  url?: string;
}) {
  return {
    ok: () => input.ok ?? true,
    status: () => input.status ?? 200,
    text: vi.fn().mockResolvedValue(input.body ?? ""),
    headers: () => ({}),
    headersArray: () => input.headersArray ?? [],
    url: () => input.url ?? "https://stg.shupass.jp/api/internal/test-auth/login",
  };
}

describe("ensureCiE2EAuthSession", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CI_E2E_AUTH_SECRET = "top-secret";
    process.env.PLAYWRIGHT_BASE_URL = "https://stg.shupass.jp";
  });

  it("injects the Better Auth cookie into the browser context when login does not persist it automatically", async () => {
    const addCookiesMock = vi.fn().mockResolvedValue(undefined);
    const cookiesMock = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: "__Secure-better-auth.session_token",
          value: "signed-token",
        },
      ]);
    const sessionGetMock = vi
      .fn()
      .mockResolvedValueOnce(makeApiResponse({ body: "null", url: "https://stg.shupass.jp/api/auth/get-session" }))
      .mockResolvedValueOnce(
        makeApiResponse({
          body: JSON.stringify({ user: { id: "user-1" } }),
          url: "https://stg.shupass.jp/api/auth/get-session",
        }),
      );
    const loginPostMock = vi.fn().mockResolvedValue(
      makeApiResponse({
        headersArray: [
          {
            name: "Set-Cookie",
            value:
              "__Secure-better-auth.session_token=signed-token; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
        ],
      }),
    );

    const page = {
      context: () => ({
        request: {
          post: loginPostMock,
          get: sessionGetMock,
        },
        cookies: cookiesMock,
        addCookies: addCookiesMock,
      }),
    };

    const { ensureCiE2EAuthSession } = await import("../../../e2e/google-auth");
    await ensureCiE2EAuthSession(page as never);

    expect(loginPostMock).toHaveBeenCalledTimes(1);
    expect(sessionGetMock).toHaveBeenCalledTimes(2);
    expect(addCookiesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "__Secure-better-auth.session_token",
          value: "signed-token",
          domain: "stg.shupass.jp",
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        }),
      ]),
    );
  });

  it("fails fast when the browser context still has no authenticated session after cookie repair", async () => {
    const addCookiesMock = vi.fn().mockResolvedValue(undefined);
    const cookiesMock = vi.fn().mockResolvedValue([]);
    const sessionGetMock = vi.fn().mockResolvedValue(
      makeApiResponse({ body: "null", url: "https://stg.shupass.jp/api/auth/get-session" }),
    );
    const loginPostMock = vi.fn().mockResolvedValue(
      makeApiResponse({
        headersArray: [
          {
            name: "Set-Cookie",
            value:
              "__Secure-better-auth.session_token=signed-token; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
        ],
      }),
    );

    const page = {
      context: () => ({
        request: {
          post: loginPostMock,
          get: sessionGetMock,
        },
        cookies: cookiesMock,
        addCookies: addCookiesMock,
      }),
    };

    const { ensureCiE2EAuthSession } = await import("../../../e2e/google-auth");

    await expect(ensureCiE2EAuthSession(page as never)).rejects.toThrow(
      "browser context is not authenticated",
    );
    expect(addCookiesMock).toHaveBeenCalledTimes(1);
  });
});
