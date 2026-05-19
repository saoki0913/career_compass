import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type SourceFile = {
  relativePath: string;
  source: string;
};

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "src");

const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredSegments = new Set(["node_modules", ".next"]);
const allowedStorageFiles = new Set([
  "src/app/(marketing)/pricing/checkout/PricingCheckoutResolver.tsx",
  // Pricing checkout bridge: only hands sessionStorage to pricing-flow helpers.
  "src/components/auth/AuthProvider.tsx",
  "src/components/layout/SidebarContext.tsx",
  "src/hooks/usePricingPlanSelection.ts",
  "src/lib/auth/device-token.ts",
  "src/lib/billing/pricing-flow.ts",
]);
const sensitiveStorageNamePattern =
  /(?:access|auth|bearer|cookie|credential|csrf|device|guest|jwt|oauth|password|refresh|secret|session|token)/iu;
const storageCallPattern =
  /\b(?:localStorage|sessionStorage|storage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(([^)]*)\)/gu;

function listSourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir).flatMap((entry) => {
    if (ignoredSegments.has(entry)) {
      return [];
    }

    const absolutePath = path.join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      return listSourceFiles(absolutePath);
    }

    if (!sourceExtensions.has(path.extname(entry))) {
      return [];
    }
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      return [];
    }

    return [{
      relativePath: path.relative(repoRoot, absolutePath),
      source: readFileSync(absolutePath, "utf8"),
    }];
  });
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

describe("auth storage policy", () => {
  const sourceFiles = listSourceFiles(srcRoot);

  it("keeps Web Storage usage confined to explicit pricing, sidebar, and legacy cleanup files", () => {
    const unexpectedFiles = sourceFiles
      .filter(({ source }) => /\b(?:localStorage|sessionStorage)\b/u.test(source))
      .map(({ relativePath }) => relativePath)
      .filter((relativePath) => !allowedStorageFiles.has(relativePath));

    expect(unexpectedFiles).toEqual([]);
  });

  it("does not persist token, session, or credential material in localStorage/sessionStorage", () => {
    const findings = sourceFiles.flatMap(({ relativePath, source }) => {
      const matches: string[] = [];

      for (const match of source.matchAll(storageCallPattern)) {
        const args = match[1] ?? "";
        const isPersistenceCall = match[0].includes(".setItem(");
        const isAllowedLegacyCleanup =
          relativePath === "src/lib/auth/device-token.ts" && !isPersistenceCall;
        if (!isPersistenceCall || isAllowedLegacyCleanup) {
          continue;
        }
        if (sensitiveStorageNamePattern.test(args)) {
          matches.push(`${relativePath}:${lineNumberFor(source, match.index ?? 0)} ${match[0]}`);
        }
      }

      return matches;
    });

    expect(findings).toEqual([]);
  });
});
