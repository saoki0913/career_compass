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

  it("uses updated iPhone mockup sizing", () => {
    expect(source).toContain("w-[28%]");
    expect(source).toContain("max-w-[180px]");
  });
});
