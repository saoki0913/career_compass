import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("StickyCTABar design-system guard", () => {
  const source = readSource("src/components/landing/StickyCTABar.tsx");

  it("exports StickyCTABarProps type", () => {
    expect(source).toContain("StickyCTABarProps");
  });

  it("supports IntersectionObserver via heroSelector prop", () => {
    expect(source).toContain("heroSelector");
    expect(source).toContain("IntersectionObserver");
  });

  it("maintains scroll fallback for backward compatibility", () => {
    expect(source).toContain("scrollY");
  });

  it("uses var(--lp-cta) for button background", () => {
    expect(source).toContain("var(--lp-cta)");
  });

  it("is hidden on md+ screens", () => {
    expect(source).toContain("md:hidden");
  });

  it("handles safe-area inset for notched devices", () => {
    expect(source).toContain("safe-area-inset-bottom");
  });

  it("includes proper cleanup", () => {
    expect(source).toContain("disconnect");
    expect(source).toContain("removeEventListener");
  });

  it("uses CTA text matching hero primary", () => {
    expect(source).toContain("無料で始める");
  });
});
