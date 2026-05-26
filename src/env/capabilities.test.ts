import { describe, expect, it } from "vitest";
import {
  AuthConfigurationError,
  getDatabaseEnvStatus,
  getRuntimeEnvProfile,
  requireAuthEnv,
  validateStartupCapabilities,
} from "./capabilities";

const validAuthEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
};

const validDeployedEnv = {
  ...validAuthEnv,
  APP_ENV: "production",
  NEXT_PUBLIC_APP_ENV: "production",
  BETTER_AUTH_URL: "https://www.shupass.jp",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://www.shupass.jp,https://shupass.jp",
  STRIPE_SECRET_KEY: "sk_live_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  ENCRYPTION_KEY: "a".repeat(64),
  CRON_SECRET: "cron-secret",
  INTERNAL_API_JWT_SECRET: "i".repeat(32),
  CAREER_PRINCIPAL_HMAC_SECRET: "p".repeat(32),
  TENANT_KEY_SECRET: "t".repeat(32),
  FASTAPI_URL: "https://api.shupass.jp",
};

describe("capability env validation", () => {
  it("allows auth env without unrelated Stripe, FastAPI, cron, or encryption env", () => {
    const authEnv = requireAuthEnv({
      ...validAuthEnv,
      NEXT_PUBLIC_APP_URL: "",
    });

    expect(authEnv.GOOGLE_CLIENT_ID).toBe("google-client");
    expect(authEnv.baseURL).toBe("http://localhost:3000");
  });

  it("reports auth env failures as typed safe keys", () => {
    expect(() =>
      requireAuthEnv({
        ...validAuthEnv,
        GOOGLE_CLIENT_SECRET: "",
      }),
    ).toThrow(AuthConfigurationError);
  });

  it("does not require DB for the local startup profile", () => {
    const report = validateStartupCapabilities("development", {});

    expect(report.fatal).toEqual([]);
    expect(report.disabled).toContain("database");
  });

  it("requires deployed profile capabilities in staging", () => {
    const report = validateStartupCapabilities("staging", {
      ...validAuthEnv,
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "staging",
      BETTER_AUTH_URL: "https://stg.shupass.jp",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://stg.shupass.jp",
    });

    expect(report.fatal.join("\n")).toMatch(/STRIPE_SECRET_KEY/);
    expect(report.fatal.join("\n")).toMatch(/FASTAPI_URL/);
    expect(report.fatal.join("\n")).toMatch(/TENANT_KEY_SECRET/);
  });

  it("maps explicit APP_ENV staging even when Vercel uses production env scope", () => {
    expect(
      getRuntimeEnvProfile({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_ENV: "staging",
      }),
    ).toBe("staging");
  });

  it("does not treat Vercel preview as an official runtime profile", () => {
    expect(getRuntimeEnvProfile({ VERCEL_ENV: "preview", NODE_ENV: "development" })).toBe("development");
  });

  it("treats explicit local app env as development even during local production builds", () => {
    expect(
      getRuntimeEnvProfile({
        NODE_ENV: "production",
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ENV: "local",
      }),
    ).toBe("development");
  });

  it("rejects mismatched APP_ENV and NEXT_PUBLIC_APP_ENV in deployed builds", () => {
    const report = validateStartupCapabilities("staging", {
      ...validDeployedEnv,
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "production",
      BETTER_AUTH_URL: "https://stg.shupass.jp",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://stg.shupass.jp",
    });

    expect(report.fatal.join("\n")).toMatch(/APP_ENV and NEXT_PUBLIC_APP_ENV must match/);
  });

  it("rejects local app env in deployed builds", () => {
    const report = validateStartupCapabilities("production", {
      ...validDeployedEnv,
      APP_ENV: "local",
      NEXT_PUBLIC_APP_ENV: "local",
      STRIPE_PRICE_STANDARD_MONTHLY: "price_std_month",
      STRIPE_PRICE_STANDARD_ANNUAL: "price_std_year",
      STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
      STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_test",
    });

    expect(report.fatal.join("\n")).toMatch(/must not be local/);
  });

  it("requires Stripe portal configuration in production", () => {
    const report = validateStartupCapabilities("production", {
      ...validDeployedEnv,
      STRIPE_PRICE_STANDARD_MONTHLY: "price_std_month",
      STRIPE_PRICE_STANDARD_ANNUAL: "price_std_year",
      STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
      STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
    });

    expect(report.fatal.join("\n")).toMatch(/STRIPE_PORTAL_CONFIGURATION_ID/);
  });

  it("rejects extra trusted origins in deployed profiles", () => {
    const report = validateStartupCapabilities("staging", {
      ...validDeployedEnv,
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_ENV: "staging",
      BETTER_AUTH_URL: "https://stg.shupass.jp",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://stg.shupass.jp,https://www.shupass.jp",
    });

    expect(report.fatal.join("\n")).toMatch(/must exactly match https:\/\/stg\.shupass\.jp/);
    expect(report.fatal.join("\n")).toMatch(/Unexpected: https:\/\/www\.shupass\.jp/);
  });

  it("rejects invalid Stripe portal configuration format in production", () => {
    const report = validateStartupCapabilities("production", {
      ...validDeployedEnv,
      STRIPE_PRICE_STANDARD_MONTHLY: "price_std_month",
      STRIPE_PRICE_STANDARD_ANNUAL: "price_std_year",
      STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
      STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
      STRIPE_PORTAL_CONFIGURATION_ID: "portal_test",
    });

    expect(report.fatal.join("\n")).toMatch(/STRIPE_PORTAL_CONFIGURATION_ID/);
  });

  it("accepts production startup env when all production gates are configured", () => {
    const report = validateStartupCapabilities("production", {
      ...validDeployedEnv,
      STRIPE_PRICE_STANDARD_MONTHLY: "price_std_month",
      STRIPE_PRICE_STANDARD_ANNUAL: "price_std_year",
      STRIPE_PRICE_PRO_MONTHLY: "price_pro_month",
      STRIPE_PRICE_PRO_ANNUAL: "price_pro_year",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_test",
    });

    expect(report.fatal).toEqual([]);
  });

  it("validates DATABASE_URL only when database capability is configured", () => {
    expect(getDatabaseEnvStatus({}).configured).toBe(false);
    expect(getDatabaseEnvStatus({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }).configured).toBe(true);
  });
});
