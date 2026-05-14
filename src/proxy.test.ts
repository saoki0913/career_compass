import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function getDirective(csp: string | null, directive: string): string {
  return (csp ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${directive} `)) ?? "";
}

describe("proxy CSP", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("adds a nonce-based CSP to authenticated product routes", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        accept: "text/html",
        cookie: "__Secure-better-auth.session_token=session-token; better-auth.session_token=session-token",
      },
    });

    const response = await proxy(request);
    const csp = response.headers.get("Content-Security-Policy");

    expect(response.status).toBe(200);
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("recognizes the legacy non-secure Better Auth cookie name too", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        accept: "text/html",
        cookie: "better-auth.session_token=session-token",
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
  });

  it("normalizes stale profile callbacks for unauthenticated protected routes", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/settings/profile", {
      headers: {
        accept: "text/html",
      },
    });

    const response = await proxy(request);
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain("/login?callbackUrl=%2Fprofile");
  });

  it("keeps /profile protected and returns to it after login", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/profile", {
      headers: {
        accept: "text/html",
      },
    });

    const response = await proxy(request);
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain("/login?callbackUrl=%2Fprofile");
  });

  it("uses normalized callback URLs when authenticated users visit login", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/login?callbackUrl=/settings/profile", {
      headers: {
        accept: "text/html",
        cookie: "__Secure-better-auth.session_token=session-token; better-auth.session_token=session-token",
      },
    });

    const response = await proxy(request);
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe("http://localhost:3000/profile");
  });

  it("adds a nonce-based CSP to public marketing routes too", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/", {
      headers: {
        accept: "text/html",
      },
    });

    const response = await proxy(request);
    const csp = response.headers.get("Content-Security-Policy");

    expect(response.status).toBe(200);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("includes configured Sentry ingest origin in HTML connect-src", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SENTRY_DSN",
      "https://public-key@o4511335749058560.ingest.us.sentry.io/4511335849132032"
    );
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        accept: "text/html",
        cookie: "__Secure-better-auth.session_token=session-token",
      },
    });

    const response = await proxy(request);
    const connectSrc = getDirective(response.headers.get("Content-Security-Policy"), "connect-src");

    expect(connectSrc).toContain("https://o4511335749058560.ingest.us.sentry.io");
    expect(connectSrc).not.toContain("public-key");
  });

  it("does not attach CSP to API or static asset requests", async () => {
    const { proxy } = await import("@/proxy");

    const apiResponse = await proxy(new NextRequest("http://localhost:3000/api/auth/plan"));
    const staticResponse = await proxy(new NextRequest("http://localhost:3000/favicon.ico", {
      headers: { accept: "text/html" },
    }));

    expect(apiResponse.headers.get("Content-Security-Policy")).toBeNull();
    expect(staticResponse.headers.get("Content-Security-Policy")).toBeNull();
  });
});

/**
 * D-11: CSRF short-circuit should apply ONLY to Better Auth's catch-all
 * route (`/api/auth/[...all]`). Our custom endpoints under `/api/auth/`
 * (`guest`, `onboarding`, `plan`) must go through the full proxy CSRF check.
 */
describe("proxy CSRF short-circuit (D-11)", () => {
  it("short-circuits Better Auth catch-all POST without requiring proxy-level Origin/CSRF", async () => {
    const { proxy } = await import("@/proxy");
    // No Origin header and no CSRF token — proxy must still let this through
    // because Better Auth owns CSRF for its own routes.
    const request = new NextRequest(
      "http://localhost:3000/api/auth/sign-in/email",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      }
    );

    const response = await proxy(request);
    // 200 means proxy forwarded (NextResponse.next). Actual handling happens
    // downstream — we only care that the proxy didn't 403 at the edge.
    expect(response.status).toBe(200);
  });

  it("rejects /api/auth/guest POST with missing Origin at the proxy layer", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/auth/guest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);

    const body = (await response.json()) as {
      error: { code: string };
    };
    expect(body.error.code).toBe("ORIGIN_REQUIRED");
  });

  it("rejects /api/auth/onboarding POST with missing CSRF token at the proxy layer", async () => {
    const { proxy } = await import("@/proxy");
    // Valid Origin but no CSRF cookie / header ⇒ proxy CSRF rejects
    const request = new NextRequest(
      "http://localhost:3000/api/auth/onboarding",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
      }
    );

    const response = await proxy(request);
    expect(response.status).toBe(403);

    const body = (await response.json()) as {
      error: { code: string };
    };
    expect(body.error.code).toBe("CSRF_TOKEN_MISSING");
  });

  it("lets /api/auth/plan GET through the proxy (GET is not a CSRF-protected method)", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/auth/plan", {
      method: "GET",
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
  });

  it("does not treat dotted API paths as static assets for CSRF bypass", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/foo.bar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await proxy(request);
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ORIGIN_REQUIRED");
  });

  it("does not exempt webhook-like API prefixes from CSRF", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/webhooks.foo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await proxy(request);
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ORIGIN_REQUIRED");
  });
});

/**
 * D-2 象限①: Next.js JSON API payload size cap.
 *
 * The proxy rejects JSON request bodies whose Content-Length exceeds 1 MiB
 * before any route allocates them, and refuses chunked Transfer-Encoding for
 * JSON bodies. Multipart uploads pass through (per-route policing applies).
 */
describe("proxy payload size cap (D-2 象限①)", () => {
  it("rejects oversized JSON POST with 413", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/documents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(2 * 1024 * 1024), // 2 MiB
        origin: "http://localhost:3000",
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects chunked Transfer-Encoding for JSON POST with 413", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/documents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
        origin: "http://localhost:3000",
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PAYLOAD_CHUNKED_JSON_REJECTED");
  });

  it("allows small JSON POST to fall through to CSRF / route handlers", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/api/documents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "128",
        origin: "http://localhost:3000",
      },
    });

    const response = await proxy(request);
    // Proxy does not 413 — downstream (CSRF or route) is responsible for any
    // other rejection. 403 is the expected CSRF path for missing token.
    expect(response.status).not.toBe(413);
  });

  it("does not police multipart uploads — size enforcement is per-route", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest(
      "http://localhost:3000/api/companies/company-1/fetch-corporate-upload",
      {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
          // 10 MiB — well over the JSON cap but allowed here.
          "content-length": String(10 * 1024 * 1024),
          origin: "http://localhost:3000",
        },
      }
    );

    const response = await proxy(request);
    expect(response.status).not.toBe(413);
  });
});
