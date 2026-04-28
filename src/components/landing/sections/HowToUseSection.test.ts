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

  it("uses per-step connector arrow images with section-level wave decoration", () => {
    expect(source).toContain("decorative/wave-line-1.png");
    expect(source).toContain("decorative/connector-arrow-1-to-2.png");
    expect(source).toContain("decorative/connector-arrow-2-to-3.png");
    expect(source).toContain("decorative/connector-arrow-3-to-4.png");
  });

  it("uses CONNECTORS array for typed connector data", () => {
    expect(source).toContain("CONNECTORS");
    expect(source).not.toMatch(/\[0, 1, 2\]\.map/);
  });

  it("sets character illustration width near the section reference", () => {
    expect(source).toContain('w-[150px]');
    expect(source).toContain('2xl:w-[168px]');
    expect(source).not.toContain('w-[100px]');
  });

  it("uses reference-scale four-column lanes", () => {
    expect(source).toContain("2xl:grid-cols-[repeat(4,360px)]");
    expect(source).toContain("min-h-[590px]");
  });

  it("uses compact category icon in step header to avoid title truncation", () => {
    expect(source).toContain("h-[44px] w-[44px]");
  });
});
