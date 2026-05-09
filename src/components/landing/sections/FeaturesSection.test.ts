import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("FeaturesSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/FeaturesSection.tsx",
  );

  it("uses var(--lp-cta) for accent color", () => {
    expect(source).toContain("var(--lp-cta)");
  });

  it("renders all six feature cards via LP_SECTION_ASSETS registry", () => {
    expect(source).toContain("Googleカレンダー連携");
    expect(source).toContain("LP_SECTION_ASSETS.features.cardEsReview");
    expect(source).toContain("LP_SECTION_ASSETS.features.cardMotivationGakuchika");
    expect(source).toContain("LP_SECTION_ASSETS.features.cardInterviewPrep");
    expect(source).toContain("LP_SECTION_ASSETS.features.cardScheduleDeadline");
    expect(source).toContain("LP_SECTION_ASSETS.features.cardCompanyManagement");
  });

  it("uses the reference gradient background", () => {
    expect(source).toContain(
      "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
    );
  });

  it("uses a 3-column desktop grid for the six reference cards", () => {
    expect(source).toContain("lg:grid-cols-3");
  });

  it("uses Noto Sans JP font family without Inter", () => {
    expect(source).toContain("Noto Sans JP");
    expect(source).not.toContain("'Inter'");
  });

  it("includes font feature settings for palt", () => {
    expect(source).toContain('"palt"');
  });

  it("uses flow diagram with 3 steps (作成, 対策, 管理)", () => {
    expect(source).toContain("作成");
    expect(source).toContain("対策");
    expect(source).toContain("管理");
  });

  it("does not use legacy shupass-v2 asset paths", () => {
    expect(source).not.toContain("shupass-v2/");
  });

  it("uses lpSectionAsset helper from image-registry for all images", () => {
    expect(source).toContain('from "@/lib/assets/image-registry"');
    const imgSrcMatches = source.match(/src=\{lpSectionAsset\(/g);
    expect(imgSrcMatches).not.toBeNull();
    expect(imgSrcMatches!.length).toBeGreaterThanOrEqual(1);
    expect(source).toContain("features.map");
  });

  it("has section id='features'", () => {
    expect(source).toContain('id="features"');
    expect(source).toContain("scroll-mt-[92px]");
  });

  it("uses compact reference card border-radius and enhanced shadows", () => {
    expect(source).toContain("rounded-2xl");
    expect(source).toContain("rgba(20,50,110,0.12)");
    expect(source).toContain("rgba(20,50,110,0.13)");
  });

  it("uses reference card visuals with stable aspect ratio", () => {
    expect(source).toContain("h-[180px]");
    expect(source).toContain("sm:h-[240px]");
    expect(source).toContain("lg:h-[260px]");
    expect(source).toContain("object-contain");
    expect(source).toContain("items-center justify-center bg-white p-3");
    expect(source).not.toContain("bg-[#f7fbff] p-3");
    expect(source).not.toContain("bg-white/80 px-5 py-6");
  });

  it("uses 2-column grid at sm breakpoint for feature cards", () => {
    expect(source).toContain("sm:grid-cols-2");
  });

  it("uses responsive breakpoints for grid fallback", () => {
    expect(source).toContain("lg:grid-cols-[500px_minmax(0,1fr)]");
    expect(source).toContain("md:grid-cols-[1fr_48px_1fr_48px_1fr]");
  });

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="features"');
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });
});
