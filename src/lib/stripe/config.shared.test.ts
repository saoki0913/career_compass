import { describe, expect, it } from "vitest";

import managedConfig from "@/lib/stripe/managed-config.json";

const allPrices = managedConfig.products.flatMap((p) => p.prices);

describe("managed stripe config", () => {
  it("keeps standard and pro annual prices in shared config", () => {
    const annualPrices = allPrices.filter((price) => price.interval === "year");

    expect(annualPrices).toEqual([
      expect.objectContaining({
        envVar: "STRIPE_PRICE_STANDARD_ANNUAL",
        unitAmount: 14900,
      }),
      expect.objectContaining({
        envVar: "STRIPE_PRICE_PRO_ANNUAL",
        unitAmount: 29800,
      }),
    ]);
  });

  it("keeps production legal URLs and refund copy in managed config", () => {
    for (const product of managedConfig.products) {
      expect(product.description).toContain("自動更新");
      expect(product.description).toContain("解約");
      expect(product.description).toContain("次回更新日");
    }
    expect(managedConfig.portal.businessProfile.privacyPolicyUrl).toBe("https://www.shupass.jp/privacy");
    expect(managedConfig.portal.businessProfile.termsOfServiceUrl).toBe("https://www.shupass.jp/terms");
    expect(managedConfig.compliance.legalUrl).toBe("https://www.shupass.jp/legal");
    expect(managedConfig.compliance.termsUrl).toBe("https://www.shupass.jp/terms");
  });

  it("registers billing integrity webhook events", () => {
    expect(managedConfig.webhook.events).toEqual(expect.arrayContaining([
      "charge.refunded",
      "charge.dispute.created",
      "charge.dispute.closed",
    ]));
  });

  it("defines exactly 2 products with 2 prices each", () => {
    expect(managedConfig.products).toHaveLength(2);
    for (const product of managedConfig.products) {
      expect(product.prices).toHaveLength(2);
      const intervals = product.prices.map((p) => p.interval);
      expect(new Set(intervals).size).toBe(2);
    }
  });
});
