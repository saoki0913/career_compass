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

  it("uses fixed stage dimensions of 1440x540", () => {
    expect(source).toContain("STAGE_W = 1440");
    expect(source).toContain("STAGE_H = 540");
  });

  it("keeps the scaled comparison stage for wide desktop only", () => {
    expect(source).toContain("min-[1360px]:block");
    expect(source).toContain("min-[1360px]:hidden");
    expect(source).not.toContain("lg:block");
    expect(source).not.toContain("lg:hidden");
  });

  it("uses lpSectionAsset helper from image-registry", () => {
    expect(source).toContain('from "@/lib/assets/image-registry"');
    expect(source).toContain("lpSectionAsset");
  });

  it("uses before-after character assets via LP_SECTION_ASSETS registry", () => {
    expect(source).toContain("LP_SECTION_ASSETS.beforeAfter.personWorried");
    expect(source).toContain("LP_SECTION_ASSETS.beforeAfter.personCheerful");
    expect(source).not.toContain("before-after/product-mockup.png");
    expect(source).not.toContain("shupass-v2/ba/illust-worried");
    expect(source).not.toContain("shupass-v2/ba/illust-cheerful");
    expect(source).not.toContain("shupass-v2/ba/arrow.png");
  });

  it("uses HTML headings instead of heading images", () => {
    expect(source).toContain("就活Passで、");
    expect(source).toContain("変わる。");
    expect(source).toContain("迷わず・着実に進める");
    expect(source).not.toContain("heading-kawaru.png");
    expect(source).not.toContain("heading-junbi.png");
  });

  it("uses solid inline SVG arrow between panels instead of image", () => {
    expect(source).not.toContain("before-after/arrow.png");
    expect(source).toContain("function BeforeAfterArrow");
    expect(source).toContain('orientation: "horizontal" | "vertical"');
    expect(source).toContain("left-[586px]");
    expect(source).toContain("w-[168px]");
    expect(source).toContain("ba-arrow-shadow");
    expect(source).toContain('fill="var(--lp-cta)"');
    expect(source).not.toContain("ba-arrow-grad");
    expect(source).not.toContain("ba-arrow-shine");
    expect(source).not.toContain("#d7efff");
    expect(source).not.toContain("linearGradient");
    expect(source).not.toContain("border-l-[16px]");
  });

  it("uses responsive vertical arrow height for mobile", () => {
    expect(source).toContain("h-[80px]");
    expect(source).toContain("sm:h-[118px]");
  });

  it("uses responsive mobile person image with compact height", () => {
    expect(source).toContain("h-[200px]");
    expect(source).toContain("sm:h-[280px]");
  });

  it("uses responsive section padding instead of inline padding", () => {
    expect(source).toContain("py-10");
    expect(source).toContain("lg:pt-[62px]");
    expect(source).toContain("lg:pb-[54px]");
    expect(source).not.toContain('padding: "62px 0 54px"');
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });

  it("uses reference panel dimensions with correct border-radius", () => {
    expect(source).toContain("w-[580px]");
    expect(source).toContain("w-[650px]");
    expect(source).toContain("h-[500px]");
    expect(source).toContain("rounded-[22px]");
  });

  it("uses correct badge colors: gray for Before, blue for After", () => {
    expect(source).toContain("#8a8f96");
    expect(source).toContain("var(--lp-cta)");
    expect(source).toContain("px-3.5 py-1 text-[14px]");
  });

  it("uses reference gradient background for section", () => {
    expect(source).toContain(
      "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
    );
  });

  it("uses Noto Sans JP font family", () => {
    expect(source).toContain("Noto Sans JP");
  });

  it("renders before/after icon data with 8 items total", () => {
    expect(source).toContain("beforeItems");
    expect(source).toContain("afterItems");
    expect(source).toContain("CheckCircle2");
    expect(source).toContain("FileCheck2");
  });

  it("uses correct before icon stroke color #3a3f47", () => {
    expect(source).toContain("#3a3f47");
  });

  it("uses correct after icon color token", () => {
    const matches = source.match(/var\(--lp-cta\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(5);
  });

  it("has enlarged list icon circle sizes (44px)", () => {
    expect(source).toContain("h-12 w-12");
  });

  it("keeps panels, arrow, and text boxes from overlapping", () => {
    expect(source).toContain("left-[586px]");
    expect(source).toContain("top-[204px]");
    expect(source).toContain("w-[168px]");
    expect(source).toContain("w-[310px]");
    expect(source).toContain("w-[330px]");
    expect(source).toContain("min-h-[78px]");
    expect(source).toContain("text-[18px] font-black");
    expect(source).toContain("h-[400px]");
    expect(source).toContain("h-[370px]");
    expect(source).toContain("bottom-[-20px] left-[-6px]");
    expect(source).toContain("right-7 top-20");
    expect(source).not.toContain("w-[610px]");
    expect(source).not.toContain("w-[690px]");
  });

  it("keeps the footer copy close to the comparison stage", () => {
    expect(source).toContain("mt-8 text-center");
  });

  it("does not duplicate confidence copy that already exists in the visual asset", () => {
    expect(source).not.toContain("もう迷わない！");
    expect(source).not.toContain("もう迷わない");
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

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="before-after"');
  });
});
