import managedConfig from "@/lib/stripe/managed-config.json";

export type PlanType = "free" | "standard" | "pro";
export type PlanTypeWithGuest = "guest" | "free" | "standard" | "pro";
export type BillingPeriod = "monthly" | "annual";

type ManagedPrice = {
  plan: string;
  billingPeriod: string;
  unitAmount: number;
};

const allManagedPrices: ManagedPrice[] = managedConfig.products.flatMap(
  (product: { prices: ManagedPrice[] }) => product.prices,
);

function findManagedPrice(
  plan: Exclude<PlanType, "free">,
  period: BillingPeriod,
): ManagedPrice {
  const found = allManagedPrices.find(
    (price) => price.plan === plan && price.billingPeriod === period,
  );
  if (!found) {
    throw new Error(`managed-config.json: price not found for ${plan}/${period}`);
  }
  return found;
}

export const ANNUAL_PLAN_PRICES: Record<Exclude<PlanType, "free">, number> = {
  standard: findManagedPrice("standard", "annual").unitAmount,
  pro: findManagedPrice("pro", "annual").unitAmount,
};

export const PLAN_METADATA = {
  guest: {
    name: "Guest",
    price: 0,
    credits: 0,
    companies: 3,
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
    companies: -1,
    esReviews: 10,
    gakuchika: 15,
  },
  pro: {
    name: "Pro",
    price: 2980,
    credits: 750,
    companies: -1,
    esReviews: -1,
    gakuchika: 30,
  },
} as const;

export function isPaidPlan(plan: PlanType): boolean {
  return plan !== "free";
}

export function getPlanCredits(plan: PlanType): number {
  return PLAN_METADATA[plan].credits;
}

export function getCreditLowThreshold(monthlyAllocation: number): number {
  return Math.max(10, Math.ceil(monthlyAllocation * 0.05));
}
