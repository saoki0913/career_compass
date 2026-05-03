import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const BFF_ROOT = join(process.cwd(), "src/bff/gakuchika");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("bff/gakuchika architecture", () => {
  it("does not import React UI or frontend hooks", () => {
    const violations = sourceFiles(BFF_ROOT).flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return /from\s+["']@\/components\//.test(content) ||
        /from\s+["']@\/hooks\//.test(content)
        ? [relative(process.cwd(), path)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
