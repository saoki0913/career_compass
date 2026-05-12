import { describe, expect, it } from "vitest";
import { getMarketingPricingPlans } from "./pricing-plans";

describe("getMarketingPricingPlans", () => {
  it("returns simplified monthly plan features with credit amounts", () => {
    const plans = getMarketingPricingPlans("monthly");

    expect(plans.map((plan) => plan.id)).toEqual(["free", "standard", "pro"]);
    expect(plans[0]?.features).toContain("月50クレジット");
    expect(plans[1]?.features).toContain("月350クレジット");
    expect(plans[2]?.features).toContain("月750クレジット");
    expect(plans[0]?.features).toContain("面接対策");
    expect(plans[1]?.features).toContain("企業管理 無制限");
    expect(plans[2]?.features).toContain("企業管理 無制限");
  });

  it("feature strings do not contain per-action credit costs", () => {
    for (const plan of getMarketingPricingPlans("monthly")) {
      for (const feature of plan.features) {
        if (feature.startsWith("月")) continue;
        expect(feature).not.toMatch(/\dCR|クレジット\/回|クレジット消費/);
      }
    }
  });

  it("feature strings do not contain internal model names", () => {
    for (const plan of getMarketingPricingPlans("monthly")) {
      for (const feature of plan.features) {
        expect(feature).not.toMatch(/GPT-5\.4 mini|Claude Haiku|Claude Sonnet/);
      }
    }
  });

  it("returns annual pricing with savings metadata for paid plans", () => {
    const plans = getMarketingPricingPlans("annual");
    const standard = plans.find((plan) => plan.id === "standard");
    const pro = plans.find((plan) => plan.id === "pro");

    expect(standard?.price).toBe("¥14,900");
    expect(standard?.period).toBe("年");
    expect(standard?.savingsNote).toBe("¥2,980お得");
    expect(pro?.price).toBe("¥29,800");
    expect(pro?.period).toBe("年");
    expect(pro?.savingsNote).toBe("¥5,960お得");
  });
});
