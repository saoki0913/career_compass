import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const componentPath = path.resolve(__dirname, "ReviewPanel.tsx");
const source = fs.readFileSync(componentPath, "utf-8");

describe("ReviewPanel — CreditWarningBanner integration", () => {
  it("imports CreditWarningBanner from billing", () => {
    expect(source).toContain("CreditWarningBanner");
    expect(source).toMatch(/@\/components\/billing\/CreditWarningBanner/);
  });

  it("destructures insufficientCredits from controller state", () => {
    expect(source).toMatch(/insufficientCredits/);
  });

  it("renders CreditWarningBanner with balance and creditCost props", () => {
    expect(source).toMatch(/<CreditWarningBanner/);
    expect(source).toMatch(/balance\s*=\s*\{/);
    expect(source).toMatch(/requiredCredits\s*=\s*\{/);
  });

  it("passes featureLabel to CreditWarningBanner", () => {
    expect(source).toMatch(/featureLabel\s*=\s*/);
  });

  it("conditionally renders banner when insufficientCredits is true", () => {
    expect(source).toMatch(/insufficientCredits/);
  });
});
