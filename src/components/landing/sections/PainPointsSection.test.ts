import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("PainPointsSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/PainPointsSection.tsx",
  );

  it("uses CSS variable tokens instead of hardcoded chromatic hex", () => {
    expect(source).not.toContain('"#1a1a2e"');
    expect(source).not.toContain('"#2563eb"');
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-cta)");
    expect(source).toContain("var(--lp-muted-text)");
  });

  it("renders characters without card wrapper styles", () => {
    expect(source).not.toContain("rounded-2xl border bg-white p-6");
    expect(source).not.toContain("boxShadow");
  });

  it("references the correct character assets", () => {
    expect(source).toContain("girl-at-laptop.png");
    expect(source).toContain("boy-thinking-hoodie.png");
    expect(source).toContain("girl-clasped-standing.png");
    expect(source).toContain("boy-glasses-standing.png");
  });
});
