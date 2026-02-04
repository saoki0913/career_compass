/**
 * Stripe Price Configuration
 *
 * Maps plan names to Stripe price IDs.
 * Price IDs must be set in environment variables.
 */

export type PlanType = "free" | "standard" | "pro";
export type BillingPeriod = "monthly" | "annual";

/**
 * Stripe price IDs for each plan and billing period.
 * Set these in your .env.local file:
 *   STRIPE_PRICE_STANDARD_MONTHLY=price_xxx
 *   STRIPE_PRICE_PRO_MONTHLY=price_yyy
 */
export const STRIPE_PRICES: Record<
  Exclude<PlanType, "free">,
  Partial<Record<BillingPeriod, string>>
> = {
  standard: {
    monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY || "",
    // annual: process.env.STRIPE_PRICE_STANDARD_ANNUAL || "", // Future support
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
    // annual: process.env.STRIPE_PRICE_PRO_ANNUAL || "", // Future support
  },
};

/**
 * Plan metadata for display and credit allocation
 */
export const PLAN_METADATA = {
  free: {
    name: "Free",
    price: 0,
    credits: 30,
    companies: 5,
    esReviews: 3,
    gakuchika: 1,
  },
  standard: {
    name: "Standard",
    price: 980,
    credits: 300,
    companies: 30,
    esReviews: 10,
    gakuchika: 5,
  },
  pro: {
    name: "Pro",
    price: 2980,
    credits: 800,
    companies: -1, // unlimited
    esReviews: -1, // unlimited
    gakuchika: -1, // unlimited
  },
} as const;

/**
 * Get Stripe price ID for a plan and billing period.
 * Returns null for free plan or if price ID is not configured.
 */
export function getPriceId(
  plan: PlanType,
  period: BillingPeriod = "monthly"
): string | null {
  if (plan === "free") return null;
  const priceId = STRIPE_PRICES[plan]?.[period];
  return priceId && priceId.length > 0 ? priceId : null;
}

/**
 * Get plan type from Stripe price ID.
 * Returns null if price ID doesn't match any plan.
 */
export function getPlanFromPriceId(priceId: string): PlanType | null {
  for (const [plan, prices] of Object.entries(STRIPE_PRICES)) {
    for (const [, id] of Object.entries(prices)) {
      if (id === priceId) {
        return plan as PlanType;
      }
    }
  }
  return null;
}

/**
 * Check if a plan is a paid plan
 */
export function isPaidPlan(plan: PlanType): boolean {
  return plan !== "free";
}

/**
 * Get the credit allocation for a plan
 */
export function getPlanCredits(plan: PlanType): number {
  return PLAN_METADATA[plan].credits;
}
