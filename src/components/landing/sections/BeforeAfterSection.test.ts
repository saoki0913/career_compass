import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("BeforeAfterSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/BeforeAfterSection.tsx",
  );

  it("is a client component with use client directive", () => {
    expect(source).toMatch(/^"use client"/);
  });

  it("uses ResizeObserver for responsive stage scaling", () => {
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("useRef");
    expect(source).toContain("useEffect");
  });

  it("uses fixed stage dimensions of 1200x600", () => {
    expect(source).toContain("STAGE_W = 1200");
    expect(source).toContain("STAGE_H = 600");
  });

  it("uses lpSectionAsset helper for all images", () => {
    expect(source).toContain('from "@/lib/marketing/lp-assets"');
    expect(source).toContain("lpSectionAsset");
  });

  it("uses new before-after character and mockup assets", () => {
    expect(source).toContain("before-after/person-worried.png");
    expect(source).toContain("before-after/person-cheerful.png");
    expect(source).toContain("before-after/product-mockup.png");
    expect(source).not.toContain("shupass-v2/ba/illust-worried");
    expect(source).not.toContain("shupass-v2/ba/illust-cheerful");
    expect(source).not.toContain("shupass-v2/ba/arrow.png");
  });

  it("uses HTML headings instead of heading images", () => {
    expect(source).toContain("就活Passで、ここまで");
    expect(source).toContain("変わる。");
    expect(source).toContain("迷わず・着実に進める");
    expect(source).not.toContain("heading-kawaru.png");
    expect(source).not.toContain("heading-junbi.png");
  });

  it("uses inline SVG arrow instead of PNG", () => {
    expect(source).toContain("ba-arrow-grad");
    expect(source).not.toContain("before-after/arrow.png");
  });

  it("uses reference panel dimensions with correct border-radius", () => {
    expect(source).toContain("width: 530");
    expect(source).toContain("height: 510");
    expect(source).toContain("borderRadius: 22");
  });

  it("uses correct badge colors: gray for Before, blue for After", () => {
    expect(source).toContain("#8a8f96");
    expect(source).toContain("#2d6eff");
  });

  it("uses reference gradient background for section", () => {
    expect(source).toContain(
      "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
    );
  });

  it("uses Noto Sans JP font family", () => {
    expect(source).toContain("Noto Sans JP");
  });

  it("renders all 8 inline SVG icon components", () => {
    expect(source).toContain("IconTangle");
    expect(source).toContain("IconPapers");
    expect(source).toContain("IconClock");
    expect(source).toContain("IconSad");
    expect(source).toContain("IconCheckSparkle");
    expect(source).toContain("IconDocCheck");
    expect(source).toContain("IconChartUp");
    expect(source).toContain("IconSmile");
  });

  it("uses correct before icon stroke color #3a3f47", () => {
    expect(source).toContain('"#3a3f47"');
  });

  it("uses correct after icon stroke/fill color #2d6eff", () => {
    // Already asserted above, but verify it appears in SVG context
    const matches = source.match(/#2d6eff/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(5);
  });

  it("has enlarged list icon circle sizes (44px)", () => {
    expect(source).toContain("width: 44");
    expect(source).toContain("height: 44");
  });

  it("keeps the footer copy close to the comparison stage", () => {
    expect(source).toContain("marginTop: -12");
  });

  it("renders sparkle characters", () => {
    // Unicode sparkle &#10022; = ✦
    expect(source).toContain("&#10022;");
  });

  it("includes wave SVG decoration at bottom", () => {
    expect(source).toContain('viewBox="0 0 1440 130"');
    expect(source).toContain("#e2ecff");
    expect(source).toContain("#cfdcf7");
  });

  it("has section id='before-after'", () => {
    expect(source).toContain('id="before-after"');
  });

  it("exports BeforeAfterSection", () => {
    expect(source).toContain("export function BeforeAfterSection");
  });
});
