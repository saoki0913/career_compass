export const ACTIVE_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "trialing"];

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  return status != null && ACTIVE_SUBSCRIPTION_STATUSES.includes(status);
}
