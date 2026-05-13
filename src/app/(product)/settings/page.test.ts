import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("settings guest gate", () => {
  it("uses LoginRequiredForAi instead of silent redirect for guests", () => {
    expect(source).toContain("LoginRequiredForAi");
    expect(source).toContain("アカウント設定");
    expect(source).toContain("fallbackAction");
  });
});

describe("settings billing boundary", () => {
  it("does not expose a direct settings plan mutation path", () => {
    expect(source).not.toContain("/api/settings/plan");
    expect(source).not.toContain("confirmDowngrade");
    expect(source).not.toContain("showPlanModal");
  });

  it("keeps Stripe as the billing state transition surface", () => {
    expect(source).toContain("/api/stripe/portal");
  });

  it("routes free-to-paid upgrades through the pricing page", () => {
    expect(source).toContain("/pricing");
    expect(source).not.toContain("/api/stripe/checkout");
  });

  it("checks subscriptionStatus before showing billing portal button", () => {
    expect(source).toContain("subscriptionStatus");
  });
});
