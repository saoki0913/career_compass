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

  it("uses new FAQ character image with absolute positioning", () => {
    expect(source).toContain("faq/person-pc.png");
    expect(source).toContain("xl:mr-[260px]");
    expect(source).toContain("w-[220px]");
    expect(source).not.toContain("xl:items-end");
    expect(source).not.toContain("girl-at-laptop.png");
  });

  it("keeps the FAQ illustration independent from accordion height changes", () => {
    expect(source).toContain("overflow-clip");
    expect(source).not.toContain("overflow-hidden");
    expect(source).toContain("absolute bottom-0 right-0");
    expect(source).not.toContain("sticky bottom-8");
    expect(source).not.toContain("xl:grid-cols-[1fr_240px]");
    expect(source).not.toContain("xl:pb-4");
    expect(source).not.toContain("xl:pr-[250px]");
    expect(source).toContain("right-[182px]");
    expect(source).toContain("top-[82px]");
    expect(source).toContain("h-11 w-11");
    expect(source).toContain("text-[24px]");
    expect(source).not.toContain("translateY");
    expect(source).not.toContain("animate-");
  });

  it("anchors illustration with top positioning to prevent accordion jump", () => {
    expect(source).toContain("right-14 top-[200px]");
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });

  it("does not reference deleted decorative images", () => {
    expect(source).not.toContain("wave-line-1.png");
    expect(source).not.toContain("dot-pattern-light.png");
    expect(source).not.toContain("18_sparkle_decoration.png");
    expect(source).not.toContain("curved-lines-dot.png");
  });

  it("uses available FAQ decoration assets", () => {
    expect(source).toContain("faq/01_dots_grid_large.png");
    expect(source).toContain("faq/06_document_check.png");
    expect(source).toContain("faq/08_curve_simple.png");
  });

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="faq"');
    expect(source).toContain("scroll-mt-[92px]");
  });
});
