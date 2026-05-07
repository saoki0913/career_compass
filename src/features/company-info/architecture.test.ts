import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURE_ROOT = join(process.cwd(), "src/features/company-info");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function importViolations(pattern: RegExp): string[] {
  return sourceFiles(FEATURE_ROOT).flatMap((path) => {
    const content = readFileSync(path, "utf8");
    return pattern.test(content) ? [relative(process.cwd(), path)] : [];
  });
}

describe("features/company-info architecture", () => {
  it("does not import BFF modules directly", () => {
    expect(importViolations(/from\s+["'](?:@\/bff\/|(?:\.\.\/)+bff\/)/)).toEqual([]);
  });

  it("does not import through legacy company component shims", () => {
    expect(
      importViolations(
        /from\s+["'](?:@\/components\/companies\/(?:CorporateInfoSection|corporate-info-section\/)|(?:\.\.\/)+components\/companies\/(?:CorporateInfoSection|corporate-info-section\/))/,
      ),
    ).toEqual([]);
  });
});
