import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importCspModule() {
  vi.resetModules();
  return import("@/lib/security/csp");
}

function getDirective(csp: string, directive: string): string {
  return csp
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${directive} `)) ?? "";
}

describe("security/csp", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv);
  });

  it("includes unsafe-eval in the development nonce CSP", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { buildNonceCsp } = await importCspModule();

    expect(getDirective(buildNonceCsp("nonce-123"), "script-src")).toContain("'unsafe-eval'");
  });

  it("omits unsafe-eval from the production nonce CSP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildNonceCsp } = await importCspModule();

    expect(getDirective(buildNonceCsp("nonce-123"), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows Google Favicon images in img-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildNonceCsp } = await importCspModule();
    const csp = buildNonceCsp("nonce-123");

    expect(getDirective(csp, "img-src")).toContain("https://www.google.com");
  });

  it("does not allow direct logo provider images in img-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildNonceCsp } = await importCspModule();
    const csp = buildNonceCsp("nonce-123");
    const imgSrc = getDirective(csp, "img-src");

    expect(imgSrc).not.toContain("https://img.logo.dev");
    expect(imgSrc).not.toContain("https://cdn.brandfetch.io");
  });

  it("allows DuckDuckGo favicon images in img-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildNonceCsp } = await importCspModule();
    const csp = buildNonceCsp("nonce-123");

    expect(getDirective(csp, "img-src")).toContain("https://icons.duckduckgo.com");
  });

  it("keeps the nonce CSP strict while allowing development eval support", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { buildNonceCsp } = await importCspModule();
    const csp = buildNonceCsp("nonce-123");

    expect(csp).toContain("script-src 'self' 'nonce-nonce-123' 'strict-dynamic'");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("adds only the configured Sentry DSN origin to connect-src", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_SENTRY_DSN",
      "https://public-key@o4511335749058560.ingest.us.sentry.io/4511335849132032"
    );
    const { buildNonceCsp } = await importCspModule();
    const connectSrc = getDirective(buildNonceCsp("nonce-123"), "connect-src");

    expect(connectSrc).toContain("https://o4511335749058560.ingest.us.sentry.io");
    expect(connectSrc).not.toContain("public-key");
    expect(connectSrc).not.toContain("4511335849132032");
    expect(getDirective(buildNonceCsp("nonce-123"), "img-src")).not.toContain("ingest.us.sentry.io");
  });

  it("ignores absent, invalid, and non-HTTPS Sentry DSNs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { buildNonceCsp: buildWithoutDsn } = await importCspModule();
    expect(getDirective(buildWithoutDsn("nonce-123"), "connect-src")).not.toContain("sentry.io");

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "not-a-url");
    const { buildNonceCsp: buildWithInvalidDsn } = await importCspModule();
    expect(getDirective(buildWithInvalidDsn("nonce-123"), "connect-src")).not.toContain("sentry.io");

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "http://public-key@o1.ingest.sentry.io/1");
    const { buildNonceCsp: buildWithHttpDsn } = await importCspModule();
    expect(getDirective(buildWithHttpDsn("nonce-123"), "connect-src")).not.toContain("ingest.sentry.io");
  });
});
