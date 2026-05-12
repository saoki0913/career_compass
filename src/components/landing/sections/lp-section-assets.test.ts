import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const landingDir = path.join(repoRoot, "src/components/landing");
const sectionsDir = path.join(repoRoot, "src/components/landing/sections");

const lpComponentFiles = [
  path.join(landingDir, "LandingFooter.tsx"),
  path.join(sectionsDir, "HeroSection.tsx"),
  path.join(sectionsDir, "PainPointsSection.tsx"),
  path.join(sectionsDir, "FeaturesSection.tsx"),
  path.join(sectionsDir, "HowToUseSection.tsx"),
  path.join(sectionsDir, "BeforeAfterSection.tsx"),
  path.join(sectionsDir, "PricingSection.tsx"),
  path.join(sectionsDir, "LPFAQSection.tsx"),
] as const;

const registryConsumerFiles = [
  ...lpComponentFiles,
  path.join(landingDir, "LandingHeader.tsx"),
  path.join(repoRoot, "src/components/layout/AppSidebar.tsx"),
  path.join(repoRoot, "src/components/dashboard/DeadlineCard.tsx"),
  path.join(repoRoot, "src/components/dashboard/TodayTasksCard.tsx"),
  path.join(repoRoot, "src/app/(auth)/login/page.tsx"),
  path.join(repoRoot, "src/app/(product)/pricing/PricingInteractive.tsx"),
] as const;

describe("root LP section assets", () => {
  it("uses LP_SECTION_ASSETS registry instead of hardcoded string paths", () => {
    for (const filePath of lpComponentFiles) {
      const source = readFileSync(filePath, "utf8");
      const file = path.relative(repoRoot, filePath);

      const directStringCalls = [...source.matchAll(/lpSectionAsset\("([^"]+)"\)/g)];
      expect(
        directStringCalls.length,
        `${file}: should use LP_SECTION_ASSETS constants instead of string literals in lpSectionAsset()`,
      ).toBe(0);

      expect(source).toContain('@/lib/assets/image-registry"');
    }
  });

  it("does not reference legacy lp-assets import path", () => {
    for (const filePath of registryConsumerFiles) {
      const source = readFileSync(filePath, "utf8");
      const file = path.relative(repoRoot, filePath);
      expect(source, `${file}: should not import from legacy lp-assets`).not.toContain(
        "@/lib/marketing/lp-assets",
      );
    }
  });

  it("no hardcoded image paths bypass the registry", () => {
    const hardcodedPatterns = [
      /src=["']\/marketing\/LP\/sections\//,
      /src=["']\/marketing\/logo\//,
      /src=["']\/dashboard\/assets\//,
    ];
    for (const filePath of registryConsumerFiles) {
      const source = readFileSync(filePath, "utf8");
      const file = path.relative(repoRoot, filePath);
      for (const pattern of hardcodedPatterns) {
        expect(source, `${file}: hardcoded image path found — use image-registry constants`).not.toMatch(pattern);
      }
    }
  });
});
