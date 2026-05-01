import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HowToUseSection composite card guard", () => {
  const source = readSource(
    "src/components/landing/sections/HowToUseSection.tsx",
  );

  it("has section id how-it-works", () => {
    expect(source).toContain('id="how-it-works"');
  });

  it("uses composite card images instead of individual person/screen assets", () => {
    expect(source).toContain("step-register-company.png");
    expect(source).toContain("step-ai-es-review.png");
    expect(source).toContain("step-interview-prep.png");
    expect(source).toContain("step-deadline-schedule.png");
    expect(source).not.toContain("person-1");
    expect(source).not.toContain("screen-company-form");
    expect(source).not.toContain("shupass-v2/howto/");
  });

  it("provides sr-only text for accessibility", () => {
    expect(source).toContain("sr-only");
  });

  it("embeds step data directly", () => {
    expect(source).toContain("const STEPS");
  });

  it("does not use lucide icons", () => {
    expect(source).not.toContain("lucide");
  });

  it("uses a 4-column grid layout for desktop", () => {
    expect(source).toContain("minmax(0, 1fr) 54px minmax(0, 1fr)");
    expect(source).toContain("gap: 0");
    expect(source).toContain("height: 350");
    expect(source).toContain('objectFit: "contain"');
  });

  it("uses lpSectionAsset for card images", () => {
    expect(source).toContain("lpSectionAsset");
  });

  it("uses Noto Sans JP font family", () => {
    expect(source).toContain("Noto Sans JP");
  });

  it("includes wave SVG at bottom", () => {
    expect(source).toContain('viewBox="0 0 1440 130"');
    expect(source).toContain("#e2ecff");
    expect(source).toContain("#cfdcf7");
    expect(source).toContain("#7aa3ef");
  });

  it("has responsive breakpoints at 1279px, 1100px and 640px", () => {
    expect(source).toContain("max-width: 1279px");
    expect(source).toContain("max-width: 1100px");
    expect(source).toContain("max-width: 640px");
  });

  it("contains all four step titles in sr-only or alt text", () => {
    expect(source).toContain("企業を登録");
    expect(source).toContain("AIでESを作成・添削");
    expect(source).toContain("面接対策を進める");
    expect(source).toContain("締切・予定を管理");
  });

  it("has section title with sparkle decoration", () => {
    expect(source).toContain("使い方は、");
    expect(source).toContain("シンプル。");
    expect(source).toContain('rotate(-30deg)');
    expect(source).toContain('rotate(-70deg)');
    expect(source).toContain('rotate(20deg)');
  });

  it("has footer text", () => {
    expect(source).toContain("準備・対策・管理まで、就活Passでまとめて進められます。");
  });

  it("does not contain deleted HowtoIcon function", () => {
    expect(source).not.toContain("function HowtoIcon");
    expect(source).not.toContain("HowtoGridItem");
  });
});
