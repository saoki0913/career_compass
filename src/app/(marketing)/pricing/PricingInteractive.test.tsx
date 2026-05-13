import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("PricingInteractive — no marketing header", () => {
  it("keeps navigation outside the client island", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("LOGO_ASSETS");
    expect(source).not.toContain("<header");
  });
});

describe("PricingInteractive — no 'プラン選びの目安' section", () => {
  it("does not render the guidance section", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("プラン選びの目安");
  });
});

describe("PricingInteractive — double-click guard", () => {
  it("delegates double-submit protection to the shared pricing selection hook", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).toContain("usePricingPlanSelection");
    expect(source).not.toContain("isBusyRef");
  });
});

describe("PricingInteractive — dynamic CTA labels", () => {
  it("derives CTA labels from currentPlan comparison, not just static ctaLabel", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    expect(source).toContain("getCtaLabel");
  });
});

describe("PricingInteractive — checkout flow", () => {
  it("keeps checkout and portal flows in the shared pricing selection hook", async () => {
    const source = await readFile(new URL("./PricingInteractive.tsx", import.meta.url), "utf8");
    const hookSource = await readFile(new URL("../../../hooks/usePricingPlanSelection.ts", import.meta.url), "utf8");
    expect(source).toContain("usePricingPlanSelection");
    expect(hookSource).toContain("/api/stripe/checkout");
    expect(hookSource).toContain("/api/stripe/portal");
    expect(hookSource).toContain("PRICING_CHECKOUT_PATH");
  });
});
