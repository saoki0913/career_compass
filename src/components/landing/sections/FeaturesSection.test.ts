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

  it("renders all six feature cards including Google Calendar", () => {
    expect(source).toContain("Googleカレンダー連携");
    expect(source).toContain("card-es-review.png");
    expect(source).toContain("card-motivation-gakuchika.png");
    expect(source).toContain("card-interview-prep.png");
    expect(source).toContain("card-schedule-deadline.png");
    expect(source).toContain("card-company-application-management.png");
  });

  it("uses the reference gradient background", () => {
    expect(source).toContain(
      "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
    );
  });

  it("uses 6-column CSS grid for cards", () => {
    expect(source).toContain("repeat(6, 1fr)");
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

  it("uses lpSectionAsset helper for all images", () => {
    expect(source).toContain('from "@/lib/marketing/lp-assets"');
    const imgSrcMatches = source.match(/src=\{lpSectionAsset\(/g);
    expect(imgSrcMatches).not.toBeNull();
    expect(imgSrcMatches!.length).toBeGreaterThanOrEqual(6);
  });

  it("has section id='features'", () => {
    expect(source).toContain('id="features"');
  });

  it("uses reference card border-radius of 22px", () => {
    expect(source).toContain("borderRadius: 22");
  });

  it("uses reference inner visual wrap border-radius of 14px", () => {
    expect(source).toContain("borderRadius: 14");
    expect(source).toContain("feat-card-visual-v2");
    expect(source).toContain("height: 238");
    expect(source).toContain('objectFit: "contain"');
  });

  it("uses responsive breakpoints for grid fallback", () => {
    expect(source).toContain("max-width: 1099px");
    expect(source).toContain("max-width: 768px");
  });
});
