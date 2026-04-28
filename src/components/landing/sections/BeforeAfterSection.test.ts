import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("BeforeAfterSection design-system guard", () => {
  const source = readSource(
    "src/components/landing/sections/BeforeAfterSection.tsx",
  );

  it("uses CSS variable tokens for primary colors", () => {
    expect(source).toContain("var(--lp-navy)");
    expect(source).toContain("var(--lp-muted-text)");
    expect(source).toContain("var(--lp-cta)");
  });

  it("does not use hardcoded #1a1a2e or #64748b", () => {
    expect(source).not.toContain('"#1a1a2e"');
    expect(source).not.toContain('"#64748b"');
  });

  it("uses one horizontal conversion panel with center arrow", () => {
    expect(source).toContain("2xl:grid-cols-[668px_120px_724px]");
    expect(source).toContain("border-l-[var(--lp-cta)]");
  });

  it("uses reference-scale panel and mockup sizing", () => {
    expect(source).toContain("min-h-[600px]");
    expect(source).toContain("w-[295px]");
    expect(source).toContain("w-[86px]");
  });
});
