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

  it("uses reference design heading scale with component CTAs", () => {
    expect(source).toContain("lg:text-[64px]");
    expect(source).toContain("rounded-[12px]");
  });

  it("does not render an inline logo (handled by LandingHeader)", () => {
    expect(source).not.toContain("logo-icon.png");
  });

  it("uses Noto Sans JP as primary font (no Inter)", () => {
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toContain("'Inter'");
  });

  it("uses material decoration assets instead of blurred orbs", () => {
    expect(source).toContain("hero/icon-growth-chart.png");
    expect(source).toContain("hero/icon-star.png");
    expect(source).toContain("hero/icon-document-check.png");
    expect(source).not.toContain("filter: \"blur");
  });

  it("uses gradient primary button", () => {
    expect(source).toContain("linear-gradient(180deg, #0c82ff 0%, #0069e6 100%)");
  });

  it("implements trust badges as HTML pills", () => {
    expect(source).toContain("grid-cols-3");
    expect(source).toContain("min-h-[64px]");
    expect(source).toContain("sm:min-h-[56px]");
    expect(source).toContain("sm:h-[42px]");
    expect(source).toContain("sm:w-[42px]");
    expect(source).toContain("text-[10px]");
    expect(source).not.toContain("hidden text-[12px]");
  });

  it("uses card-not-required trust copy", () => {
    expect(source).toContain("無料プランあり");
    expect(source).not.toContain("カード登録不要");
    expect(source).not.toContain("30秒で簡単スタート");
  });

  it("includes AI accent underline bar", () => {
    // The blue underline bar below AI text
    expect(source).toContain("AIで一つずつ");
    expect(source).toContain("background: \"var(--lp-cta)\"");
  });

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="hero"');
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });
});
