import { afterEach, describe, expect, it, vi } from "vitest";

describe("app-url", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses localhost fallback outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");

    const { getAppUrl } = await import("./app-url");

    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("fails closed when production app url is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");

    const { getAppUrl } = await import("./app-url");

    expect(() => getAppUrl()).toThrow(/NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL/);
  });

  it("prefers an explicitly configured public app url", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.shupass.jp/");
    vi.stubEnv("BETTER_AUTH_URL", "");

    const { getAppUrl } = await import("./app-url");

    expect(getAppUrl()).toBe("https://www.shupass.jp");
  });

  it("uses configured public app url for browser auth outside localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.shupass.jp/");
    vi.stubGlobal("window", { location: { origin: "https://shupass.jp" } });

    const { getClientAuthBaseUrl } = await import("./app-url");

    expect(getClientAuthBaseUrl()).toBe("https://www.shupass.jp");
  });

  it("keeps localhost browser auth origin for local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.shupass.jp/");
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });

    const { getClientAuthBaseUrl } = await import("./app-url");

    expect(getClientAuthBaseUrl()).toBe("http://localhost:3000");
  });
});
