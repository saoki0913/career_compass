import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanyAvatarColor, getCompanyLogoSources } from "@/lib/dashboard-utils";

describe("CompanyProgressCard", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses deterministic avatar colors for company names", () => {
    const color1 = getCompanyAvatarColor("三菱商事");
    const color2 = getCompanyAvatarColor("三菱商事");
    expect(color1).toBe(color2);
  });

  it("generates different colors for different companies", () => {
    const colors = new Set(
      ["トヨタ", "ソニー", "楽天", "任天堂", "パナソニック"].map(getCompanyAvatarColor)
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it("shows max 3 companies per pipeline column", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./CompanyListCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("slice(0, 3)");
    expect(source).not.toContain("slice(0, 2)");
  });

  it("uses referrerPolicy on favicon img", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./CompanyListCard.tsx", import.meta.url), "utf8");
    expect(source).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  });

  it("passes estimated logo domains to logo source builder", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./CompanyListCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("company.estimatedLogoDomains");
  });

  it("prioritizes estimated favicon URL before domain fallbacks", () => {
    const urls = getCompanyLogoSources("https://example.com", "https://assets.example.com/favicon.png");
    expect(urls?.primary).toBe("https://assets.example.com/favicon.png");
    expect(urls?.fallbacks[0]).toContain("google.com/s2/favicons");
    expect(urls?.fallbacks.some((url) => url.includes("icons.duckduckgo.com"))).toBe(true);
  });
});
