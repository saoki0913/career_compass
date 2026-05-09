import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("LandingPage composition guard", () => {
  const source = readSource("src/components/landing/LandingPage.tsx");

  it("imports StickyCTABar", () => {
    expect(source).toContain("StickyCTABar");
  });

  it("passes heroSelector to StickyCTABar for IntersectionObserver", () => {
    expect(source).toContain('heroSelector="[data-hero-cta]"');
  });

  it("renders StickyCTABar inside the wrapper div but outside main", () => {
    const mainCloseIdx = source.indexOf("</main>");
    const stickyIdx = source.indexOf("<StickyCTABar");
    expect(mainCloseIdx).toBeGreaterThan(-1);
    expect(stickyIdx).toBeGreaterThan(mainCloseIdx);
  });
});
