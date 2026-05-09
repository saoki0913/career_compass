import { afterEach, describe, expect, it, vi } from "vitest";

async function importConfig() {
  vi.resetModules();
  return import("@/lib/stripe/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stripe config", () => {
  it("returns annual price ids when configured", async () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");

    const { getPriceId } = await importConfig();

    expect(getPriceId("standard", "annual")).toBe("price_std_year");
    expect(getPriceId("pro", "annual")).toBe("price_pro_year");
  });

  it("detects billing period from price ids", async () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");

    const { getBillingPeriodFromPriceId } = await importConfig();

    expect(getBillingPeriodFromPriceId("price_std_month")).toBe("monthly");
    expect(getBillingPeriodFromPriceId("price_pro_year")).toBe("annual");
    expect(getBillingPeriodFromPriceId("price_unknown")).toBeNull();
  });

  it("warns when price env vars are missing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { validateStripePriceConfig } = await importConfig();

    validateStripePriceConfig();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("STRIPE_PRICE_STANDARD_MONTHLY");
    spy.mockRestore();
  });

  it("does not warn when all price env vars are set", async () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { validateStripePriceConfig } = await importConfig();

    validateStripePriceConfig();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
