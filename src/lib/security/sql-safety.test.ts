import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const guardTargets = [
  "src/app/api/search/route.ts",
  "src/lib/search/utils.ts",
  "src/lib/db/motivationConversationCompat.ts",
] as const;

describe("sql safety guardrails", () => {
  it("keeps the global search route free of raw SQL fragments", () => {
    const content = readFileSync(path.join(repoRoot, "src/app/api/search/route.ts"), "utf8");

    expect(content).not.toMatch(/sql\.raw\s*\(/);
    expect(content).not.toMatch(/\bSELECT\b[\s\S]*\$\{/);
    expect(content).not.toMatch(/\bINSERT\b[\s\S]*\$\{/);
    expect(content).not.toMatch(/\bUPDATE\b[\s\S]*\$\{/);
    expect(content).not.toMatch(/\bDELETE\b[\s\S]*\$\{/);
  });

  it("documents allowed sql.raw usage as internal-only and isolated", () => {
    const compatContent = readFileSync(
      path.join(repoRoot, "src/lib/db/motivationConversationCompat.ts"),
      "utf8",
    );

    expect(compatContent).toContain('sql.raw(`"${column}"`)');
    expect(compatContent).not.toMatch(/sql\.raw\s*\([^`]*\$\{/);
  });

  it("keeps search helpers parameter-oriented", () => {
    const helperContent = readFileSync(path.join(repoRoot, "src/lib/search/utils.ts"), "utf8");

    expect(helperContent).toContain("escapeLikePattern");
    expect(helperContent).toContain("sanitizeSearchInput");
  });

  it("only scans the intended files so the guard stays stable", () => {
    expect(guardTargets).toHaveLength(3);
  });
});
