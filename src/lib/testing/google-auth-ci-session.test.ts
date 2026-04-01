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

describe("ensureCiE2EAuthSession", { timeout: 15000 }, () => {
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

  it("keeps the repaired browser context usable for owned helper requests", async () => {
    const addCookiesMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      statusText: () => "OK",
      text: async () => JSON.stringify({ company: { id: "company-1", name: "認証済み企業" } }),
      json: async () => ({ company: { id: "company-1", name: "認証済み企業" } }),
    });
    const requestClient = {
      post: vi.fn().mockResolvedValue(
        makeApiResponse({
          headersArray: [
            {
              name: "Set-Cookie",
              value:
                "__Secure-better-auth.session_token=signed-token; Path=/; HttpOnly; Secure; SameSite=Lax",
            },
          ],
        }),
      ),
      get: vi
        .fn()
        .mockResolvedValueOnce(
          makeApiResponse({ body: "null", url: "https://stg.shupass.jp/api/auth/get-session" }),
        )
        .mockResolvedValueOnce(
          makeApiResponse({
            body: JSON.stringify({ user: { id: "user-1" } }),
            url: "https://stg.shupass.jp/api/auth/get-session",
          }),
        ),
      fetch: fetchMock,
    };
    const cookiesMock = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: "__Secure-better-auth.session_token",
          value: "signed-token",
        },
      ]);

    const page = {
      evaluate: vi.fn().mockResolvedValue("guest-device-token"),
      context: () => ({
        request: requestClient,
        cookies: cookiesMock,
        addCookies: addCookiesMock,
      }),
    };

    const { ensureCiE2EAuthSession } = await import("../../../e2e/google-auth");
    const { createOwnedCompany } = await import("../../../e2e/fixtures/auth");

    await ensureCiE2EAuthSession(page as never);
    await createOwnedCompany(page as never, { name: "認証済み企業" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://stg.shupass.jp/api/companies",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Origin: "https://stg.shupass.jp",
          Referer: "https://stg.shupass.jp/",
        }),
      }),
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
