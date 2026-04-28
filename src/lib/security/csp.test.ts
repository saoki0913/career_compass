import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importCspModule() {
  vi.resetModules();
  return import("@/lib/security/csp");
}

describe("security/csp", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv);
  });

  it("includes unsafe-eval in the development static CSP", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { buildStaticCsp } = await importCspModule();

    expect(buildStaticCsp()).toContain("'unsafe-eval'");
  });

  it("omits unsafe-eval from the production static CSP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildStaticCsp } = await importCspModule();

    expect(buildStaticCsp()).not.toContain("'unsafe-eval'");
  });

  it("allows Google Favicon images in img-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildStaticCsp } = await importCspModule();
    const csp = buildStaticCsp();

    expect(csp).toContain("https://www.google.com");
  });

  it("allows configured real logo provider images in img-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildStaticCsp } = await importCspModule();
    const csp = buildStaticCsp();

    expect(csp).toContain("https://img.logo.dev");
    expect(csp).toContain("https://cdn.brandfetch.io");
  });

  it("allows DuckDuckGo favicon images in img-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildStaticCsp } = await importCspModule();
    const csp = buildStaticCsp();

    expect(csp).toContain("https://icons.duckduckgo.com");
  });

  it("keeps the nonce CSP strict while allowing development eval support", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { buildNonceCsp } = await importCspModule();
    const csp = buildNonceCsp("nonce-123");

    expect(csp).toContain("script-src 'self' 'nonce-nonce-123' 'strict-dynamic'");
    expect(csp).toContain("'unsafe-eval'");
  });
});
