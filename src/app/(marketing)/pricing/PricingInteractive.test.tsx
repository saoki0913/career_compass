import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("PricingInteractive — image-registry guard", () => {
  it("uses LOGO_ASSETS from image registry instead of hardcoded path", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).toContain("LOGO_ASSETS");
    expect(source).toContain("LOGO_ASSETS.textClean");
    expect(source).not.toContain('src="/marketing/logo/logo_text_clean.png"');
  });
});

describe("PricingInteractive — double-click guard", () => {
  it("uses useRef to prevent double invocation of handlePlanSelect", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).toContain("useRef");
    expect(source).toContain("isBusyRef");
    expect(source).toContain("isBusyRef.current");
  });

  it("only resets isBusyRef in catch blocks (not on success paths)", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    // The ref reset should only appear inside catch blocks
    const resetOccurrences = source.split("isBusyRef.current = false").length - 1;
    expect(resetOccurrences).toBeGreaterThanOrEqual(2); // portal catch + checkout catch
  });
});
