import { afterEach, describe, expect, it, vi } from "vitest";

describe("trusted origins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("adds local origins when trusted origins are missing outside deployed environments", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");

    const { getTrustedOrigins } = await import("./trusted-origins");

    expect(getTrustedOrigins()).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("throws when trusted origins are missing in deployed environments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.shupass.jp");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");

    const { getTrustedOrigins } = await import("./trusted-origins");

    expect(() => getTrustedOrigins()).toThrow(/BETTER_AUTH_TRUSTED_ORIGINS/);
  });

  it("throws when deployed trusted origins contain localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.shupass.jp");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");

    const { getTrustedOrigins } = await import("./trusted-origins");

    expect(() => getTrustedOrigins()).toThrow(/localhost/);
  });

  it("requires canonical origins in production deployments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.shupass.jp");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://www.shupass.jp");

    const { getTrustedOrigins } = await import("./trusted-origins");

    expect(() => getTrustedOrigins()).toThrow(/https:\/\/shupass\.jp/);
  });

  it("accepts production canonical origins", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.shupass.jp");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://www.shupass.jp,https://shupass.jp");

    const { getTrustedOrigins } = await import("./trusted-origins");

    expect(getTrustedOrigins()).toEqual(["https://www.shupass.jp", "https://shupass.jp"]);
  });
});
