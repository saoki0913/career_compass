import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("proxy CSP", () => {
  it("adds a nonce-based CSP to authenticated product routes", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        accept: "text/html",
        cookie: "__Secure-better-auth.session_token=session-token",
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
});
