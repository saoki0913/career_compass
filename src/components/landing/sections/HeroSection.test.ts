import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HeroSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/HeroSection.tsx",
  );

  it("uses CSS variable tokens for navy and CTA", () => {
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-cta)");
  });

  it("does not use hardcoded dark color #1a1a2e", () => {
    expect(source).not.toContain('"#1a1a2e"');
  });

  it("uses shupass reference hero assets and keeps CTAs as links", () => {
    expect(source).toContain("lpSectionAsset");
    expect(source).toContain("product-mockup-pc-phone.png");
    expect(source).toContain("hero__trust-pill");
    expect(source).toContain('href="/login"');
    expect(source).toContain('href="#features"');
  });

  it("uses reference design heading at 56px with rounded-12px buttons", () => {
    // Reference design: 56px hero title, 12px border-radius buttons
    expect(source).toContain("fontSize: 56");
    expect(source).toContain("borderRadius: 12");
  });

  it("does not render an inline logo (handled by LandingHeader)", () => {
    expect(source).not.toContain("logo-icon.png");
  });

  it("uses Noto Sans JP as primary font (no Inter)", () => {
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toContain("'Inter'");
  });

  it("has floating icon animations", () => {
    expect(source).toContain("lp-floaty");
    expect(source).toContain("lp-hero-float");
  });

  it("uses gradient primary button", () => {
    expect(source).toContain("linear-gradient(180deg, #3a91ff 0%, #1f78ec 100%)");
  });

  it("implements trust badges as HTML pills", () => {
    expect(source).toContain("hero__trust-grid");
    expect(source).toContain("repeat(3,minmax(0,1fr))");
    expect(source).toContain("white-space:nowrap");
    expect(source).toContain("minHeight: 38");
    expect(source).toContain("width: 30");
    expect(source).toContain("height: 30");
    expect(source).toContain("fontSize: 13");
  });

  it("uses card-not-required trust copy", () => {
    expect(source).toContain("無料プランあり");
    expect(source).not.toContain("カード登録不要");
    expect(source).not.toContain("30秒で簡単スタート");
  });

  it("includes AI accent underline bar", () => {
    // The blue underline bar below AI text
    expect(source).toContain('width: "1.6em"');
    expect(source).toContain("background: \"#2680ff\"");
  });
});
