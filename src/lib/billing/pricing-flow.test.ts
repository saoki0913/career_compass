import { describe, expect, it } from "vitest";

import { getPricingSelectionAction } from "@/lib/billing/pricing-flow";

describe("getPricingSelectionAction", () => {
  it("routes paid subscribers to portal when they pick another paid plan", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "standard",
        targetPlan: "pro",
        isAuthenticated: true,
      })
    ).toBe("portal");
  });

  it("routes authenticated free users to checkout", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "free",
        targetPlan: "standard",
        isAuthenticated: true,
      })
    ).toBe("checkout");
  });

  it("routes anonymous users to login before checkout", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: null,
        targetPlan: "pro",
        isAuthenticated: false,
      })
    ).toBe("login");
  });
});
