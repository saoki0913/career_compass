import { describe, expect, it } from "vitest";
import { getMarketingPricingPlans } from "./pricing-plans";

describe("getMarketingPricingPlans", () => {
  it("returns the monthly plan summary used by marketing pages", () => {
    const plans = getMarketingPricingPlans("monthly");

    expect(plans.map((plan) => plan.id)).toEqual(["free", "standard", "pro"]);
    expect(plans[0]?.features).toContain("月50クレジット");
    expect(plans[1]?.features).toContain("月350クレジット");
    expect(plans[2]?.features).toContain("月750クレジット");
    expect(plans[0]?.features).toContain(
      "面接対策（開始2CR・回答/続き各1CR・最終講評6CR）"
    );
    expect(plans[1]?.features).toContain(
      "企業情報の自動整理 月200ページまで無料"
    );
    expect(plans[2]?.features).toContain(
      "企業情報の自動整理 月500ページまで無料"
    );
    expect(plans[1]?.features).toContain(
      "面接対策（開始2CR・回答/続き各1CR・最終講評6CR）"
    );
    expect(plans[2]?.features).toContain(
      "面接対策（開始2CR・回答/続き各1CR・最終講評6CR）"
    );
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
