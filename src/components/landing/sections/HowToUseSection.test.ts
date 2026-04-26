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

  it("uses per-step connector arrow images instead of generic wave-line", () => {
    expect(source).not.toContain("decorative/wave-line-1.png");
    expect(source).toContain("06_connector_arrow_1_to_2.png");
    expect(source).toContain("11_connector_arrow_2_to_3.png");
    expect(source).toContain("17_connector_arrow_3_to_4.png");
  });

  it("uses CONNECTORS array for typed connector data", () => {
    expect(source).toContain("CONNECTORS");
    expect(source).not.toMatch(/\[0, 1, 2\]\.map/);
  });

  it("sets character illustration width to 110px", () => {
    expect(source).toContain('w-[110px]');
    expect(source).not.toContain('w-[100px]');
  });
});
