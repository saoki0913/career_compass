import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("LandingFooter source drift guard", () => {
  it("uses CSS custom properties for colors instead of hardcoded hex", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-muted-text)");
    expect(source).toContain("var(--lp-footer-bg)");
  });

  it("uses separate male and female character assets", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("08_male_character.png");
    expect(source).toContain("09_female_character.png");
    expect(source).not.toContain("girl-couple-happy.png");
  });

  it("sets character height to 320px", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("320px");
    expect(source).not.toMatch(/height:\s*"240px"/);
  });

  it("increases cityscape opacity to 0.10", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    expect(source).toContain("opacity-[0.10]");
    expect(source).not.toContain("opacity-[0.07]");
  });

  it("renders all four footer link columns", () => {
    const source = readSource("src/components/landing/LandingFooter.tsx");
    for (const title of ["サービス", "サポート", "規約", "公開ページ"]) {
      expect(source).toContain(title);
    }
  });
});
