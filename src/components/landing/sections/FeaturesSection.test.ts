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

  it("uses CSS variable tokens instead of hardcoded chromatic hex", () => {
    expect(source).not.toContain('"#1a1a2e"');
    expect(source).not.toContain('"#2563eb"');
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-cta)");
  });

  it("uses left-aligned heading on large screens", () => {
    expect(source).toContain("lg:text-left");
  });

  it("uses text-sm for feature number badges", () => {
    expect(source).toContain("text-sm");
    expect(source).not.toMatch(/className="text-xs tracking-wider"/);
  });
});
