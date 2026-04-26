import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_STEPS } from "@/lib/marketing/landing-steps";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HowItWorksSection source drift guard", () => {
  it("references the LANDING_STEPS SSOT rather than a local array", () => {
    const source = readSource(
      "src/components/landing/sections/HowToUseSection.tsx",
    );
    expect(source).toContain(
      'import { LANDING_STEPS } from "@/lib/marketing/landing-steps"',
    );
    expect(source).not.toMatch(/const\s+(steps|STEPS)\s*=\s*\[/);
  });

  it("LANDING_STEPS exposes four steps in the expected order", () => {
    expect(LANDING_STEPS).toHaveLength(4);
    expect(LANDING_STEPS[0].label).toContain("企業を登録");
    expect(LANDING_STEPS[1].label).toContain("ES作成");
    expect(LANDING_STEPS[2].label).toContain("面接対策");
    expect(LANDING_STEPS[3].label).toContain("締切");
    for (const step of LANDING_STEPS) {
      expect(step.description.length).toBeGreaterThan(0);
      expect(step.cardImage).toMatch(/^step-cards\//);
      expect(step.characterImage).toMatch(/^characters\//);
    }
  });
});
