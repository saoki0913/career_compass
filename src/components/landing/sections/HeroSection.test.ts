import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HeroSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/HeroSection.tsx",
  );

  it("uses CSS variable tokens for navy and CTA", () => {
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-cta)");
  });

  it("does not use hardcoded dark color #1a1a2e", () => {
    expect(source).not.toContain('"#1a1a2e"');
  });

  it("uses reference-scale iPhone mockup sizing", () => {
    expect(source).toContain("2xl:w-[190px]");
    expect(source).toContain("max-w-[190px]");
  });

  it("uses DESIGN.md-compliant hero heading size (72-82px range)", () => {
    expect(source).toMatch(/clamp\(44px,\s*4\.8vw,\s*76px\)/);
  });
});
