import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "LandingHeader.tsx"),
  "utf-8"
);

describe("LandingHeader — design-system guard", () => {
  it("renders nav links for features, how-it-works, pricing, faq", () => {
    expect(SRC).toContain("/#features");
    expect(SRC).toContain("/#how-it-works");
    expect(SRC).toContain("/#pricing");
    expect(SRC).toContain("/#faq");
  });

  it("uses Noto Sans JP font (no Inter)", () => {
    expect(SRC).toContain("Noto Sans JP");
    expect(SRC).not.toMatch(/['"]Inter['"]/);
  });

  it("uses shared CTA color token instead of hard-coded button colors", () => {
    expect(SRC).toContain("var(--lp-cta)");
    expect(SRC).not.toContain("bg-[#1d2c4d]");
  });

  it("uses var(--lp-cta) for CTA buttons", () => {
    expect(SRC).toContain("var(--lp-cta)");
  });

  it("logo is at least 40px", () => {
    expect(SRC).toMatch(/height[=:]\s*(?:4[0-9]|5[0-6]|[6-9][0-9])/);
    expect(SRC).toMatch(/className="[^"]*h-12/);
  });
});
