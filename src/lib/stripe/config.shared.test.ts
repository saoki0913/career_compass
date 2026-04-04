import { describe, expect, it } from "vitest";

import managedConfig from "@/lib/stripe/managed-config.json";

describe("managed stripe config", () => {
  it("keeps standard and pro annual prices in shared config", () => {
    const annualPrices = managedConfig.prices.filter((price) => price.interval === "year");

    expect(annualPrices).toEqual([
      expect.objectContaining({
        envVar: "STRIPE_PRICE_STANDARD_ANNUAL",
        unitAmount: 14980,
      }),
      expect.objectContaining({
        envVar: "STRIPE_PRICE_PRO_ANNUAL",
        unitAmount: 29800,
      }),
    ]);
  });
});
