import managedConfig from "./managed-config.json";

/**
 * Stripe Price Configuration
 *
 * Maps plan names to Stripe price IDs.
 * Price IDs must be set in environment variables.
 */

export type PlanType = "free" | "standard" | "pro";
export type PlanTypeWithGuest = "guest" | "free" | "standard" | "pro";
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
    monthly: process.env[managedConfig.prices[0].envVar] || "",
    annual: process.env[managedConfig.prices[1].envVar] || "",
  },
  pro: {
    monthly: process.env[managedConfig.prices[2].envVar] || "",
    annual: process.env[managedConfig.prices[3].envVar] || "",
  },
};

/**
 * Plan metadata for display and credit allocation
 */
export const PLAN_METADATA = {
  guest: {
    name: "Guest",
    price: 0,
    credits: 0,
    companies: 3,
    // AI 機能はログイン後。以下は表示用ヒント。
    esReviews: 0,
    gakuchika: 0,
  },
  free: {
    name: "Free",
    price: 0,
    credits: 50,
    companies: 5,
    esReviews: 3,
    gakuchika: 5,
  },
  standard: {
    name: "Standard",
    price: 1490,
    credits: 350,
    companies: -1, // unlimited
    esReviews: 10, // display-only hint
    gakuchika: 15,
  },
  pro: {
    name: "Pro",
    price: 2980,
    credits: 750,
    companies: -1, // unlimited
    esReviews: -1, // display-only hint
    gakuchika: 30,
  },
} as const;

export const ANNUAL_PLAN_PRICES: Record<Exclude<PlanType, "free">, number> = {
  /** Standard 年額 */
  standard: managedConfig.prices[1].unitAmount,
  pro: managedConfig.prices[3].unitAmount,
};

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

export function getBillingPeriodFromPriceId(priceId: string): BillingPeriod | null {
  for (const prices of Object.values(STRIPE_PRICES)) {
    for (const [period, id] of Object.entries(prices)) {
      if (id === priceId) {
        return period as BillingPeriod;
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

export function getCreditLowThreshold(monthlyAllocation: number): number {
  return Math.max(10, Math.ceil(monthlyAllocation * 0.05));
}

export function validateStripePriceConfig(): void {
  const allowTestStripeKeysInTestRuntime =
    process.env.CI_ALLOW_TEST_STRIPE_KEYS === "1" &&
    process.env.NODE_ENV === "test" &&
    process.env.VITEST === "true";
  const isProduction =
    process.env.VERCEL_ENV === "production" &&
    !allowTestStripeKeysInTestRuntime;

  // --- Production hard gate: fatal errors that prevent server startup ---
  if (isProduction) {
    const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
    if (secretKey.startsWith("sk_test_")) {
      throw new Error(
        "[Stripe] FATAL: STRIPE_SECRET_KEY is a test key (sk_test_*) in production. " +
          "Set a live key (sk_live_*) or remove the variable to prevent accidental test-mode billing.",
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!webhookSecret) {
      throw new Error(
        "[Stripe] FATAL: STRIPE_WEBHOOK_SECRET is missing in production. " +
          "Webhook signature verification will fail for all incoming events.",
      );
    }
  }

  // --- Price env var validation (all environments) ---
  const missing: string[] = [];

  for (const spec of managedConfig.prices) {
    const value = process.env[spec.envVar];
    if (!value || !value.startsWith("price_")) {
      missing.push(spec.envVar);
    }
  }

  if (missing.length > 0) {
    if (isProduction) {
      throw new Error(
        `[Stripe] FATAL: Missing or invalid price env vars in production: ${missing.join(", ")}. ` +
          "All 4 price IDs must be set with a 'price_' prefix for checkout to function.",
      );
    }
    console.error(
      `[Stripe] Missing or invalid price env vars: ${missing.join(", ")}. Checkout will fail for affected plans.`,
    );
  }
}
