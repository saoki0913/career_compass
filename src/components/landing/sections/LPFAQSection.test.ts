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

  it("sizes girl character at 200px width", () => {
    expect(source).toContain('w-[200px]');
    // The old 180px width must not appear near girl-clasped
    expect(source).not.toContain('w-[180px]');
  });

  it("sizes boy character at 190px width", () => {
    expect(source).toContain('w-[190px]');
    // The old 170px width must not appear near boy-fistpump
    expect(source).not.toContain('w-[170px]');
  });

  it("includes dotted grid decoration", () => {
    expect(source).toContain(
      "faq_generated_assets_transparent/15_dotted_grid_decoration.png",
    );
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
