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

  it("includes decorative pricing illustrations via LP_SECTION_ASSETS registry", () => {
    expect(source).toContain("LP_SECTION_ASSETS.pricing.decoDotsCircle");
    expect(source).toContain("LP_SECTION_ASSETS.pricing.decoCardFree");
  });

  it("uses lucide shield and check icons as HTML components", () => {
    expect(source).toContain("ShieldCheck");
    expect(source).toContain("CheckCircle2");
  });

  it("decorative images have alt empty and role presentation", () => {
    const decorativeMatches = source.match(/role="presentation"/g);
    expect(decorativeMatches).not.toBeNull();
    expect(decorativeMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("uses shared design tokens for heading and accents", () => {
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-cta)");
  });


  it("limits LP feature list to 6 items per plan", () => {
    expect(source).toContain(".slice(0, 6)");
  });

  it("does not strip billing caveats from plan features", () => {
    expect(source).not.toContain("replace(/（.*?）/g");
    expect(source).toContain("<span>{feature}</span>");
  });

  it("uses SSOT pricing data from getMarketingPricingPlans", () => {
    expect(source).toContain("getMarketingPricingPlans");
    expect(source).toContain('"monthly"');
  });

  it("does not send paid LP pricing CTAs to the standalone pricing page", () => {
    expect(source).not.toContain('href={plan.id === "free" ? "/login" : "/pricing"}');
    expect(source).not.toContain('href="/pricing"');
    expect(source).toContain("PaidPricingPlanButton");
    expect(source).toContain("PricingCancelNotice");
  });

  it("keeps checkout and portal side effects outside the server pricing section", () => {
    expect(source).not.toContain("getPricingSelectionAction");
    expect(source).not.toContain("/api/stripe/checkout");
    expect(source).not.toContain("/api/stripe/portal");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("imports lucide-react icons instead of using button images", () => {
    expect(source).toContain("lucide-react");
  });

  it("includes wave SVG decoration", () => {
    expect(source).toContain('viewBox="0 0 1672 941"');
  });

  it("uses the selected low-friction trust copy", () => {
    expect(source).toContain("無料プランあり");
    expect(source).toContain("必要な分だけ使える");
    expect(source).not.toContain("月50クレジットから");
    expect(source).not.toContain("クレカ登録不要");
    expect(source).not.toContain("カード登録不要");
  });

  it("keeps low-friction trust copy without overstating free usage", () => {
    expect(source).toContain("無料プランあり");
    expect(source).toContain("あとから変更OK");
    expect(source).not.toContain("クレジットカード登録不要");
  });

  it("uses enhanced card shadows for professional depth", () => {
    expect(source).toContain("rgba(38,128,255,0.22)");
    expect(source).toContain("rgba(20,50,110,0.13)");
  });

  it("uses responsive section padding instead of inline padding", () => {
    expect(source).toContain("py-10");
    expect(source).toContain("lg:py-16");
    expect(source).not.toContain('padding: "62px 0 64px"');
  });

  it("marks the section for Playwright section screenshots", () => {
    expect(source).toContain('data-section="pricing"');
    expect(source).toContain("scroll-mt-[92px]");
  });

  it("includes sparkle decorations", () => {
    expect(source).toContain("LpSparkleDecorations");
  });
});
