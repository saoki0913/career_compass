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
    expect(source).toContain("<ProductShowcase />");
    expect(source).toContain("<HowItWorksSection />");
    expect(source).toContain("<PricingSection />");
    expect(source).toContain("<FAQSection />");
    expect(source).toContain("<CTASectionVariant />");
  });
});
