import type { PlanType } from "@/lib/stripe/config";

type SearchParamsLike = Pick<URLSearchParams, "get">;

export function getCheckoutAbandonState(searchParams: SearchParamsLike) {
  return {
    canceled: searchParams.get("canceled") === "true",
  };
}

export function getPurchaseSuccessState(searchParams: SearchParamsLike): {
  success: boolean;
  plan: PlanType | null;
} {
  const success = searchParams.get("success") === "true";
  const plan = searchParams.get("plan");

  if (!success) {
    return { success: false, plan: null };
  }

  if (plan === "free" || plan === "standard" || plan === "pro") {
    return { success: true, plan };
  }

  return { success: true, plan: null };
}
