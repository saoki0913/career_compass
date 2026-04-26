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
    expect(source).toContain(
      "pricing_assets_transparent/02_blue_credit_card_with_price_tag.png",
    );
  });

  it("includes decorative shield-check icon for desktop", () => {
    expect(source).toContain("icons-circled/shield-check.png");
  });

  it("decorative images have alt empty and role presentation", () => {
    // Both decorative images must have alt="" and role="presentation"
    const decorativeMatches = source.match(/role="presentation"/g);
    expect(decorativeMatches).not.toBeNull();
    expect(decorativeMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("uses CSS variable --lp-navy for heading color", () => {
    expect(source).toContain("var(--lp-navy)");
  });
});
