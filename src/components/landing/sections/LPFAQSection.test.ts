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

  it("uses CSS variable --lp-navy for heading", () => {
    expect(source).toContain("var(--lp-navy)");
  });

  it("uses CSS variable --lp-cta for accents", () => {
    expect(source).toContain("var(--lp-cta)");
  });

  it("uses Noto Sans JP font (no Inter)", () => {
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toMatch(/['"]Inter['"]/);
  });

  it("uses reference-style ten-item FAQ grid with accordion", () => {
    expect(source).toContain("const visibleFaqs = LANDING_PAGE_FAQS");
    expect(source).toContain("const faqColumns =");
    expect(source).not.toContain("LANDING_PAGE_FAQS.slice(0, 6)");
    expect(source).toContain('"use client"');
    expect(source).toContain("aria-expanded");
    expect(source).toContain("hidden={!isOpen}");
    expect(source).toContain("aria-hidden={!isOpen}");
  });

  it("preserves LANDING_PAGE_FAQS import for JSON-LD data source", () => {
    expect(source).toContain("LANDING_PAGE_FAQS");
  });

  it("uses new FAQ character image", () => {
    expect(source).toContain("faq/person-pc.png");
    expect(source).toContain("xl:grid-cols-[minmax(0,980px)_minmax(220px,1fr)]");
    expect(source).toContain("w-[270px]");
    expect(source).not.toContain("girl-at-laptop.png");
  });

  it("does not reference deleted decorative images", () => {
    expect(source).not.toContain("wave-line-1.png");
    expect(source).not.toContain("dot-pattern-light.png");
    expect(source).not.toContain("18_sparkle_decoration.png");
    expect(source).not.toContain("curved-lines-dot.png");
  });
});
