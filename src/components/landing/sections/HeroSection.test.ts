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

  it("uses shupass reference hero assets and keeps CTAs as links", () => {
    expect(source).toContain('const SHUPASS_ASSET = "shupass-v2"');
    expect(source).toContain("mockup-pc-phone.png");
    expect(source).toContain("badge-cc.png");
    expect(source).toContain('href="/login"');
    expect(source).toContain('href="#features"');
  });

  it("uses compact shupass reference heading scale", () => {
    expect(source).toContain("lg:text-[50px]");
    expect(source).toContain("rounded-full");
  });
});
