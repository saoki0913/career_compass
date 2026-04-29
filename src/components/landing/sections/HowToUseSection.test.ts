import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HowToUseSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/HowToUseSection.tsx",
  );

  it("uses CSS variable --lp-navy instead of hardcoded #1a1a2e", () => {
    expect(source).not.toContain('"#1a1a2e"');
    expect(source).toContain("var(--lp-navy)");
  });

  it("uses shupass howto assets with component connector arrows", () => {
    expect(source).toContain("shupass-v2/howto/wave.png");
    expect(source).toContain("ArrowRight");
    expect(source).toContain("LANDING_STEPS");
    expect(source).toContain('id="how-it-works"');
  });

  it("sets character illustration width near the compact section reference", () => {
    expect(source).toContain('w-[122px]');
    expect(source).not.toContain('w-[100px]');
  });

  it("uses compact four-column lanes", () => {
    expect(source).toContain("lg:grid-cols-[repeat(4,1fr)]");
    expect(source).toContain("min-h-[470px]");
  });

  it("uses compact category icon in step header to avoid title truncation", () => {
    expect(source).toContain("h-[34px] w-[34px]");
  });
});
