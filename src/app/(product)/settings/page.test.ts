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
    expect(source).not.toContain("/api/stripe/checkout");
  });

  it("checks subscriptionStatus via billingProfile passed to BillingSection", () => {
    expect(source).toContain("subscriptionStatus");
    expect(source).toContain("BillingSection");
    expect(source).toContain("billingProfile");
  });

  it("detects portal return via search params and shows detailed notification", () => {
    expect(source).toContain('searchParams.get("portal")');
    expect(source).toContain("notifyPortalReturnDetailed");
  });
});

describe("settings billing extraction", () => {
  it("delegates billing UI to BillingSection component", () => {
    expect(source).toContain("BillingSection");
    expect(source).toContain("<BillingSection");
  });

  it("does not contain inline plan management grid (extracted to BillingSection)", () => {
    expect(source).not.toContain("CheckIcon");
    expect(source).not.toContain("handlePlanChange");
  });

  it("does not import isActiveSubscriptionStatus directly", () => {
    expect(source).not.toContain("isActiveSubscriptionStatus");
  });
});
