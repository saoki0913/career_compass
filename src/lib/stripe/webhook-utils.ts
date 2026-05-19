import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { processedStripeEvents, subscriptions } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { getPlanFromPriceId, type PlanType } from "@/lib/stripe/config";

export type StoredSubscriptionState = typeof subscriptions.$inferSelect;

export const STALE_WEBHOOK_PROCESSING_MS = 10 * 60 * 1000;

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  if ("cause" in error) {
    return isPostgresUniqueViolation(error.cause);
  }

  return false;
}

export function requirePlanFromPriceId(priceId: string, eventType: string): PlanType {
  const plan = getPlanFromPriceId(priceId);
  if (!plan) {
    throw new Error(`Unknown Stripe price id for ${eventType}: ${priceId}`);
  }
  return plan;
}

export function stripeEventCreatedAt(event: Stripe.Event): Date {
  return typeof event.created === "number" ? new Date(event.created * 1000) : new Date();
}

export type StripeSubscriptionMutationKind =
  | "checkout"
  | "restore"
  | "subscription_updated"
  | "subscription_deleted"
  | "billing_hold_opened"
  | "billing_hold_closed"
  | "financial_downgrade";

export function stripeSubscriptionEventRank(kind: StripeSubscriptionMutationKind): number {
  switch (kind) {
    case "checkout":
      return 10;
    case "restore":
      return 20;
    case "subscription_updated":
      return 30;
    case "subscription_deleted":
      return 80;
    case "billing_hold_opened":
      return 90;
    case "billing_hold_closed":
      return 95;
    case "financial_downgrade":
      return 100;
  }
}

export function shouldApplySubscriptionEvent(
  existingSub: Pick<StoredSubscriptionState, "lastStripeEventCreatedAt" | "lastStripeEventRank" | "lastStripeEventId"> | undefined | null,
  event: Stripe.Event,
  kind: StripeSubscriptionMutationKind,
): boolean {
  const lastCreatedAt = existingSub?.lastStripeEventCreatedAt;
  if (!lastCreatedAt) return true;
  const eventCreatedAt = stripeEventCreatedAt(event);
  if (lastCreatedAt.getTime() > eventCreatedAt.getTime()) return false;
  if (lastCreatedAt.getTime() < eventCreatedAt.getTime()) return true;
  const currentRank = existingSub?.lastStripeEventRank ?? 0;
  const nextRank = stripeSubscriptionEventRank(kind);
  if (currentRank > nextRank) return false;
  if (currentRank < nextRank) return true;
  return false;
}

export function hasSameStripeSubscriptionWatermarkRank(
  existingSub: Pick<StoredSubscriptionState, "lastStripeEventCreatedAt" | "lastStripeEventRank"> | undefined | null,
  event: Stripe.Event,
  kind: StripeSubscriptionMutationKind,
): boolean {
  const lastCreatedAt = existingSub?.lastStripeEventCreatedAt;
  if (!lastCreatedAt) return false;
  return (
    lastCreatedAt.getTime() === stripeEventCreatedAt(event).getTime() &&
    (existingSub?.lastStripeEventRank ?? 0) === stripeSubscriptionEventRank(kind)
  );
}

export function stripeSubscriptionEventWatermark(
  event: Stripe.Event,
  kind: StripeSubscriptionMutationKind,
): {
  lastStripeEventId: string;
  lastStripeEventCreatedAt: Date;
  lastStripeEventType: string;
  lastStripeEventRank: number;
} {
  return {
    lastStripeEventId: event.id,
    lastStripeEventCreatedAt: stripeEventCreatedAt(event),
    lastStripeEventType: event.type,
    lastStripeEventRank: stripeSubscriptionEventRank(kind),
  };
}

export function isSubscriptionEntitled(subscription: Stripe.Subscription): boolean {
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end;
  return (
    (subscription.status === "active" || subscription.status === "trialing") &&
    typeof periodEnd === "number" &&
    periodEnd * 1000 > Date.now()
  );
}

export async function claimStripeEvent(
  event: Stripe.Event,
): Promise<"claimed" | "duplicate_succeeded" | "in_flight"> {
  const now = new Date();

  try {
    await db.insert(processedStripeEvents).values({
      eventId: event.id,
      eventType: event.type,
      status: "processing",
      startedAt: now,
      stripeCreated: stripeEventCreatedAt(event),
      attemptCount: 1,
    });
    return "claimed";
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) {
      throw error;
    }
  }

  const [existing] = await db
    .select()
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.eventId, event.id))
    .limit(1);

  if (!existing) {
    throw new Error("Stripe idempotency row disappeared after unique violation");
  }

  if (existing.status === "succeeded") {
    return "duplicate_succeeded";
  }

  const startedAt = existing.startedAt ?? existing.processedAt;
  const stale =
    !startedAt || now.getTime() - startedAt.getTime() > STALE_WEBHOOK_PROCESSING_MS;

  if (existing.status === "processing" && !stale) {
    return "in_flight";
  }

  const startedAtCondition = existing.startedAt
    ? eq(processedStripeEvents.startedAt, existing.startedAt)
    : isNull(processedStripeEvents.startedAt);
  const claimed = await db
    .update(processedStripeEvents)
    .set({
      status: "processing",
      startedAt: now,
      processedAt: null,
      lastError: null,
      attemptCount: (existing.attemptCount ?? 0) + 1,
      eventType: event.type,
      stripeCreated: stripeEventCreatedAt(event),
    })
    .where(and(
      eq(processedStripeEvents.eventId, event.id),
      eq(processedStripeEvents.status, existing.status),
      startedAtCondition,
    ))
    .returning({ eventId: processedStripeEvents.eventId });

  if (claimed.length === 0) {
    return "in_flight";
  }

  return "claimed";
}

export async function markStripeEventSucceeded(event: Stripe.Event): Promise<void> {
  await db
    .update(processedStripeEvents)
    .set({
      status: "succeeded",
      processedAt: new Date(),
      lastError: null,
      eventType: event.type,
    })
    .where(eq(processedStripeEvents.eventId, event.id));
}

export async function markStripeEventFailed(event: Stripe.Event, error: unknown): Promise<void> {
  await db
    .update(processedStripeEvents)
    .set({
      status: "failed",
      processedAt: new Date(),
      lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      eventType: event.type,
    })
    .where(eq(processedStripeEvents.eventId, event.id));
}

export function isOlderThanStoredStripeEvent(
  existingSub: Pick<StoredSubscriptionState, "lastStripeEventCreatedAt"> | undefined | null,
  event: Stripe.Event,
): boolean {
  const lastCreatedAt = existingSub?.lastStripeEventCreatedAt;
  return Boolean(lastCreatedAt && lastCreatedAt.getTime() > stripeEventCreatedAt(event).getTime());
}

export function isOlderOrSameTimeAsStoredStripeEvent(
  existingSub: Pick<StoredSubscriptionState, "lastStripeEventCreatedAt"> | undefined | null,
  event: Stripe.Event,
): boolean {
  const lastCreatedAt = existingSub?.lastStripeEventCreatedAt;
  return Boolean(lastCreatedAt && lastCreatedAt.getTime() >= stripeEventCreatedAt(event).getTime());
}

export function stripeObjectId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return typeof value.id === "string" ? value.id : null;
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  return stripeObjectId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
}

export async function assertCheckoutOwnership({
  userId,
  sessionCustomerId,
  subscription,
  existingSub,
}: {
  userId: string;
  sessionCustomerId: string;
  subscription: Stripe.Subscription;
  existingSub?: StoredSubscriptionState | null;
}): Promise<void> {
  const subscriptionCustomerId = getSubscriptionCustomerId(subscription);
  if (subscriptionCustomerId !== sessionCustomerId) {
    throw new Error(`Stripe checkout ownership mismatch: session customer ${sessionCustomerId} != subscription customer ${subscriptionCustomerId}`);
  }

  if (existingSub?.stripeCustomerId && existingSub.stripeCustomerId !== sessionCustomerId) {
    throw new Error(`Stripe checkout ownership mismatch: stored customer ${existingSub.stripeCustomerId} != session customer ${sessionCustomerId}`);
  }

  const customer = await stripe.customers.retrieve(sessionCustomerId);
  if ("deleted" in customer && customer.deleted) {
    throw new Error(`Stripe checkout ownership mismatch: deleted customer ${sessionCustomerId}`);
  }
  if (customer.metadata?.userId !== userId) {
    throw new Error(`Stripe checkout ownership mismatch: customer metadata userId ${customer.metadata?.userId ?? "<missing>"} != ${userId}`);
  }
}
