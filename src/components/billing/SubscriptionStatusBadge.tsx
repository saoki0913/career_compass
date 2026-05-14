"use client";

import { Badge } from "@/components/ui/badge";
import {
  getSubscriptionStatusLabel,
  getSubscriptionStatusVariant,
} from "@/lib/billing/subscription-status-labels";

type SubscriptionStatusBadgeProps = {
  status: string | null | undefined;
  cancelAtPeriodEnd?: boolean;
};

export function SubscriptionStatusBadge({
  status,
  cancelAtPeriodEnd = false,
}: SubscriptionStatusBadgeProps) {
  if (!status) return null;

  return (
    <Badge variant={getSubscriptionStatusVariant(status, cancelAtPeriodEnd)}>
      {getSubscriptionStatusLabel(status, cancelAtPeriodEnd)}
    </Badge>
  );
}
