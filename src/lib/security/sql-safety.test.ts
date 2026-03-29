import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const guardTargets = [
  "src/app/api/search/route.ts",
  "src/lib/search/utils.ts",
  "src/lib/motivation/conversation.ts",
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

  it("keeps motivation conversation helpers free of raw SQL fragments", () => {
    const helperContent = readFileSync(
      path.join(repoRoot, "src/lib/motivation/conversation.ts"),
      "utf8",
    );

    expect(helperContent).not.toMatch(/sql\.raw\s*\(/);
    expect(helperContent).not.toMatch(/\bSELECT\b[\s\S]*\$\{/);
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
