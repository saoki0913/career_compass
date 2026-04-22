import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("es-tensaku-ai page regressions", () => {
  it("renders the core sections in order", () => {
    const source = readSource("src/app/(marketing)/es-tensaku-ai/page.tsx");

    expect(source).toContain("<LandingHeader />");
    expect(source).toContain("<EsTensakuAiHeroSection />");
    expect(source).toContain("<EsTensakuAiPainPointsSection />");
    expect(source).toContain("<EsTensakuAiFeatureTemplateSection />");
    expect(source).toContain("<EsTensakuAiFeatureCompanySection />");
    expect(source).toContain("<EsTensakuAiFeatureRewriteSection />");
    expect(source).toContain("<MidCTASection");
    expect(source).toContain("<FAQSection");
    expect(source).toContain("<FinalCTASection");
    expect(source).toContain("<LandingFooter />");
    expect(source).toContain("<StickyCTABar />");
  });

  it("exports metadata via createMarketingMetadata", () => {
    const source = readSource("src/app/(marketing)/es-tensaku-ai/page.tsx");

    expect(source).toContain("export const metadata");
    expect(source).toContain("createMarketingMetadata");
    expect(source).toContain('path: "/es-tensaku-ai"');
  });

  it("includes FaqJsonLd with ES_TENSAKU_AI_PAGE_FAQS", () => {
    const source = readSource("src/app/(marketing)/es-tensaku-ai/page.tsx");

    expect(source).toContain("FaqJsonLd");
    expect(source).toContain("ES_TENSAKU_AI_PAGE_FAQS");
  });
});

describe("es-tensaku-ai metadata", () => {
  it("has ES-related keywords in title", async () => {
    const { metadata } = await import("./page");
    const title = typeof metadata.title === "string" ? metadata.title : "";
    expect(title).toMatch(/ES添削/);
    expect(title).toMatch(/就活Pass/);
  });

  it("sets canonical path to /es-tensaku-ai", async () => {
    const { metadata } = await import("./page");
    expect(metadata.alternates?.canonical).toBe("/es-tensaku-ai");
  });
});
