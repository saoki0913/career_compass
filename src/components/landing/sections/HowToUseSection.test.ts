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
    expect(source).toContain("scroll-mt-[92px]");
  });

  it("uses composite card images via LP_SECTION_ASSETS registry", () => {
    expect(source).toContain("LP_SECTION_ASSETS.howTo.stepRegisterCompany");
    expect(source).toContain("LP_SECTION_ASSETS.howTo.stepAiEsReview");
    expect(source).toContain("LP_SECTION_ASSETS.howTo.stepInterviewPrep");
    expect(source).toContain("LP_SECTION_ASSETS.howTo.stepDeadlineSchedule");
    expect(source).not.toContain("person-1");
    expect(source).not.toContain("screen-company-form");
    expect(source).not.toContain("shupass-v2/howto/");
  });

  it("keeps step illustrations presentational and copy in HTML", () => {
    expect(source).toContain('alt=""');
    expect(source).toContain('role="presentation"');
    expect(source).not.toContain("sr-only");
  });

  it("embeds step data directly", () => {
    expect(source).toContain("const steps");
  });

  it("uses HTML icons and cards instead of icon images", () => {
    expect(source).toContain("lucide-react");
    expect(source).toContain("Building2");
  });

  it("uses responsive card columns at xl breakpoint for desktop horizontal row", () => {
    expect(source).not.toContain("lg:grid-cols-2");
    expect(source).toContain("xl:grid-cols-4");
    expect(source).toContain("h-[200px]");
    expect(source).toContain("sm:h-[270px]");
    expect(source).toContain("xl:h-[270px]");
    expect(source).toContain("object-contain");
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

  it("uses responsive Tailwind grid fallback", () => {
    expect(source).toContain("grid gap-3 xl:grid-cols-4 xl:gap-5");
  });

  it("contains all four step titles in HTML text", () => {
    expect(source).toContain("企業を登録");
    expect(source).toContain("AIでESを作成・添削");
    expect(source).toContain("面接対策を進める");
    expect(source).toContain("締切・予定を管理");
  });

  it("has section title with sparkle decoration", () => {
    expect(source).toContain("使い方は、");
    expect(source).toContain("シンプル。");
    expect(source).toContain("lg:text-[56px]");
  });

  it("keeps the image visually larger while tightening vertical spacing", () => {
    expect(source).toContain("py-10");
    expect(source).toContain("lg:pt-[60px]");
    expect(source).toContain("lg:pb-14");
    expect(source).toContain("mb-7 text-center sm:mb-8");
    expect(source).toContain("px-4 pb-0 pt-0");
    expect(source).toContain("leading-[1.45]");
    expect(source).toContain("right-[-20px]");
    expect(source).toContain("h-8 w-8");
    expect(source).toContain("xl:flex");
    expect(source).not.toContain("right-[-28px]");
    expect(source).toContain("max-h-[220px]");
    expect(source).toContain("sm:max-h-[292px]");
    expect(source).toContain("xl:max-h-[292px]");
    expect(source).toContain("max-w-[112%]");
    expect(source).toContain("mt-0");
    expect(source).toContain("mb-2");
    expect(source).toContain("py-1.5");
    expect(source).toContain("leading-[1.5]");
  });

  it("lazy-loads below-the-fold step illustrations", () => {
    expect(source).toContain('loading="lazy"');
    expect(source).not.toContain('loading="eager"');
  });

  it("has footer text", () => {
    expect(source).toContain("準備・対策・管理");
    expect(source).toContain("就活Passひとつで完結");
  });

  it("does not contain deleted HowtoIcon function", () => {
    expect(source).not.toContain("function HowtoIcon");
    expect(source).not.toContain("HowtoGridItem");
  });

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="how-it-works"');
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });
});
