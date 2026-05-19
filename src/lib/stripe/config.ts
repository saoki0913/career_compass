import { serverEnv } from "@/env/server";
import { resolveAppEnvironment } from "@/env/deployment";
export {
  ANNUAL_PLAN_PRICES,
  getCreditLowThreshold,
  getPlanCredits,
  isPaidPlan,
  PLAN_METADATA,
  type BillingPeriod,
  type PlanType,
  type PlanTypeWithGuest,
} from "@/lib/billing/plan-metadata";
import type { BillingPeriod, PlanType } from "@/lib/billing/plan-metadata";
import managedConfig from "./managed-config.json";

type ManagedPrice = {
  envVar: string;
  plan: string;
  billingPeriod: string;
  unitAmount: number;
  lookupKey: string;
  interval: string;
};

const allManagedPrices: ManagedPrice[] = managedConfig.products.flatMap(
  (p: { prices: ManagedPrice[] }) => p.prices,
);

type StripePricesMap = Record<
  Exclude<PlanType, "free">,
  Partial<Record<BillingPeriod, string>>
>;

let _stripePrices: StripePricesMap | undefined;

function getStripePrices(): StripePricesMap {
  if (!_stripePrices) {
    _stripePrices = {
      standard: {
        monthly: serverEnv.STRIPE_PRICE_STANDARD_MONTHLY || "",
        annual: serverEnv.STRIPE_PRICE_STANDARD_ANNUAL || "",
      },
      pro: {
        monthly: serverEnv.STRIPE_PRICE_PRO_MONTHLY || "",
        annual: serverEnv.STRIPE_PRICE_PRO_ANNUAL || "",
      },
    };
  }
  return _stripePrices;
}

/**
 * Get Stripe price ID for a plan and billing period.
 * Returns null for free plan or if price ID is not configured.
 */
export function getPriceId(
  plan: PlanType,
  period: BillingPeriod = "monthly"
): string | null {
  if (plan === "free") return null;
  const priceId = getStripePrices()[plan]?.[period];
  return priceId && priceId.length > 0 ? priceId : null;
}

/**
 * Get plan type from Stripe price ID.
 * Returns null if price ID doesn't match any plan.
 */
export function getPlanFromPriceId(priceId: string): PlanType | null {
  for (const [plan, prices] of Object.entries(getStripePrices())) {
    for (const [, id] of Object.entries(prices)) {
      if (id === priceId) {
        return plan as PlanType;
      }
    }
  }
  return null;
}

export function getBillingPeriodFromPriceId(priceId: string): BillingPeriod | null {
  for (const prices of Object.values(getStripePrices())) {
    for (const [period, id] of Object.entries(prices)) {
      if (id === priceId) {
        return period as BillingPeriod;
      }
    }
  }
  return null;
}

export function getPortalConfigurationId(): string | null {
  const value = serverEnv.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  return value && value.length > 0 ? value : null;
}

let _stripePriceEnvLookup: Record<string, string | undefined> | undefined;

function getStripePriceEnvLookup(): Record<string, string | undefined> {
  if (!_stripePriceEnvLookup) {
    _stripePriceEnvLookup = {
      STRIPE_PRICE_STANDARD_MONTHLY: serverEnv.STRIPE_PRICE_STANDARD_MONTHLY,
      STRIPE_PRICE_STANDARD_ANNUAL: serverEnv.STRIPE_PRICE_STANDARD_ANNUAL,
      STRIPE_PRICE_PRO_MONTHLY: serverEnv.STRIPE_PRICE_PRO_MONTHLY,
      STRIPE_PRICE_PRO_ANNUAL: serverEnv.STRIPE_PRICE_PRO_ANNUAL,
    };
  }
  return _stripePriceEnvLookup;
}

export function validateStripePriceConfig(): void {
  const allowTestStripeKeysInTestRuntime =
    serverEnv.CI_ALLOW_TEST_STRIPE_KEYS === "1" &&
    process.env.NODE_ENV === "test" &&
    process.env.VITEST === "true";
  const appEnv = resolveAppEnvironment();
  const isProduction =
    appEnv === "production" &&
    !allowTestStripeKeysInTestRuntime;
  const isStaging = appEnv === "staging";

  // --- Production hard gate: fatal errors that prevent server startup ---
  if (isProduction) {
    const secretKey = serverEnv.STRIPE_SECRET_KEY ?? "";
    if (secretKey.startsWith("sk_test_")) {
      throw new Error(
        "[Stripe] FATAL: STRIPE_SECRET_KEY is a test key (sk_test_*) in production. " +
          "Set a live key (sk_live_*) or remove the variable to prevent accidental test-mode billing.",
      );
    }

    const webhookSecret = serverEnv.STRIPE_WEBHOOK_SECRET ?? "";
    if (!webhookSecret) {
      throw new Error(
        "[Stripe] FATAL: STRIPE_WEBHOOK_SECRET is missing in production. " +
          "Webhook signature verification will fail for all incoming events.",
      );
    }

    const portalConfigurationId = serverEnv.STRIPE_PORTAL_CONFIGURATION_ID ?? "";
    if (!portalConfigurationId || !portalConfigurationId.startsWith("bpc_")) {
      throw new Error(
        "[Stripe] FATAL: STRIPE_PORTAL_CONFIGURATION_ID is missing or invalid in production. " +
          "Customer portal creation will fail for paid users.",
      );
    }
  }
  if (isStaging) {
    const secretKey = serverEnv.STRIPE_SECRET_KEY ?? "";
    if (secretKey.startsWith("sk_live_")) {
      throw new Error(
        "[Stripe] FATAL: STRIPE_SECRET_KEY is a live key (sk_live_*) in staging. " +
          "Set a test key (sk_test_*) for the staging environment.",
      );
    }
  }

  // --- Price env var validation (all environments) ---
  const missing: string[] = [];

  for (const spec of allManagedPrices) {
    const value = getStripePriceEnvLookup()[spec.envVar];
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
