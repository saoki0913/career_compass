import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const landingDir = path.join(repoRoot, "src/components/landing");
const sectionsDir = path.join(repoRoot, "src/components/landing/sections");
const assetRoot = path.join(repoRoot, "public/marketing/LP/sections");

const componentFiles = [
  path.join(landingDir, "LandingFooter.tsx"),
  path.join(sectionsDir, "HeroSection.tsx"),
  path.join(sectionsDir, "PainPointsSection.tsx"),
  path.join(sectionsDir, "FeaturesSection.tsx"),
  path.join(sectionsDir, "HowToUseSection.tsx"),
  path.join(sectionsDir, "BeforeAfterSection.tsx"),
  path.join(sectionsDir, "PricingSection.tsx"),
  path.join(sectionsDir, "LPFAQSection.tsx"),
] as const;

describe("root LP section assets", () => {
  it("references only production section assets that exist", () => {
    for (const filePath of componentFiles) {
      const source = readFileSync(filePath, "utf8");
      const file = path.relative(repoRoot, filePath);
      const directAssetCalls = [...source.matchAll(/lpSectionAsset\("([^"]+)"\)/g)].map(
        (match) => match[1],
      );
      const dynamicAssetValues = [
        ...source.matchAll(/\b(?:src|asset|image):\s*"([^"]+\.(?:png|jpe?g|webp|svg))"/g),
      ].map((match) => match[1]);

      for (const assetPath of [...directAssetCalls, ...dynamicAssetValues]) {
        expect(assetPath).not.toContain("section_image");
        expect(assetPath).not.toContain("LP.png");
        expect(existsSync(path.join(assetRoot, assetPath)), `${file}: ${assetPath}`).toBe(true);
      }
    }
  });
});
