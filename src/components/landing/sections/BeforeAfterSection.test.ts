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
    expect(source).toContain("lg:grid-cols-[1fr_88px_1fr]");
    expect(source).toContain("shupass-v2/ba/arrow.png");
  });

  it("uses shupass before-after assets and compact panel sizing", () => {
    expect(source).toContain("shupass-v2/ba/illust-worried.png");
    expect(source).toContain("shupass-v2/ba/illust-cheerful.png");
    expect(source).toContain("shupass-v2/ba/mockup.png");
    expect(source).toContain("min-h-[500px]");
  });
});
