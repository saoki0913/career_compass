import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("LandingFooter source drift guard", () => {
  it("uses CSS custom properties for key colors", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-muted-text)");
    expect(source).toContain("var(--lp-footer-bg)");
  });

  it("uses Noto Sans JP font (no Inter)", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toMatch(/['"]Inter['"]/);
  });

  it("uses single couple character asset", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("footer/couple.png");
    expect(source).toContain('height: "340px"');
    expect(source).toContain('right: "max(24px, calc((100vw - 1500px) / 2 + 24px))"');
    expect(source).not.toContain("08_male_character.png");
    expect(source).not.toContain("09_female_character.png");
  });

  it("uses new cityscape and branding assets", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("footer/cityscape.png");
    expect(source).toContain("footer/compass-icon-navy.png");
    expect(source).toContain("min-h-[430px]");
    expect(source).not.toContain("star-sparkle-1.png");
    expect(source).not.toContain("wave-corner.png");
  });

  it("renders all four footer link columns", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    for (const title of ["サービス", "サポート", "規約", "公開ページ"]) {
      expect(source).toContain(title);
    }
  });

  it("uses var(--lp-cta) for CTA accent", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("var(--lp-cta)");
  });

  it("keeps legal links in a dedicated one-column stack", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("footer-legal-column");
    expect(source).toContain("特定商取引法に基づく表記");
  });
});
