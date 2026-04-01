import type { PlanType } from "@/lib/stripe/config";

export type PricingSelectionAction = "dashboard" | "free" | "login" | "checkout" | "portal";

type PricingSelectionInput = {
  currentPlan: PlanType | null;
  targetPlan: PlanType;
  isAuthenticated: boolean;
};

export function getPricingSelectionAction(
  input: PricingSelectionInput
): PricingSelectionAction {
  const { currentPlan, targetPlan, isAuthenticated } = input;

  if (currentPlan === targetPlan) {
    return "dashboard";
  }

  if (targetPlan === "free") {
    return "free";
  }

  if (!isAuthenticated) {
    return "login";
  }

  if (currentPlan === "standard" || currentPlan === "pro") {
    return "portal";
  }

  return "checkout";
}
