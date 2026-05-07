import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { notifications, subscriptions, userProfiles, processedStripeEvents } from "@/lib/db/schema";
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

function stripeObjectId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return typeof value.id === "string" ? value.id : null;
}

async function getInvoiceFromCharge(charge: Stripe.Charge): Promise<Stripe.Invoice | null> {
  const invoiceId = stripeObjectId((charge as { invoice?: string | Stripe.Invoice | null }).invoice);
  if (!invoiceId) {
    return null;
  }
  return stripe.invoices.retrieve(invoiceId) as Promise<Stripe.Invoice>;
}

async function getSubscriptionIdFromCharge(charge: Stripe.Charge): Promise<string | null> {
  const invoice = await getInvoiceFromCharge(charge);
  return invoice ? getInvoiceSubscriptionId(invoice) : null;
}

function isFullyRefundedCharge(charge: Stripe.Charge): boolean {
  return Boolean(charge.refunded) || charge.amount_refunded >= charge.amount;
}

async function notifyBillingStatus(
  userId: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId,
    guestId: null,
    type: "billing_status",
    title,
    message,
    data: data ?? null,
    isRead: false,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
  });
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

async function applyBillingHoldForDispute(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = stripeObjectId(dispute.charge as string | Stripe.Charge | null | undefined);
  if (!chargeId) {
    return;
  }

  const charge = await stripe.charges.retrieve(chargeId) as Stripe.Charge;
  const subscriptionId = await getSubscriptionIdFromCharge(charge);
  if (!subscriptionId) {
    return;
  }

  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  await db
    .update(subscriptions)
    .set({
      billingHoldStatus: "dispute",
      billingHoldReason: "支払いに関する確認中のため、AI機能のクレジット利用を一時停止しています。",
      billingHoldStripeDisputeId: dispute.id,
      billingHoldStartedAt: new Date(),
      billingHoldEndedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  if (existingSub?.userId) {
    await notifyBillingStatus(
      existingSub.userId,
      "お支払い状況を確認しています",
      "支払いに関する確認が発生したため、AI機能のクレジット利用を一時停止しています。確認が完了すると再開されます。",
      { kind: "dispute_created" },
    );
  }
}

async function clearBillingHoldForDispute(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = stripeObjectId(dispute.charge as string | Stripe.Charge | null | undefined);
  if (!chargeId) {
    return;
  }

  const charge = await stripe.charges.retrieve(chargeId) as Stripe.Charge;
  const subscriptionId = await getSubscriptionIdFromCharge(charge);
  if (!subscriptionId) {
    return;
  }

  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (dispute.status === "won") {
    if (!existingSub?.userId || existingSub.billingHoldStripeDisputeId !== dispute.id) {
      return;
    }

    await db
      .update(subscriptions)
      .set({
        billingHoldStatus: "none",
        billingHoldReason: null,
        billingHoldEndedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptions.stripeSubscriptionId, subscriptionId),
        eq(subscriptions.billingHoldStripeDisputeId, dispute.id),
      ));

    await notifyBillingStatus(
      existingSub.userId,
      "お支払い状況の確認が完了しました",
      "支払いに関する確認が完了しました。AI機能のクレジット利用を再開できます。",
      { kind: "dispute_won" },
    );
    return;
  }

  if (!existingSub?.userId || existingSub.billingHoldStripeDisputeId !== dispute.id) {
    return;
  }

  if (dispute.status !== "lost") {
    await db
      .update(subscriptions)
      .set({
        billingHoldStatus: "none",
        billingHoldReason: null,
        billingHoldEndedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptions.stripeSubscriptionId, subscriptionId),
        eq(subscriptions.billingHoldStripeDisputeId, dispute.id),
      ));

    await notifyBillingStatus(
      existingSub.userId,
      "お支払い状況の確認が完了しました",
      "支払いに関する確認が完了しました。現在のプランは継続されます。",
      { kind: "dispute_closed_no_plan_change", status: dispute.status },
    );
    return;
  }

  await downgradeSubscriptionToFree(subscriptionId, "dispute_lost");
  await db
    .update(subscriptions)
    .set({
      billingHoldStatus: "none",
      billingHoldReason: null,
      billingHoldEndedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(subscriptions.stripeSubscriptionId, subscriptionId),
      eq(subscriptions.billingHoldStripeDisputeId, dispute.id),
    ));

  await notifyBillingStatus(
    existingSub.userId,
    "お支払い確認の結果を反映しました",
    "支払いに関する確認結果に基づき、プランをFreeに変更しました。",
    { kind: "dispute_lost" },
  );
}

async function handleRefundedCharge(charge: Stripe.Charge): Promise<void> {
  const invoice = await getInvoiceFromCharge(charge);
  if (!invoice) {
    return;
  }

  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return;
  }

  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!existingSub?.userId) {
    return;
  }

  if (!isFullyRefundedCharge(charge)) {
    await notifyBillingStatus(
      existingSub.userId,
      "返金を受け付けました",
      "一部返金を確認しました。現在のプランは継続されます。",
      { kind: "partial_refund" },
    );
    return;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
  const latestInvoiceId = stripeObjectId(
    (stripeSubscription as { latest_invoice?: string | Stripe.Invoice | null }).latest_invoice,
  );
  if (latestInvoiceId !== invoice.id) {
    await notifyBillingStatus(
      existingSub.userId,
      "返金を受け付けました",
      "過去の請求に対する返金を確認しました。現在のプランは継続されます。",
      { kind: "full_refund_no_plan_change" },
    );
    return;
  }

  await downgradeSubscriptionToFree(subscriptionId, "refunded");
  await notifyBillingStatus(
    existingSub.userId,
    "返金を反映しました",
    "返金処理に伴い、プランをFreeに変更しました。",
    { kind: "full_refund" },
  );
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
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleRefundedCharge(charge);
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        await applyBillingHoldForDispute(dispute);
        break;
      }
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        await clearBillingHoldForDispute(dispute);
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
