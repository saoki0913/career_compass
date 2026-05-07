import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("PainPointsSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/PainPointsSection.tsx",
  );

  it("uses CSS variable tokens for primary color", () => {
    expect(source).toContain("var(--lp-cta)");
  });

  it("uses the section asset helper", () => {
    expect(source).toContain("lpSectionAsset");
  });

  it("renders full-image worry cards from the normalized sections folder", () => {
    for (const file of [
      "processed/image4_nobg.png",
      "processed/image5_nobg.png",
      "processed/image6_nobg.png",
      "processed/image7_nobg.png",
    ]) {
      expect(source).toContain(file);
      expect(existsSync(path.join(repoRoot, "public/marketing/LP/sections/worries", file))).toBe(true);
    }
    expect(source).not.toContain("card-es-writing.png");
    expect(source).not.toContain("decoration-dots-circle.png");
  });

  it("uses Noto Sans JP without Inter for font family", () => {
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toContain("'Inter'");
  });

  it("keeps image illustrations presentational and copy in HTML", () => {
    expect(source).toContain('alt=""');
    expect(source).toContain('role="presentation"');
    expect(source).not.toContain("sr-only");
    expect(source).toContain("ESがうまく書けない");
    expect(source).toContain("何を書けばいいか分からず");
    expect(source).toContain("締切や選考の管理が大変");
    expect(source).toContain("企業ごとの予定がバラバラで");
    expect(source).toContain("面接に自信が持てない");
    expect(source).toContain("本番でうまく話せるか不安");
    expect(source).toContain("情報収集に時間がかかる");
    expect(source).toContain("企業情報や応募状況を整理できず");
  });

  it("uses plain img tags instead of next/image", () => {
    expect(source).not.toContain("from \"next/image\"");
    expect(source).not.toContain("from 'next/image'");
    expect(source).not.toContain("<Image ");
  });

  it("has correct card styling from reference CSS", () => {
    expect(source).toContain("rounded-2xl");
    expect(source).toContain("rgba(20,50,110,0.14)");
    expect(source).toContain("#e5f0ff");
    expect(source).toContain("transition");
  });

  it("has hover transform effect", () => {
    expect(source).toContain("hover:-translate-y-1");
  });

  it("has 4-column grid layout", () => {
    expect(source).toContain("xl:grid-cols-4");
  });

  it("has responsive breakpoint at 900px for 2-column grid", () => {
    expect(source).toContain("md:grid-cols-2");
  });

  it("uses palt font feature settings", () => {
    expect(source).toContain('"palt"');
  });

  it("exports PainPointsSection function", () => {
    expect(source).toContain("export function PainPointsSection");
  });

  it("has section id worries", () => {
    expect(source).toContain('id="worries"');
  });

  it("uses #f7fbff background color from reference", () => {
    expect(source).toContain("#f7fbff");
  });

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="worries"');
  });

  it("does not use old character image assets", () => {
    expect(source).not.toContain("boy-writing.png");
    expect(source).not.toContain("girl-at-laptop.png");
    expect(source).not.toContain("boy-thinking-hoodie.png");
    expect(source).not.toContain("girl-phone-thinking.png");
  });

  it("does not use old icon assets", () => {
    expect(source).not.toContain("icons-line/");
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });
});
