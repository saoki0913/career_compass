import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURE_ROOT = join(process.cwd(), "src/features/gakuchika");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("features/gakuchika architecture", () => {
  it("does not import BFF modules directly", () => {
    const violations = sourceFiles(FEATURE_ROOT).flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return /from\s+["']@\/bff\//.test(content) ||
        /from\s+["']\.\.\/\.\.\/bff\//.test(content)
        ? [relative(process.cwd(), path)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
