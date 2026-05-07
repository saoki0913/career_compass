import { describe, expect, it } from "vitest";

import managedConfig from "@/lib/stripe/managed-config.json";

describe("managed stripe config", () => {
  it("keeps standard and pro annual prices in shared config", () => {
    const annualPrices = managedConfig.prices.filter((price) => price.interval === "year");

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
    expect(managedConfig.product.description).toContain("自動更新");
    expect(managedConfig.product.description).toContain("Standard / Pro");
    expect(managedConfig.product.description).toContain("月額・年額");
    expect(managedConfig.product.description).toContain("解約");
    expect(managedConfig.product.description).toContain("次回更新日");
    expect(managedConfig.product.description).toContain("返金");
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
});
