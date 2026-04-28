import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanyLogoSources, getCompanyAvatarColor } from "./dashboard-utils";

describe("getCompanyLogoSources", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns primary + fallback URLs for valid corporateUrl", () => {
    const result = getCompanyLogoSources("https://www.toyota.co.jp");
    expect(result).toEqual({
      primary: "https://www.google.com/s2/favicons?domain=www.toyota.co.jp&sz=128",
      fallbacks: ["https://icons.duckduckgo.com/ip3/www.toyota.co.jp.ico"],
    });
  });

  it("returns null when corporateUrl is null and no estimated", () => {
    expect(getCompanyLogoSources(null)).toBeNull();
  });

  it("returns null for invalid URL without estimated fallback", () => {
    expect(getCompanyLogoSources("not-a-url")).toBeNull();
  });

  it("extracts hostname from path URLs", () => {
    const result = getCompanyLogoSources("https://recruit.example.co.jp/careers");
    expect(result?.primary).toBe(
      "https://www.google.com/s2/favicons?domain=recruit.example.co.jp&sz=128"
    );
  });

  it("extracts hostname from estimatedFaviconUrl when corporateUrl is null", () => {
    const result = getCompanyLogoSources(null, "https://www.smbc.co.jp/favicon.ico");
    expect(result?.primary).toBe("https://www.smbc.co.jp/favicon.ico");
    expect(result?.fallbacks[0]).toBe(
      "https://www.google.com/s2/favicons?domain=www.smbc.co.jp&sz=128"
    );
  });

  it("prefers direct estimatedFaviconUrl over generated domain fallbacks", () => {
    const result = getCompanyLogoSources(
      "https://www.toyota.co.jp",
      "https://www.estimated.co.jp/favicon.ico"
    );
    expect(result?.primary).toBe("https://www.estimated.co.jp/favicon.ico");
    expect(result?.fallbacks[0]).toContain("www.toyota.co.jp");
  });

  it("uses direct estimatedFaviconUrl when corporateUrl is invalid", () => {
    const result = getCompanyLogoSources("not-a-url", "https://www.fallback.co.jp/icon.png");
    expect(result?.primary).toBe("https://www.fallback.co.jp/icon.png");
    expect(result?.fallbacks[0]).toContain("www.fallback.co.jp");
  });

  it("returns null when both are absent", () => {
    expect(getCompanyLogoSources(null, null)).toBeNull();
    expect(getCompanyLogoSources(null, undefined)).toBeNull();
  });

  it("prioritizes Logo.dev when publishable token is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "logo-token");
    const result = getCompanyLogoSources("https://www.toyota.co.jp");
    expect(result?.primary).toBe(
      "https://img.logo.dev/www.toyota.co.jp?token=logo-token&size=128&format=png&retina=true&fallback=404"
    );
    expect(result?.fallbacks).toContain("https://www.google.com/s2/favicons?domain=www.toyota.co.jp&sz=128");
  });

  it("uses Brandfetch after Logo.dev when both providers are configured", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "logo-token");
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "brandfetch-client");
    const result = getCompanyLogoSources("https://www.toyota.co.jp");

    expect(result?.primary).toContain("https://img.logo.dev/www.toyota.co.jp");
    expect(result?.fallbacks[0]).toBe(
      "https://cdn.brandfetch.io/domain/www.toyota.co.jp/w/128/h/128/type/icon/fallback/404?c=brandfetch-client"
    );
  });

  it("prioritizes estimated logo domains before corporateUrl", () => {
    const result = getCompanyLogoSources(
      "https://career-mc.co.jp",
      null,
      "三菱商事",
      ["mitsubishicorp.com"]
    );
    expect(result?.primary).toBe(
      "https://www.google.com/s2/favicons?domain=mitsubishicorp.com&sz=128"
    );
    expect(result?.fallbacks).toContain(
      "https://www.google.com/s2/favicons?domain=career-mc.co.jp&sz=128"
    );
  });

  it("tries all estimated logo domains before generated favicon fallbacks", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "logo-token");
    const result = getCompanyLogoSources(null, null, "三菱UFJ銀行", ["bk.mufg.jp", "mufgbank.co.jp"]);
    expect(result?.primary).toBe(
      "https://img.logo.dev/bk.mufg.jp?token=logo-token&size=128&format=png&retina=true&fallback=404"
    );
    expect(result?.fallbacks[0]).toBe(
      "https://img.logo.dev/mufgbank.co.jp?token=logo-token&size=128&format=png&retina=true&fallback=404"
    );
    expect(result?.fallbacks).toContain(
      "https://img.logo.dev/name/%E4%B8%89%E8%8F%B1UFJ%E9%8A%80%E8%A1%8C?token=logo-token&size=128&format=png&retina=true&fallback=404"
    );
  });

  it("tries Google favicon for all logo domains before DuckDuckGo fallbacks", () => {
    const result = getCompanyLogoSources(null, null, "三菱UFJ銀行", ["bk.mufg.jp", "mufgbank.co.jp"]);
    expect(result?.primary).toBe("https://www.google.com/s2/favicons?domain=bk.mufg.jp&sz=128");
    expect(result?.fallbacks[0]).toBe("https://www.google.com/s2/favicons?domain=mufgbank.co.jp&sz=128");
    expect(result?.fallbacks[1]).toBe("https://icons.duckduckgo.com/ip3/bk.mufg.jp.ico");
  });

  it("uses Logo.dev name lookup when only company name is available", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "logo-token");
    const result = getCompanyLogoSources(null, null, "三菱商事");
    expect(result?.primary).toBe(
      "https://img.logo.dev/name/%E4%B8%89%E8%8F%B1%E5%95%86%E4%BA%8B?token=logo-token&size=128&format=png&retina=true&fallback=404"
    );
  });

  it("extracts the original domain from Google favicon URLs", () => {
    const result = getCompanyLogoSources(null, "https://www.google.com/s2/favicons?domain=example.co.jp&sz=64");
    expect(result?.primary).toBe("https://www.google.com/s2/favicons?domain=example.co.jp&sz=64");
    expect(result?.fallbacks).toContain("https://icons.duckduckgo.com/ip3/example.co.jp.ico");
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
