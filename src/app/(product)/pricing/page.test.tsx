import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("PricingPage (product)", () => {
  it("exports a default component", async () => {
    const mod = await import("./page");
    expect(mod.default).toBeDefined();
  });

  it("renders PricingInteractive without comparison table or FAQ", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("PricingInteractive");
    expect(source).not.toContain("comparisonRows");
    expect(source).not.toContain("faqItems");
    expect(source).not.toContain("FaqJsonLd");
  });

  it("does not require auth redirect (guests can access)", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("redirect(");
    expect(source).not.toContain("getHeadersIdentity");
  });
});
