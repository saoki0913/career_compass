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

  it("renders reference-style pain cards with soft shadows", () => {
    expect(source).toContain("min-h-[418px]");
    expect(source).toContain("rounded-[20px] border bg-white");
    expect(source).toContain("boxShadow");
  });

  it("uses shupass worry decorations without rendering text-baked cards", () => {
    expect(source).toContain('const SHUPASS_ASSET = "shupass-v2"');
    expect(source).toContain("worry-deco-dots.png");
    expect(source).toContain("worry-deco-swirl.png");
    expect(source).not.toContain("worry-card-1.png");
  });

  it("references the correct character assets", () => {
    expect(source).toContain("boy-writing.png");
    expect(source).toContain("girl-at-laptop.png");
    expect(source).toContain("boy-thinking-hoodie.png");
    expect(source).toContain("girl-phone-thinking.png");
  });
});
