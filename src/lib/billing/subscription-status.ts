export const ACTIVE_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "trialing"];
export const BILLING_PORTAL_MANAGEABLE_STATUSES: readonly string[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
  "refunded",
  "dispute_lost",
];

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  return status != null && ACTIVE_SUBSCRIPTION_STATUSES.includes(status);
}

export function canManageSubscriptionInPortal(status: string | null | undefined): boolean {
  return status != null && BILLING_PORTAL_MANAGEABLE_STATUSES.includes(status);
}

export function requiresBillingPortalAttention(status: string | null | undefined): boolean {
  return (
    status === "past_due" ||
    status === "unpaid" ||
    status === "paused" ||
    status === "incomplete" ||
    status === "refunded" ||
    status === "dispute_lost"
  );
}
