import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanyLogoSources, getCompanyAvatarColor, PIPELINE_COLUMNS } from "./dashboard-utils";

describe("getCompanyLogoSources", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "legacy-public-token");
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "legacy-public-client");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses corporateUrl domain as the primary Logo.dev source", () => {
    const result = getCompanyLogoSources("https://www.toyota.co.jp");
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=www.toyota.co.jp&policy=official-logo-v2"
    );
    expect(result?.fallbacks[0]).toBe(
      "/api/company-logos?provider=brandfetch&domain=www.toyota.co.jp&policy=official-logo-v2"
    );
  });

  it("returns null when corporateUrl is null and no estimated", () => {
    expect(getCompanyLogoSources(null)).toBeNull();
  });

  it("uses Logo.dev name lookup when corporateUrl is invalid", () => {
    expect(getCompanyLogoSources("not-a-url", null, "日本生命")?.primary).toBe(
      "/api/company-logos?provider=logo-dev-name&name=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD&policy=official-logo-v2"
    );
  });

  it("extracts logo hostnames from path URLs", () => {
    const result = getCompanyLogoSources("https://recruit.example.co.jp/careers");
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=recruit.example.co.jp&policy=official-logo-v2"
    );
  });

  it("extracts hostname from estimatedFaviconUrl when corporateUrl is null", () => {
    const result = getCompanyLogoSources(null, "https://www.smbc.co.jp/favicon.ico");
    expect(result).toBeNull();
  });

  it("does not use direct estimatedFaviconUrl as a logo fallback", () => {
    const result = getCompanyLogoSources(
      "https://www.toyota.co.jp",
      "https://www.estimated.co.jp/favicon.ico"
    );
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=www.toyota.co.jp&policy=official-logo-v2"
    );
    expect(JSON.stringify(result)).not.toContain("estimated.co.jp");
  });

  it("ignores direct estimatedFaviconUrl when corporateUrl is invalid", () => {
    const result = getCompanyLogoSources("not-a-url", "https://www.fallback.co.jp/icon.png");
    expect(result).toBeNull();
  });

  it("returns null when both are absent", () => {
    expect(getCompanyLogoSources(null, null)).toBeNull();
    expect(getCompanyLogoSources(null, undefined)).toBeNull();
  });

  it("uses local logo proxy instead of exposing publishable tokens", () => {
    const result = getCompanyLogoSources(null, null, "トヨタ", ["toyota.co.jp"]);
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=toyota.co.jp&policy=official-logo-v2"
    );
    expect(JSON.stringify(result)).not.toContain("legacy-public-token");
  });

  it("uses Logo.dev first and Brandfetch second for each logo domain", () => {
    const result = getCompanyLogoSources(null, null, "トヨタ", ["toyota.co.jp"]);

    expect(result?.primary).toBe("/api/company-logos?provider=logo-dev&domain=toyota.co.jp&policy=official-logo-v2");
    expect(result?.fallbacks[0]).toBe("/api/company-logos?provider=brandfetch&domain=toyota.co.jp&policy=official-logo-v2");
  });

  it("prioritizes estimated logo domains before corporateUrl", () => {
    const result = getCompanyLogoSources(
      "https://career-mc.co.jp",
      null,
      "三菱商事",
      ["mitsubishicorp.com"]
    );
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=mitsubishicorp.com&policy=official-logo-v2"
    );
  });

  it("tries all estimated logo domains through the auto proxy", () => {
    const result = getCompanyLogoSources(null, null, "三菱UFJ銀行", ["bk.mufg.jp", "mufgbank.co.jp"]);
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=bk.mufg.jp&policy=official-logo-v2"
    );
    expect(result?.fallbacks[0]).toBe(
      "/api/company-logos?provider=brandfetch&domain=bk.mufg.jp&policy=official-logo-v2"
    );
    expect(result?.fallbacks[1]).toBe(
      "/api/company-logos?provider=logo-dev&domain=mufgbank.co.jp&policy=official-logo-v2"
    );
  });

  it("keeps generated favicon providers behind the auto proxy", () => {
    const result = getCompanyLogoSources(null, null, "三菱UFJ銀行", ["bk.mufg.jp", "mufgbank.co.jp"]);
    expect(result?.primary).toContain("provider=logo-dev");
    expect(JSON.stringify(result)).not.toContain("provider=google-favicon");
    expect(JSON.stringify(result)).not.toContain("provider=duckduckgo-favicon");
  });

  it("uses Logo.dev name lookup when only company name is available", () => {
    const result = getCompanyLogoSources(null, null, "三菱商事");
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev-name&name=%E4%B8%89%E8%8F%B1%E5%95%86%E4%BA%8B&policy=official-logo-v2"
    );
    expect(result?.fallbacks[0]).toBe(
      "/api/company-logos?provider=brandfetch-name&name=%E4%B8%89%E8%8F%B1%E5%95%86%E4%BA%8B&policy=official-logo-v2"
    );
  });

  it("extracts the original domain from Google favicon URLs", () => {
    const result = getCompanyLogoSources(null, "https://www.google.com/s2/favicons?domain=example.co.jp&sz=64");
    expect(result).toBeNull();
  });

  it("uses curated official assets before provider domain lookups", () => {
    const result = getCompanyLogoSources(null, null, "三井不動産", ["mitsuifudosan.co.jp"], [
      {
        kind: "domain",
        domain: "mitsuifudosan.co.jp",
        source: "mapping.logo_domains",
        confidence: "high",
      },
      {
        kind: "official-asset",
        assetKey: "mitsuifudosan-corporate",
        source: "mapping.logo_asset_key",
        confidence: "high",
      },
      {
        kind: "allowlisted-name",
        nameKey: "mitsui-fudosan",
        source: "mapping.logo_names",
        confidence: "high",
      },
    ]);

    expect(result?.primary).toBe(
      "/api/company-logos?provider=official&asset=mitsuifudosan-corporate&policy=official-logo-v2"
    );
    expect(result?.fallbacks[0]).toBe(
      "/api/company-logos?provider=logo-dev&domain=mitsuifudosan.co.jp&policy=official-logo-v2"
    );
    expect(result?.fallbacks[1]).toBe(
      "/api/company-logos?provider=brandfetch&domain=mitsuifudosan.co.jp&policy=official-logo-v2"
    );
    expect(JSON.stringify(result)).not.toContain("logo-dev-name");
  });

  it("uses Logo.dev name lookup for Nippon Life when no domain is available", () => {
    const result = getCompanyLogoSources(null, null, "日本生命");
    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev-name&name=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD&policy=official-logo-v2"
    );
    expect(result?.fallbacks[0]).toBe(
      "/api/company-logos?provider=brandfetch-name&name=%E6%97%A5%E6%9C%AC%E7%94%9F%E5%91%BD&policy=official-logo-v2"
    );
  });

  it("allows low-confidence promoted domains but keeps them behind the proxy", () => {
    const result = getCompanyLogoSources(null, null, "三井住友銀行", null, [
      {
        kind: "domain",
        domain: "smbc.co.jp",
        source: "promoted.mapping.domains",
        confidence: "low",
      },
    ]);

    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=smbc.co.jp&policy=official-logo-v2"
    );
    expect(result?.fallbacks[0]).toBe(
      "/api/company-logos?provider=brandfetch&domain=smbc.co.jp&policy=official-logo-v2"
    );
  });

  it("does not let stale corporateUrl override verified logo candidates", () => {
    const result = getCompanyLogoSources("https://bk.mufg.jp", null, "三井物産", ["mitsui.com"]);

    expect(result?.primary).toBe(
      "/api/company-logos?provider=logo-dev&domain=mitsui.com&policy=official-logo-v2"
    );
    expect(JSON.stringify(result)).not.toContain("mufg");
  });
});

describe("PIPELINE_COLUMNS", () => {
  it("uses correct pipeline column labels", () => {
    const labels = PIPELINE_COLUMNS.map((c) => c.label);
    expect(labels).toEqual(["未応募", "ES・テスト", "面接・GD", "結果待ち", "内定・インターン合格"]);
  });
});

describe("getCompanyAvatarColor", () => {
  it("returns a color class string", () => {
    const result = getCompanyAvatarColor("三菱商事");
    expect(result).toMatch(/^bg-\w+-100 text-\w+-700$/);
  });

  it("returns the same color for the same name", () => {
    const a = getCompanyAvatarColor("ソニー");
    const b = getCompanyAvatarColor("ソニー");
    expect(a).toBe(b);
  });

  it("returns different colors for different names", () => {
    const colors = new Set(
      ["トヨタ", "ソニー", "三菱商事", "佐川急便", "楽天"].map(getCompanyAvatarColor)
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
