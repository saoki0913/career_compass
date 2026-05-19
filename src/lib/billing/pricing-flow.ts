import type { BillingPeriod, PlanType } from "@/lib/billing/plan-metadata";
import { canManageSubscriptionInPortal, requiresBillingPortalAttention } from "@/lib/billing/subscription-status";

export type PricingSelectionAction = "dashboard" | "free" | "login" | "checkout" | "portal";
export type PaidPlanType = Exclude<PlanType, "free">;
export type PricingIntentSource = "lp-pricing" | "pricing";

export type PricingIntent = {
  plan: PaidPlanType;
  period: BillingPeriod;
  source: PricingIntentSource;
  reason?: string;
  expiresAt: number;
};

export const PRICING_INTENT_STORAGE_KEY = "shupass.pricingIntent";
export const PRICING_INTENT_TTL_MS = 30 * 60 * 1000;
export const PRICING_CHECKOUT_PATH = "/pricing/checkout";

type PricingSelectionInput = {
  currentPlan: PlanType | null;
  targetPlan: PlanType;
  isAuthenticated: boolean;
  hasActiveSubscription: boolean;
  subscriptionStatus?: string | null;
};

type PricingIntentInput = {
  plan: PaidPlanType;
  period: BillingPeriod;
  source: PricingIntentSource;
  reason?: string;
  now?: number;
};

type PricingIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getPricingSelectionAction(
  input: PricingSelectionInput
): PricingSelectionAction {
  const { currentPlan, targetPlan, isAuthenticated, hasActiveSubscription } = input;

  if (!isAuthenticated) {
    return targetPlan === "free" ? "free" : "login";
  }

  if (requiresBillingPortalAttention(input.subscriptionStatus)) {
    return "portal";
  }

  if (currentPlan === targetPlan) {
    return "dashboard";
  }

  if (targetPlan === "free") {
    return "free";
  }

  if (
    (currentPlan === "standard" || currentPlan === "pro") &&
    (hasActiveSubscription || canManageSubscriptionInPortal(input.subscriptionStatus))
  ) {
    return "portal";
  }

  return "checkout";
}

export function isPaidPlanType(value: unknown): value is PaidPlanType {
  return value === "standard" || value === "pro";
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "annual";
}

export function isPricingIntentSource(value: unknown): value is PricingIntentSource {
  return value === "lp-pricing" || value === "pricing";
}

export function createPricingIntent(input: PricingIntentInput): PricingIntent {
  return {
    plan: input.plan,
    period: input.period,
    source: input.source,
    reason: input.reason,
    expiresAt: (input.now ?? Date.now()) + PRICING_INTENT_TTL_MS,
  };
}

export function parsePricingIntent(value: unknown, now = Date.now()): PricingIntent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PricingIntent>;
  if (!isPaidPlanType(candidate.plan)) {
    return null;
  }
  if (!isBillingPeriod(candidate.period)) {
    return null;
  }
  if (!isPricingIntentSource(candidate.source)) {
    return null;
  }
  if (typeof candidate.expiresAt !== "number" || !Number.isFinite(candidate.expiresAt)) {
    return null;
  }
  if (candidate.expiresAt <= now) {
    return null;
  }
  if (candidate.reason !== undefined && typeof candidate.reason !== "string") {
    return null;
  }

  return {
    plan: candidate.plan,
    period: candidate.period,
    source: candidate.source,
    reason: candidate.reason,
    expiresAt: candidate.expiresAt,
  };
}

export function savePricingIntent(storage: Pick<PricingIntentStorage, "setItem">, intent: PricingIntent): void {
  storage.setItem(PRICING_INTENT_STORAGE_KEY, JSON.stringify(intent));
}

export function trySavePricingIntent(
  storage: Pick<PricingIntentStorage, "setItem">,
  intent: PricingIntent,
): boolean {
  try {
    savePricingIntent(storage, intent);
    return true;
  } catch {
    return false;
  }
}

export function clearPricingIntent(storage: Pick<PricingIntentStorage, "removeItem">): void {
  storage.removeItem(PRICING_INTENT_STORAGE_KEY);
}

export function tryClearPricingIntent(storage: Pick<PricingIntentStorage, "removeItem">): boolean {
  try {
    clearPricingIntent(storage);
    return true;
  } catch {
    return false;
  }
}

export function restorePricingIntent(storage: PricingIntentStorage, now = Date.now()): PricingIntent | null {
  try {
    const raw = storage.getItem(PRICING_INTENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = parsePricingIntent(JSON.parse(raw), now);
    if (!parsed) {
      tryClearPricingIntent(storage);
    }
    return parsed;
  } catch {
    tryClearPricingIntent(storage);
    return null;
  }
}

export function shouldDeferOnboardingForPricingIntent({
  pathname,
  storage,
  now,
}: {
  pathname: string;
  storage: PricingIntentStorage;
  now?: number;
}): boolean {
  return pathname === PRICING_CHECKOUT_PATH && restorePricingIntent(storage, now) !== null;
}
