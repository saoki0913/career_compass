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
      "src/components/landing/HowItWorksSection.tsx",
    );
    expect(source).toContain(
      'import { LANDING_STEPS } from "@/lib/marketing/landing-steps"',
    );
    // Guard against reintroducing an in-component `const steps = [` array
    expect(source).not.toMatch(/const\s+steps\s*=\s*\[/);
  });

  it("LANDING_STEPS exposes three steps in the expected order", () => {
    expect(LANDING_STEPS).toHaveLength(3);
    expect(LANDING_STEPS[0].label).toContain("ESを貼り付ける");
    expect(LANDING_STEPS[1].label).toContain("AIが改善案");
    expect(LANDING_STEPS[2].label).toContain("保存");
    for (const step of LANDING_STEPS) {
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});
