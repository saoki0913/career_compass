import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("LPFAQSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/LPFAQSection.tsx",
  );

  it("uses CSS variable --lp-navy instead of hardcoded #1a1a2e", () => {
    expect(source).not.toContain('"#1a1a2e"');
    expect(source).toContain("var(--lp-navy)");
  });

  it("uses CSS variable --lp-cta instead of hardcoded #2563eb for main accents", () => {
    // Inline style usage of #2563eb should be replaced with var(--lp-cta)
    expect(source).toContain("var(--lp-cta)");
  });

  it("uses reference-style six-card FAQ grid with accordion", () => {
    expect(source).toContain("LANDING_PAGE_FAQS.slice(0, 6)");
    expect(source).toContain("xl:grid-cols-2");
    expect(source).toContain('"use client"');
    expect(source).toContain("aria-expanded");
  });

  it("places the right-side laptop character from the reference composition", () => {
    expect(source).toContain("characters/girl-at-laptop.png");
    expect(source).toContain("w-[330px]");
  });

  it("includes dotted grid decoration", () => {
    expect(source).toContain("decorative/dot-pattern-light.png");
  });

  it("includes sparkle decoration", () => {
    expect(source).toContain(
      "faq_generated_assets_transparent/18_sparkle_decoration.png",
    );
  });

  it("preserves LANDING_PAGE_FAQS import for JSON-LD data source", () => {
    expect(source).toContain("LANDING_PAGE_FAQS");
  });
});
