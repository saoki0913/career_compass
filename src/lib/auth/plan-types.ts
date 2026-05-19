export type UserPlanName = "free" | "standard" | "pro";

export interface UserPlanResponse {
  plan: UserPlanName | null;
  planSelectedAt: string | null;
  needsPlanSelection: boolean;
  onboardingCompleted: boolean;
  needsOnboarding: boolean;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
}

export function normalizeUserPlanName(value: unknown): UserPlanName | null {
  return value === "free" || value === "standard" || value === "pro" ? value : null;
}
