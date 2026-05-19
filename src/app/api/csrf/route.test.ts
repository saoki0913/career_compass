import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("GET /api/csrf", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a csrf cookie when one is missing", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost:3000/api/csrf"));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(204);
    expect(setCookie).toContain("csrf_token=");
    expect(setCookie).toMatch(/SameSite=Strict/iu);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=86400");
    expect(setCookie).not.toContain("HttpOnly");
  });

  it("does not rotate the csrf cookie when one already exists", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/csrf", {
      headers: {
        cookie: "csrf_token=existing-token",
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("adds Secure to the csrf cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("http://localhost:3000/api/csrf"));

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
});
