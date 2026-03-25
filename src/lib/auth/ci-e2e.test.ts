import { describe, expect, it } from "vitest";
import {
  getBetterAuthSessionCookieAttributes,
  getBetterAuthSessionCookieCandidates,
  getBetterAuthSessionCookieName,
  isCiE2EAuthEnabled,
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

  it("only enables CI auth when the flag is set and the app is not production", () => {
    process.env.CI_E2E_AUTH_ENABLED = "1";
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(true);
    expect(isCiE2EAuthEnabled("https://www.shupass.jp")).toBe(false);
    process.env.CI_E2E_AUTH_ENABLED = "0";
    expect(isCiE2EAuthEnabled("https://stg.shupass.jp")).toBe(false);
  });
});
