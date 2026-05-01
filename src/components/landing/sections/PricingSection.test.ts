import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("PricingSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/PricingSection.tsx",
  );

  it("includes decorative credit card illustration for desktop", () => {
    expect(source).toContain("pricing/icon-credit-card-price.png");
  });

  it("includes inline PricingShieldIcon SVG component", () => {
    expect(source).toContain("PricingShieldIcon");
  });

  it("decorative images have alt empty and role presentation", () => {
    // All 7 decorative images must have alt="" and role="presentation"
    const decorativeMatches = source.match(/role="presentation"/g);
    expect(decorativeMatches).not.toBeNull();
    expect(decorativeMatches!.length).toBeGreaterThanOrEqual(7);
  });

  it("uses reference design heading color #0d1f3a", () => {
    expect(source).toContain("#0d1f3a");
  });

  it("uses reference design accent color #2d6eff", () => {
    expect(source).toContain("#2d6eff");
  });

  it("limits LP feature list to 6 items per plan", () => {
    expect(source).toContain(".slice(0, 6)");
  });

  it("uses SSOT pricing data from getMarketingPricingPlans", () => {
    expect(source).toContain("getMarketingPricingPlans");
    expect(source).toContain('"monthly"');
  });

  it("does not import lucide-react icons", () => {
    expect(source).not.toContain("lucide-react");
  });

  it("includes wave SVG decoration", () => {
    expect(source).toContain("PricingWave");
  });

  it("includes 3 plus-sign text decorations", () => {
    // The "+" text decorations appear 3 times
    const plusMatches = source.match(/>\s*\+\s*<\/span>/g);
    expect(plusMatches).not.toBeNull();
    expect(plusMatches!.length).toBe(3);
  });

  it("keeps low-friction trust copy without overstating free usage", () => {
    expect(source).toContain("30秒で簡単スタート");
    expect(source).toContain("無料プランあり");
  });
});
