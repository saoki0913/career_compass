import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { checkRateLimitMock, getRequestIdentityMock, logErrorMock, logWarnMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
}));

vi.mock("@/bff/identity/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return {
    ...actual,
    checkRateLimit: checkRateLimitMock,
  };
});

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
  logWarn: logWarnMock,
}));

function request(url: string) {
  const parsed = new URL(url);
  if (parsed.pathname === "/api/company-logos" && !parsed.searchParams.has("policy")) {
    parsed.searchParams.set("policy", "official-logo-v2");
  }
  return new NextRequest(parsed);
}

function rawRequest(url: string) {
  return new NextRequest(url);
}

describe("api/company-logos", () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 119, resetIn: 0 });
    getRequestIdentityMock.mockReset().mockResolvedValue({ userId: "user-1", guestId: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    logErrorMock.mockReset();
    logWarnMock.mockReset();
  });

  it("proxies Logo.dev without exposing the server token in the client URL", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const upstream = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(upstream).toContain("https://img.logo.dev/mitsui.com");
    expect(upstream).toContain("token=server-logo-token");
  });

  it("requires the explicit official logo policy", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const response = await GET(
      rawRequest("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getRequestIdentityMock).not.toHaveBeenCalled();
  });

  it("requires an authenticated user or guest before spending provider quota", async () => {
    getRequestIdentityMock.mockResolvedValueOnce(null);
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rate limits authenticated logo proxy requests before upstream fetch", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetIn: 12 });
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects private or malformed domains before upstream fetch", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const localhost = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=localhost"),
    );
    const privateIp = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=127.0.0.1"),
    );

    expect(localhost.status).toBe(404);
    expect(privateIp.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires a server-side provider credential", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=brandfetch&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses legacy NEXT_PUBLIC provider env only as a server-side compatibility alias", async () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "legacy-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toContain("token=legacy-logo-token");
  });

  it("auto provider does not fall through to favicon providers", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    vi.stubEnv("BRANDFETCH_CLIENT_ID", "server-brandfetch-client");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=auto&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain("google.com");
    expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain("duckduckgo");
    expect(logWarnMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("rejects name-only lookup to prevent ambiguous company logo matches", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=auto&name=%E4%B8%89%E4%BA%95%E4%B8%8D%E5%8B%95%E7%94%A3"),
    );

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows only curated Logo.dev name lookup keys", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev-name&nameKey=sagawa-express"),
    );

    expect(response.status).toBe(200);
    const upstream = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(upstream).toContain("https://img.logo.dev/name/Sagawa%20Express");
    expect(upstream).toContain("fallback=404");
  });

  it("rejects arbitrary Logo.dev name lookup keys before provider fetch", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev-name&nameKey=mufg"),
    );

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows raw company name lookup through Logo.dev with 404 fallback", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev-name&name=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD"),
    );

    expect(response.status).toBe(200);
    const upstream = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(upstream).toContain("https://img.logo.dev/name/%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD");
    expect(upstream).toContain("fallback=404");
  });

  it("uses Logo.dev Brand Search to resolve a company name to a domain before image lookup", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    vi.stubEnv("LOGO_DEV_SECRET_KEY", "sk_server-search-token");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ name: "Nippon Life", domain: "nissay.co.jp" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev-name&name=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD"),
    );

    expect(response.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toBe(
      "https://api.logo.dev/search?q=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD&strategy=match",
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk_server-search-token" }),
      }),
    );
    expect(String(fetchSpy.mock.calls[1]?.[0] ?? "")).toContain("https://img.logo.dev/nissay.co.jp");
  });

  it("uses Brandfetch name search as a fallback to a domain logo", async () => {
    vi.stubEnv("BRANDFETCH_CLIENT_ID", "server-brandfetch-client");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ name: "Nippon Life", domain: "nissay.co.jp", claimed: true }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=brandfetch-name&name=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD"),
    );

    expect(response.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toContain("https://api.brandfetch.io/v2/search/");
    expect(String(fetchSpy.mock.calls[1]?.[0] ?? "")).toContain(
      "https://cdn.brandfetch.io/domain/nissay.co.jp/w/128/h/128/type/logo/fallback/404",
    );
  });

  it("ignores name when a verified domain is present", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=auto&domain=mitsui.com&name=%E4%B8%89%E4%BA%95%E7%89%A9%E7%94%A3"),
    );

    expect(response.status).toBe(200);
    const upstream = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(upstream).toContain("https://img.logo.dev/mitsui.com");
    expect(upstream).not.toContain("/name/");
    expect(upstream).not.toContain("mufg");
  });

  it("proxies allowlisted official remote SVG assets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>', {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=official&asset=mitsuifudosan-corporate"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toBe(
      "https://www.mitsuifudosan.co.jp/assets/image/common/logo.svg",
    );
  });

  it("extracts allowlisted inline SVG symbols for official assets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '<html><body><svg id="logo-corporate-horizontal" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg></body></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=official&asset=mitsui-corporate-horizontal"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="logo-corporate-horizontal"');
  });

  it("uses Brandfetch explicit domain logo route with 404 fallback", async () => {
    vi.stubEnv("BRANDFETCH_CLIENT_ID", "server-brandfetch-client");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=brandfetch&domain=mitsui.com"),
    );

    expect(response.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "https://cdn.brandfetch.io/domain/mitsui.com/w/128/h/128/type/logo/fallback/404",
    );
  });

  it("treats upstream 404 as a cached quiet miss", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
    expect(logWarnMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("does not cache transient upstream failures as a normal miss", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not proxy provider SVG responses without the official sanitizer path", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('<svg><script>alert(1)</script></svg>', {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(logWarnMock).toHaveBeenCalledWith(
      "company-logo-upstream-non-image",
      expect.objectContaining({ provider: "logo-dev" }),
    );
  });

  it("treats official asset fetch failures as quiet no-store misses", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failed"));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=official&asset=mitsuifudosan-corporate"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not log provider token values on fetch failure", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failed for token=server-logo-token"));
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"),
    );

    expect(response.status).toBe(404);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain("server-logo-token");
  });

  it("allows arbitrary valid domains because provider fetches stay fixed to Logo.dev", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=example.com"),
    );

    expect(response.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toContain("https://img.logo.dev/example.com");
  });

  it("allows full mapped domains that were promoted as low-confidence logo candidates", async () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "server-logo-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("http://localhost:3000/api/company-logos?provider=logo-dev&domain=smbc.co.jp"),
    );

    expect(response.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0] ?? "")).toContain("https://img.logo.dev/smbc.co.jp");
  });
});
