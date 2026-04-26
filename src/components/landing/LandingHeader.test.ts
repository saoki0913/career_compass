import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "LandingHeader.tsx"),
  "utf-8"
);

describe("LandingHeader — design-system guard", () => {
  it("does not import unused lucide-react icons", () => {
    expect(SRC).not.toMatch(/ArrowRight/);
  });

  it("renders nav links for features, how-it-works, pricing, faq", () => {
    expect(SRC).toContain("/#features");
    expect(SRC).toContain("/#how-it-works");
    expect(SRC).toContain("/#pricing");
    expect(SRC).toContain("/#faq");
  });
});
