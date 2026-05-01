import { readFileSync } from "node:fs";
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
    expect(source).toContain("card-es-writing.png");
    expect(source).toContain("card-deadline-management.png");
    expect(source).toContain("card-interview-anxiety.png");
    expect(source).toContain("card-info-collection.png");
  });

  it("includes decorative deco assets", () => {
    expect(source).toContain("decoration-dots-circle.png");
    expect(source).toContain("decoration-swirl.png");
    expect(source).toContain("decoration-bar-chart.png");
    expect(source).toContain("decoration-star.png");
  });

  it("uses Noto Sans JP without Inter for font family", () => {
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toContain("'Inter'");
  });

  it("includes sr-only spans for accessibility", () => {
    expect(source).toContain("sr-only");
    expect(source).toContain("ESがうまく書けない — 何を書けばいいか分からず");
    expect(source).toContain(
      "締切や選考の管理が大変 — 企業ごとの予定がバラバラで",
    );
    expect(source).toContain(
      "面接に自信が持てない — 何を聞かれるか分からず",
    );
    expect(source).toContain(
      "情報収集に時間がかかる — 企業情報や応募状況を整理できず",
    );
  });

  it("uses plain img tags instead of next/image", () => {
    expect(source).not.toContain("from \"next/image\"");
    expect(source).not.toContain("from 'next/image'");
    expect(source).not.toContain("<Image ");
  });

  it("has correct card styling from reference CSS", () => {
    expect(source).toContain("borderRadius: 22");
    expect(source).toContain("rgba(20,50,110,0.06)");
    expect(source).toContain("#eaf0fa");
    expect(source).toContain("transition");
  });

  it("has hover transform effect", () => {
    expect(source).toContain("translateY(-6px)");
    expect(source).toContain("rgba(20,50,110,0.12)");
  });

  it("has 4-column grid layout", () => {
    expect(source).toContain("repeat(4, 1fr)");
  });

  it("has responsive breakpoint at 900px for 2-column grid", () => {
    expect(source).toContain("max-width: 900px");
    expect(source).toContain("repeat(2, 1fr)");
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

  it("uses #f5f9ff background color from reference", () => {
    expect(source).toContain("#f5f9ff");
  });

  it("includes sparkle SVG decorations in footer", () => {
    expect(source).toContain("#6aa9ff");
    expect(source).toContain('strokeWidth="2.2"');
    expect(source).toContain('strokeLinecap="round"');
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
});
