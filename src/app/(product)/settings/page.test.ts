import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("settings guest gate", () => {
  it("uses LoginRequiredForAi instead of silent redirect for guests", () => {
    expect(source).toContain("LoginRequiredForAi");
    expect(source).toContain("アカウント設定");
    expect(source).toContain("fallbackAction");
  });

  it("gates settings API reads on authenticated state instead of guest state alone", () => {
    expect(source).toContain("isAuthenticated");
    expect(source).toContain("if (!isAuthenticated)");
    expect(source).not.toContain("if (!isAuthLoading && isGuest) return");
    expect(source).not.toContain("if (!isAuthLoading && !isGuest)");
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


describe("settings mobile-optimised profile form", () => {
  it("uses enlarged avatar on mobile with sm: breakpoint fallback", () => {
    expect(source).toContain("h-20 w-20");
    expect(source).toContain("sm:h-14 sm:w-14");
  });

  it("uses larger initials text on mobile", () => {
    expect(source).toContain("text-2xl");
    expect(source).toContain("sm:text-xl");
  });

  it("applies mobile-friendly height and rounding to profile form inputs", () => {
    expect(source).toContain("h-12 rounded-xl text-base sm:h-10 sm:rounded-lg sm:text-sm");
  });
});

describe("settings dense layout", () => {
  it("uses the shared header action for saving all settings", () => {
    expect(source).toContain("handleSaveAll");
    expect(source).toContain("設定を保存しました");
    expect(source).toContain("actions={");
  });

  it("uses the desktop two-column settings layout", () => {
    expect(source).toContain("max-w-[96rem]");
    expect(source).toContain("xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]");
    expect(source).toContain("aria-pressed={selected}");
  });

  it("renders the page header subtitle", () => {
    expect(source).toContain("プロフィールや通知の設定ができます");
  });
});
