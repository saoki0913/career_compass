import { afterEach, describe, expect, it, vi } from "vitest";

async function importConfig() {
  vi.resetModules();
  return import("@/lib/stripe/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { validateStripePriceConfig } = await importConfig();

    validateStripePriceConfig();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("STRIPE_PRICE_STANDARD_MONTHLY");
  });

  it("computes credit low threshold as 5% of allocation with floor of 10", async () => {
    const { getCreditLowThreshold } = await importConfig();

    // 5% of 750 = 37.5 -> ceil = 38
    expect(getCreditLowThreshold(750)).toBe(38);
    // 5% of 350 = 17.5 -> ceil = 18
    expect(getCreditLowThreshold(350)).toBe(18);
    // 5% of 50 = 2.5 -> ceil = 3, but floor is 10
    expect(getCreditLowThreshold(50)).toBe(10);
    // 5% of 0 = 0 -> ceil = 0, but floor is 10
    expect(getCreditLowThreshold(0)).toBe(10);
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
  });
});

describe("validateStripePriceConfig production hard gate", () => {
  it("throws when STRIPE_SECRET_KEY is a test key in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");

    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).toThrow(
      "STRIPE_SECRET_KEY is a test key",
    );
  });

  it("throws when STRIPE_WEBHOOK_SECRET is missing in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");

    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).toThrow(
      "STRIPE_WEBHOOK_SECRET is missing",
    );
  });

  it("throws when price env vars are missing in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    // All price vars are unset by default

    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).toThrow(
      "Missing or invalid price env vars in production",
    );
  });

  it("does not throw in production when all vars are correctly set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    vi.stubEnv("STRIPE_PRICE_STANDARD_MONTHLY", "price_std_month");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_std_year");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_month");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_year");

    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).not.toThrow();
  });

  it("does not skip hard gate in production when only CI_ALLOW_TEST_STRIPE_KEYS is set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CI_ALLOW_TEST_STRIPE_KEYS", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");

    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).toThrow(
      "STRIPE_SECRET_KEY is a test key",
    );
  });

  it("skips hard gate only in test runtime when CI_ALLOW_TEST_STRIPE_KEYS is set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CI_ALLOW_TEST_STRIPE_KEYS", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).not.toThrow();
    spy.mockRestore();
  });

  it("only warns (does not throw) for missing prices in non-production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");
    // All price vars are unset by default

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { validateStripePriceConfig } = await importConfig();

    expect(() => validateStripePriceConfig()).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
