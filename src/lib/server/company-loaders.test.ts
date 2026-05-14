import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

describe("company-loaders", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-32-bytes-ok");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exports correctly", async () => {
    const mod = await import("./company-loaders");
    expect(mod.getCompaniesPageData).toBeDefined();
    expect(mod.getCompanyDetailPageData).toBeDefined();
  });

  it("serializes typed logo candidates instead of favicon URLs", async () => {
    const { estimateCompanyLogoProfile } = await import("./company-domain-estimator");
    const profile = estimateCompanyLogoProfile("三井不動産");

    expect(profile?.fallbackFaviconUrl).toBeNull();
    expect(profile?.candidates[0]).toEqual({
      kind: "domain",
      domain: "mitsuifudosan.co.jp",
      source: "mapping.logo_domains",
      confidence: "high",
    });
    expect(profile?.candidates).toContainEqual({
      kind: "official-asset",
      assetKey: "mitsuifudosan-corporate",
      source: "mapping.logo_asset_key",
      confidence: "high",
    });
  });
});
