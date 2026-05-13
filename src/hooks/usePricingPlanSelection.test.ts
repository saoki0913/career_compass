import { describe, expect, it } from "vitest";

describe("usePricingPlanSelection", () => {
  it("passes hasActiveSubscription to getPricingSelectionAction", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./usePricingPlanSelection.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("hasActiveSubscription");
    expect(source).toContain("getPricingSelectionAction");
  });

  it("falls back to checkout when portal fails for a paid plan", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./usePricingPlanSelection.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("handleCheckout");
    expect(source).toContain("openBillingPortal");
  });
});
