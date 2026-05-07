import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("LpSparkleDecorations component guard", () => {
  const source = readSource(
    "src/components/landing/shared/LpSparkleDecorations.tsx",
  );

  it("exports LpSparkleDecorations function", () => {
    expect(source).toContain("export function LpSparkleDecorations");
  });

  it("renders star sparkle SVG path", () => {
    expect(source).toContain(
      "M12 0C13 9 15 11 24 12C15 13 13 15 12 24C11 15 9 13 0 12C9 11 11 9 12 0Z",
    );
  });

  it("renders dot sparkle as circle", () => {
    expect(source).toContain("<circle");
    expect(source).toContain('r="5"');
  });

  it("uses percentage-based positioning", () => {
    expect(source).toContain("s.x}%");
    expect(source).toContain("s.y}%");
  });

  it("is non-interactive and accessible", () => {
    expect(source).toContain("pointer-events-none");
    expect(source).toContain('aria-hidden="true"');
  });

  it("defaults to #b9d8ff color", () => {
    expect(source).toContain("#b9d8ff");
  });

  it("does not use client directive (server component)", () => {
    expect(source).not.toMatch(/^"use client"/);
  });
});
