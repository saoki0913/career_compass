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

  it("uses couple character asset via LP_SECTION_ASSETS registry", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("LP_SECTION_ASSETS.footer.couple");
    expect(source).toContain('height: "260px"');
    expect(source).toContain("bottom-[-58px]");
    expect(source).toContain('right: "max(24px, calc((100vw - 1500px) / 2 + 24px))"');
    expect(source).not.toContain("08_male_character.png");
    expect(source).not.toContain("09_female_character.png");
  });

  it("uses cityscape and branding assets via registries", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("LP_SECTION_ASSETS.footer.cityscape");
    expect(source).toContain("LOGO_ASSETS.textClean");
    expect(source).toContain("min-h-[390px]");
    expect(source).toContain('height: "190px"');
    expect(source).toContain("opacity: 0.18");
    expect(source).not.toContain("footer/compass-icon-navy.png");
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

  it("uses wider page gutters and reserves less space for the illustration", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("px-6 pb-6 pt-14 sm:px-10 lg:px-12 xl:px-14");
    expect(source).toContain("padding-right: 300px");
    expect(source).not.toContain("padding-right: 380px");
  });
});
