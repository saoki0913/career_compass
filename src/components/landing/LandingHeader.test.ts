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
    expect(SRC).toContain("height={84}");
    expect(SRC).toMatch(/className="[^"]*h-10/);
  });

  it("uses compact header dimensions and aligned page gutters", () => {
    expect(SRC).toContain("height: 78");
    expect(SRC).toContain("top-[78px]");
    expect(SRC).toContain("px-6 sm:px-10 lg:px-12 xl:px-14");
    expect(SRC).toContain("h-10 w-36");
    expect(SRC).toContain("sm:w-40");
  });

  it("keeps desktop navigation and CTA compact", () => {
    expect(SRC).toContain("gap-7 md:flex");
    expect(SRC).toContain("text-[15px]");
    expect(SRC).toContain("px-5 py-2.5");
    expect(SRC).not.toContain("gap-10");
    expect(SRC).not.toContain("text-[18px]");
  });
});
