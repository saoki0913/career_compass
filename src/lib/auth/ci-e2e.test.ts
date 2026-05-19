import { describe, expect, it } from "vitest";
import {
  getBetterAuthSessionCookieAttributes,
  getBetterAuthSessionCookieCandidates,
  getBetterAuthSessionCookieName,
  hasValidCiE2EAuthSecret,
  isCiE2EAuthHostAllowed,
  isCiE2EAuthEnabled,
  isProductionLikeCiE2EEnvironment,
  isProductionAppUrl,
} from "@/lib/auth/ci-e2e";

describe("ci e2e auth helpers", () => {
  it("treats the production domains as non-eligible for CI auth", () => {
    expect(isProductionAppUrl("https://www.shupass.jp")).toBe(true);
    expect(isProductionAppUrl("https://shupass.jp")).toBe(true);
    expect(isProductionAppUrl("https://stg.shupass.jp")).toBe(false);
  });

  it("uses the secure Better Auth cookie name on https origins", () => {
    expect(getBetterAuthSessionCookieName("https://stg.shupass.jp")).toBe(
      "__Secure-better-auth.session_token"
    );
    expect(getBetterAuthSessionCookieCandidates("https://stg.shupass.jp")).toEqual([
      "__Secure-better-auth.session_token",
      "better-auth.session_token",
    ]);
    expect(getBetterAuthSessionCookieAttributes("https://stg.shupass.jp").secure).toBe(true);
  });

  it("requires explicit opt-in, an allowlisted host, and a strong shared secret", () => {
    process.env.CI_E2E_AUTH_SECRET = "top-secret-at-least-16";
    process.env.CI_E2E_AUTH_ENABLED = "1";
    expect(isCiE2EAuthHostAllowed("https://stg.shupass.jp")).toBe(true);
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(true);
    expect(isCiE2EAuthEnabled("https://www.shupass.jp")).toBe(false);
    expect(isCiE2EAuthEnabled("https://preview.example.com")).toBe(false);
    process.env.CI_E2E_AUTH_ENABLED = "0";
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);
    process.env.CI_E2E_AUTH_ENABLED = "1";
    process.env.CI_E2E_AUTH_SECRET = "short";
    expect(hasValidCiE2EAuthSecret()).toBe(false);
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);
    delete process.env.CI_E2E_AUTH_ENABLED;
    delete process.env.CI_E2E_AUTH_SECRET;
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);
  });

  it("allows additional CI auth hosts only through an explicit env allowlist", () => {
    process.env.CI_E2E_AUTH_ENABLED = "1";
    process.env.CI_E2E_AUTH_SECRET = "top-secret-at-least-16";
    process.env.CI_E2E_AUTH_ALLOWED_HOSTS = "preview.example.com";

    expect(isCiE2EAuthEnabled("https://preview.example.com")).toBe(true);

    delete process.env.CI_E2E_AUTH_ALLOWED_HOSTS;
    delete process.env.CI_E2E_AUTH_ENABLED;
    delete process.env.CI_E2E_AUTH_SECRET;
    delete process.env.VERCEL_ENV;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.DATABASE_URL;
  });

  it("disables CI auth in production-like environments", () => {
    process.env.CI_E2E_AUTH_ENABLED = "1";
    process.env.CI_E2E_AUTH_SECRET = "top-secret-at-least-16";

    process.env.APP_ENV = "production";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    expect(isProductionLikeCiE2EEnvironment()).toBe(true);
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);

    delete process.env.APP_ENV;
    delete process.env.NEXT_PUBLIC_APP_ENV;
    process.env.STRIPE_SECRET_KEY = "sk_live_placeholder";
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);

    delete process.env.STRIPE_SECRET_KEY;
    const productionDbHost = ["aws-1-ap-south-1", "pooler", "supabase", "com"].join(".");
    process.env.DATABASE_URL = `postgresql://user:pass@${productionDbHost}:6543/postgres`;
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);

    process.env.APP_ENV = "staging";
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    expect(isProductionLikeCiE2EEnvironment()).toBe(false);
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(true);

    delete process.env.CI_E2E_AUTH_ENABLED;
    delete process.env.CI_E2E_AUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.APP_ENV;
    delete process.env.NEXT_PUBLIC_APP_ENV;
  });
});
