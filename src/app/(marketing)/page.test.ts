import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function collectTsxFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = readdirSync(absoluteDir);
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry);
    const absolutePath = path.join(repoRoot, relativePath);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...collectTsxFiles(relativePath));
      continue;
    }

    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      files.push(relativePath);
    }
  }

  return files;
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
    expect(source).not.toContain("PixelPerfectLandingPage");
  });

  it("renders the core landing sections in order", () => {
    const pageSource = readSource("src/app/(marketing)/page.tsx");
    const landingSource = readSource("src/components/landing/LandingPage.tsx");

    expect(pageSource).toContain("<LandingPage />");
    expect(pageSource).toContain("<FaqJsonLd faqs={LANDING_PAGE_FAQS} />");

    const expectedOrder = [
      "<LandingHeader />",
      "<HeroSection />",
      "<PainPointsSection />",
      "<FeaturesSection />",
      "<HowToUseSection />",
      "<BeforeAfterSection />",
      "<PricingSection />",
      "<LPFAQSection />",
      "<LandingFooter />",
    ];
    let previousIndex = -1;
    for (const marker of expectedOrder) {
      const index = landingSource.indexOf(marker);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it("does not render the reference LP images as production UI", () => {
    const landingFiles = collectTsxFiles("src/components/landing");

    for (const file of landingFiles) {
      const source = readSource(file);
      expect(source).not.toContain("/marketing/LP/LP.png");
      expect(source).not.toContain("/marketing/LP/section_image");
    }
  });

  it("does not keep outdated root LP card-free or duplicated before-after copy", () => {
    const rootLpFiles = [
      "src/components/landing/sections/BeforeAfterSection.tsx",
      "src/components/landing/sections/PricingSection.tsx",
      "src/components/landing/sections/LPFAQSection.tsx",
      "src/lib/marketing/landing-faqs.ts",
      "src/lib/seo/site-structured-data.ts",
    ];

    for (const file of rootLpFiles) {
      const source = readSource(file);
      expect(source).not.toContain("もう迷わない！");
      expect(source).not.toContain("クレカ登録不要");
      expect(source).not.toContain("カード登録不要");
      expect(source).not.toContain("クレジットカード登録なしで始められます");
    }
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
