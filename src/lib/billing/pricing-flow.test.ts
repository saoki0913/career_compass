import { describe, expect, it } from "vitest";

import {
  PRICING_CHECKOUT_PATH,
  PRICING_INTENT_STORAGE_KEY,
  createPricingIntent,
  getPricingSelectionAction,
  parsePricingIntent,
  restorePricingIntent,
  savePricingIntent,
  shouldDeferOnboardingForPricingIntent,
} from "@/lib/billing/pricing-flow";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("getPricingSelectionAction", () => {
  it("routes paid subscribers with active subscription to portal", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "standard",
        targetPlan: "pro",
        isAuthenticated: true,
        hasActiveSubscription: true,
      })
    ).toBe("portal");
  });

  it("routes paid users without active subscription to checkout", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "standard",
        targetPlan: "pro",
        isAuthenticated: true,
        hasActiveSubscription: false,
      })
    ).toBe("checkout");
  });

  it("routes authenticated free users to checkout", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "free",
        targetPlan: "standard",
        isAuthenticated: true,
        hasActiveSubscription: false,
      })
    ).toBe("checkout");
  });

  it("routes anonymous users to login before checkout", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: null,
        targetPlan: "pro",
        isAuthenticated: false,
        hasActiveSubscription: false,
      })
    ).toBe("login");
  });

  it("routes pro user with active subscription to portal for downgrade", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "pro",
        targetPlan: "standard",
        isAuthenticated: true,
        hasActiveSubscription: true,
      })
    ).toBe("portal");
  });

  it("routes to dashboard when selecting current plan", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "standard",
        targetPlan: "standard",
        isAuthenticated: true,
        hasActiveSubscription: true,
      })
    ).toBe("dashboard");
  });

  it("routes to free action when selecting free plan", () => {
    expect(
      getPricingSelectionAction({
        currentPlan: "standard",
        targetPlan: "free",
        isAuthenticated: true,
        hasActiveSubscription: true,
      })
    ).toBe("free");
  });
});

describe("pricing intent helpers", () => {
  it("builds and restores valid paid checkout intent", () => {
    const storage = new MemoryStorage();
    const intent = createPricingIntent({
      plan: "standard",
      period: "monthly",
      source: "lp-pricing",
      now: 1_000,
    });

    savePricingIntent(storage, intent);

    expect(storage.getItem(PRICING_INTENT_STORAGE_KEY)).toContain("standard");
    expect(restorePricingIntent(storage, 1_100)).toEqual(intent);
  });

  it("rejects free, invalid period, and expired checkout intent", () => {
    expect(parsePricingIntent({
      plan: "free",
      period: "monthly",
      source: "lp-pricing",
      expiresAt: 2_000,
    }, 1_000)).toBeNull();
    expect(parsePricingIntent({
      plan: "standard",
      period: "weekly",
      source: "lp-pricing",
      expiresAt: 2_000,
    }, 1_000)).toBeNull();
    expect(parsePricingIntent({
      plan: "pro",
      period: "monthly",
      source: "lp-pricing",
      expiresAt: 900,
    }, 1_000)).toBeNull();
  });

  it("defers onboarding only on the checkout resolver with a valid intent", () => {
    const storage = new MemoryStorage();
    savePricingIntent(storage, createPricingIntent({
      plan: "pro",
      period: "monthly",
      source: "lp-pricing",
      now: 1_000,
    }));

    expect(shouldDeferOnboardingForPricingIntent({
      pathname: PRICING_CHECKOUT_PATH,
      storage,
      now: 1_100,
    })).toBe(true);
    expect(shouldDeferOnboardingForPricingIntent({
      pathname: "/dashboard",
      storage,
      now: 1_100,
    })).toBe(false);
  });
});
