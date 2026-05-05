import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions, userProfiles, processedStripeEvents } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { getPlanFromPriceId, type PlanType } from "@/lib/stripe/config";
import { updatePlanAllocation } from "@/lib/credits";
import { logError } from "@/lib/logger";

function isPostgresUniqueViolation(error: unknown): boolean {
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

function requirePlanFromPriceId(priceId: string, eventType: string): PlanType {
  const plan = getPlanFromPriceId(priceId);
  if (!plan) {
    throw new Error(`Unknown Stripe price id for ${eventType}: ${priceId}`);
  }
  return plan;
}

const STALE_WEBHOOK_PROCESSING_MS = 10 * 60 * 1000;

function stripeEventCreatedAt(event: Stripe.Event): Date {
  return typeof event.created === "number" ? new Date(event.created * 1000) : new Date();
}

function isSubscriptionEntitled(subscription: Stripe.Subscription): boolean {
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end;
  return (
    (subscription.status === "active" || subscription.status === "trialing") &&
    typeof periodEnd === "number" &&
    periodEnd * 1000 > Date.now()
  );
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return (invoice.parent?.subscription_details?.subscription as string | null)
    ?? (invoice as { subscription?: string | null }).subscription
    ?? null;
}

async function claimStripeEvent(event: Stripe.Event): Promise<"claimed" | "duplicate"> {
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

  if (!("status" in existing)) {
    return "duplicate";
  }

  if (existing.status === "succeeded") {
    return "duplicate";
  }

  const startedAt = existing.startedAt ?? existing.processedAt;
  const stale =
    !startedAt || now.getTime() - startedAt.getTime() > STALE_WEBHOOK_PROCESSING_MS;

  if (existing.status === "processing" && !stale) {
    return "duplicate";
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
    return "duplicate";
  }

  return "claimed";
}

async function markStripeEventSucceeded(event: Stripe.Event): Promise<void> {
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

async function markStripeEventFailed(event: Stripe.Event, error: unknown): Promise<void> {
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

async function downgradeSubscriptionToFree(subscriptionId: string, status: string): Promise<void> {
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  await db
    .update(subscriptions)
    .set({
      status,
      cancelAtPeriodEnd: status === "canceled" ? true : undefined,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  if (!existingSub?.userId) {
    return;
  }

  await db
    .update(userProfiles)
    .set({
      plan: "free",
      planSelectedAt: new Date(),
    })
    .where(eq(userProfiles.userId, existingSub.userId));

  await updatePlanAllocation(existingSub.userId, "free");
}

async function restoreSubscriptionIfEntitled(subscriptionId: string, eventType: string): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
  const subscriptionItem = subscription.items.data[0];
  if (!subscriptionItem || !isSubscriptionEntitled(subscription)) {
    await downgradeSubscriptionToFree(subscriptionId, subscription.status);
    return;
  }

  const priceId = subscriptionItem.price.id;
  const plan = requirePlanFromPriceId(priceId, eventType);
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  await db
    .update(subscriptions)
    .set({
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

  if (!existingSub?.userId) {
    return;
  }

  await db
    .update(userProfiles)
    .set({
      plan,
      planSelectedAt: new Date(),
    })
    .where(eq(userProfiles.userId, existingSub.userId));

  await updatePlanAllocation(existingSub.userId, plan);
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logError("stripe-webhook-config", new Error("STRIPE_WEBHOOK_SECRET is not configured"));
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    logError("stripe-webhook-verify", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  try {
    const claim = await claimStripeEvent(event);
    if (claim === "duplicate") {
      console.info(`[Stripe Webhook] Duplicate event skipped: ${event.type}`);
      return NextResponse.json({ received: true });
    }
  } catch (error) {
    logError("stripe-webhook-idempotency-claim", error, { eventId: event.id, eventType: event.type });
    return NextResponse.json(
      { error: "Webhook idempotency claim failed" },
      { status: 500 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;

        if (userId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          ) as Stripe.Subscription;

          const subscriptionItem = subscription.items.data[0];
          const priceId = subscriptionItem.price.id;
          const newPlan = requirePlanFromPriceId(priceId, event.type);

          // Use batch to ensure atomicity of subscription + profile + credit updates
          const [existingSub] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .limit(1);

          if (existingSub) {
            await db.transaction(async (tx) => {
              await tx
                .update(subscriptions)
                .set({
                  stripeCustomerId: session.customer as string,
                  stripeSubscriptionId: subscription.id,
                  stripePriceId: priceId,
                  status: subscription.status,
                  currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
                  cancelAtPeriodEnd: subscription.cancel_at_period_end,
                  updatedAt: new Date(),
                })
                .where(eq(subscriptions.userId, userId));
              await tx
                .update(userProfiles)
                .set({
                  plan: newPlan,
                  planSelectedAt: new Date(),
                })
                .where(eq(userProfiles.userId, userId));
            });
          } else {
            await db.transaction(async (tx) => {
              await tx.insert(subscriptions).values({
                id: crypto.randomUUID(),
                userId,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: subscription.id,
                stripePriceId: priceId,
                status: subscription.status,
                currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              await tx
                .update(userProfiles)
                .set({
                  plan: newPlan,
                  planSelectedAt: new Date(),
                })
                .where(eq(userProfiles.userId, userId));
            });
          }

          // Update credit allocation (separate call since it has its own logic)
          await updatePlanAllocation(userId, newPlan);

          console.info(`[Stripe Webhook] checkout.session.completed: plan=${newPlan}`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionItem = subscription.items.data[0];

        const [existingSub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
          .limit(1);

        if (!subscriptionItem || !isSubscriptionEntitled(subscription)) {
          await db
            .update(subscriptions)
            .set({
              status: subscription.status,
              currentPeriodEnd: subscriptionItem?.current_period_end
                ? new Date(subscriptionItem.current_period_end * 1000)
                : undefined,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

          if (existingSub?.userId) {
            await db
              .update(userProfiles)
              .set({
                plan: "free",
                planSelectedAt: new Date(),
              })
              .where(eq(userProfiles.userId, existingSub.userId));

            await updatePlanAllocation(existingSub.userId, "free");
            console.info(`[Stripe Webhook] subscription.updated: downgraded to free`);
          }
          break;
        }

        const priceId = subscriptionItem.price.id;
        const newPlan = requirePlanFromPriceId(priceId, event.type);

        // Batch: update subscription record + user profile
        await db
          .update(subscriptions)
          .set({
            stripePriceId: priceId,
            status: subscription.status,
            currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

        if (existingSub?.userId) {
          await db
            .update(userProfiles)
            .set({
              plan: newPlan,
              planSelectedAt: new Date(),
            })
            .where(eq(userProfiles.userId, existingSub.userId));

          if (existingSub.stripePriceId !== priceId) {
            await updatePlanAllocation(existingSub.userId, newPlan);
            console.info(`[Stripe Webhook] subscription.updated: plan=${newPlan}`);
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await downgradeSubscriptionToFree(subscription.id, "canceled");
        console.info(`[Stripe Webhook] subscription.deleted: downgraded to free`);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          await downgradeSubscriptionToFree(subscriptionId, "past_due");
          logError("stripe-webhook-payment-failed", new Error("invoice.payment_failed"), { eventId: event.id, eventType: event.type });
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          await restoreSubscriptionIfEntitled(subscriptionId, event.type);
        }
        break;
      }
    }

    await markStripeEventSucceeded(event);
  } catch (error) {
    await markStripeEventFailed(event, error)
      .catch((markError) => {
        logError("stripe-webhook-failed-state", markError, { eventId: event.id, eventType: event.type });
      });
    logError("stripe-webhook-process", error, { eventId: event.id, eventType: event.type });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
