import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("marketing home page regressions", () => {
  it("keeps the landing page on a single unified composition", () => {
    const source = readSource("src/app/(marketing)/page.tsx");

    expect(source).not.toContain("_lp_variant");
    expect(source).not.toContain("getLPVariant");
    expect(source).not.toContain("HeroSectionA");
    expect(source).not.toContain("HeroSectionB");
    expect(source).not.toContain("HeroSectionC");
    expect(source).not.toContain("ProductShowcaseA");
    expect(source).not.toContain("ProductShowcaseB");
    expect(source).not.toContain("ProductShowcaseC");
  });

  it("renders the core landing sections in order", () => {
    const source = readSource("src/app/(marketing)/page.tsx");

    expect(source).toContain("<HeroSection />");
    expect(source).toContain("<TrustStripSection />");
    expect(source).toContain("<PainPointsSection />");
    expect(source).toContain("<BeforeAfterSection />");
    expect(source).toContain("<FeatureESSection />");
    expect(source).toContain("<FeatureManagementSection />");
    expect(source).toContain("<FeatureInterviewSection />");
    expect(source).toContain("<ComparisonSection />");
    expect(source).toContain("<PricingSection />");
    expect(source).toContain("<FAQSection />");
    expect(source).toContain("<FinalCTASection />");
    expect(source).toContain("<StickyCTABar />");
  });

  it("exports page-specific metadata via createMarketingMetadata", () => {
    const source = readSource("src/app/(marketing)/page.tsx");

    expect(source).toContain("export const metadata");
    expect(source).toContain("createMarketingMetadata");
    expect(source).toContain('getMarketingDescription("/")');
  });
});

describe("marketing home page metadata", () => {
  it("uses the LP-specific description from the SSOT helper", async () => {
    const [{ metadata }, seoMod] = await Promise.all([
      import("./page"),
      import("@/lib/seo/site-structured-data"),
    ]);
    expect(metadata.description).toBe(seoMod.getMarketingDescription("/"));
  });

  it("has a keyword-plus-target-persona title", async () => {
    const { metadata } = await import("./page");
    const title = typeof metadata.title === "string" ? metadata.title : "";
    expect(title).toMatch(/就活Pass/);
    expect(title).toMatch(/ES添削/);
    expect(title).toMatch(/志望動機/);
  });

  it("sets canonical path to '/'", async () => {
    const { metadata } = await import("./page");
    expect(metadata.alternates?.canonical).toBe("/");
  });
});
